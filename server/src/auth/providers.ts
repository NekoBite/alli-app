import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';

export type Provider = 'google' | 'facebook' | 'x';

/** What every provider boils down to once the code has been exchanged. */
export type ProviderProfile = {
  provider: Provider;
  providerUserId: string;
  email: string | null;
  /** Only a verified email may link to an existing account; an unverified one would be an account takeover. */
  emailVerified: boolean;
  displayName: string | null;
};

export type CodeExchange = {
  provider: Provider;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export interface ProviderClient {
  /** Whether the provider's credentials are configured. */
  available(provider: Provider): boolean;
  /** Exchanges the phone's authorization code and returns who signed in. */
  exchange(input: CodeExchange): Promise<ProviderProfile>;
}

/**
 * The exchange happens here, not on the phone: the client secret stays on the
 * server, and the provider's answer to our exchange is proof that the code
 * was issued to our app and not to something impersonating it.
 */
class HttpProviderClient implements ProviderClient {
  available(provider: Provider): boolean {
    switch (provider) {
      case 'google':
        return !!env.GOOGLE_CLIENT_ID;
      case 'facebook':
        return !!env.FACEBOOK_APP_ID && !!env.FACEBOOK_APP_SECRET;
      case 'x':
        return !!env.X_CLIENT_ID;
    }
  }

  async exchange(input: CodeExchange): Promise<ProviderProfile> {
    if (!this.available(input.provider)) {
      throw ApiError.unavailable(
        'oauth_unavailable',
        `Sign-in with ${input.provider} is not configured on this server.`,
      );
    }
    switch (input.provider) {
      case 'google':
        return this.google(input);
      case 'facebook':
        return this.facebook(input);
      case 'x':
        return this.x(input);
    }
  }

  private async google(input: CodeExchange): Promise<ProviderProfile> {
    const token = await postForm<{ id_token?: string }>('https://oauth2.googleapis.com/token', {
      code: input.code,
      client_id: env.GOOGLE_CLIENT_ID!,
      ...(env.GOOGLE_CLIENT_SECRET ? { client_secret: env.GOOGLE_CLIENT_SECRET } : {}),
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    });
    if (!token.id_token) throw rejected('google', 'no id_token in the token response');

    // Google validates the token's signature and expiry for us and echoes its
    // claims. The audience check is ours: a token minted for another app must
    // not open an account here.
    const info = await getJson<{
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
    }>(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`);
    if (info.aud !== env.GOOGLE_CLIENT_ID) throw rejected('google', 'token audience mismatch');
    if (!info.sub) throw rejected('google', 'no subject');
    return {
      provider: 'google',
      providerUserId: info.sub,
      email: info.email ?? null,
      emailVerified: info.email_verified === true || info.email_verified === 'true',
      displayName: info.name ?? null,
    };
  }

  private async facebook(input: CodeExchange): Promise<ProviderProfile> {
    const query = new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID!,
      client_secret: env.FACEBOOK_APP_SECRET!,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    });
    const token = await getJson<{ access_token?: string }>(
      `https://graph.facebook.com/v19.0/oauth/access_token?${query}`,
    );
    if (!token.access_token) throw rejected('facebook', 'no access token');

    const me = await getJson<{ id?: string; name?: string; email?: string }>(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(token.access_token)}`,
    );
    if (!me.id) throw rejected('facebook', 'no user id');
    return {
      provider: 'facebook',
      providerUserId: me.id,
      email: me.email ?? null,
      // Facebook only returns an email it has verified.
      emailVerified: !!me.email,
      displayName: me.name ?? null,
    };
  }

  private async x(input: CodeExchange): Promise<ProviderProfile> {
    const headers: Record<string, string> = {};
    const body: Record<string, string> = {
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    };
    if (env.X_CLIENT_SECRET) {
      headers.Authorization = `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}`;
    } else {
      body.client_id = env.X_CLIENT_ID!;
    }
    const token = await postForm<{ access_token?: string }>('https://api.twitter.com/2/oauth2/token', body, headers);
    if (!token.access_token) throw rejected('x', 'no access token');

    const me = await getJson<{ data?: { id?: string; name?: string; username?: string } }>(
      'https://api.twitter.com/2/users/me?user.fields=name',
      { Authorization: `Bearer ${token.access_token}` },
    );
    if (!me.data?.id) throw rejected('x', 'no user id');
    return {
      provider: 'x',
      providerUserId: me.data.id,
      // X does not release email addresses through OAuth 2.0.
      email: null,
      emailVerified: false,
      displayName: me.data.name ?? (me.data.username ? `@${me.data.username}` : null),
    };
  }
}

function rejected(provider: Provider, why: string): ApiError {
  return ApiError.badRequest('oauth_rejected', `Sign-in with ${provider} was not accepted (${why}).`);
}

async function postForm<T>(url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(form).toString(),
  });
  if (!response.ok) throw ApiError.badRequest('oauth_rejected', `The provider refused the code (${response.status}).`);
  return (await response.json()) as T;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!response.ok) throw ApiError.badRequest('oauth_rejected', `The provider refused the token (${response.status}).`);
  return (await response.json()) as T;
}

let client: ProviderClient = new HttpProviderClient();

export function providerClient(): ProviderClient {
  return client;
}

/** Tests swap in a stub; nothing else should. */
export function setProviderClient(next: ProviderClient): void {
  client = next;
}
