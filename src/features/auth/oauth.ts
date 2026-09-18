import {
  makeRedirectUri,
  ResponseType,
  useAuthRequest,
  type AuthRequestConfig,
  type DiscoveryDocument,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef } from 'react';

import { env, isMock } from '@/config/env';
import type { OAuthCode, OAuthProvider } from '@/services/api';

// Lets the browser tab close itself after the provider redirects back.
WebBrowser.maybeCompleteAuthSession();

type ProviderSetup = {
  label: string;
  clientId?: string;
  discovery: DiscoveryDocument;
  scopes: string[];
  redirectUri: string;
  extraParams?: Record<string, string>;
};

/**
 * Authorization code with PKCE for every provider, then the code goes to the
 * server. The server holds the client secret and does the exchange, so no
 * provider token is ever on the phone and the server can be sure which app
 * the code was issued to.
 */
function setupFor(provider: OAuthProvider): ProviderSetup {
  switch (provider) {
    case 'google':
      return {
        label: 'Google',
        clientId: env.oauth.google.clientId,
        discovery: {
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
        },
        scopes: ['openid', 'email', 'profile'],
        redirectUri: makeRedirectUri({
          scheme: env.oauth.google.redirectScheme ?? 'alli',
          path: env.oauth.google.redirectScheme ? undefined : 'oauth/google',
        }),
        // Google only returns a code to a native client with these.
        extraParams: { access_type: 'offline', prompt: 'select_account' },
      };
    case 'facebook':
      return {
        label: 'Facebook',
        clientId: env.oauth.facebook.appId,
        discovery: {
          authorizationEndpoint: 'https://www.facebook.com/v19.0/dialog/oauth',
          tokenEndpoint: 'https://graph.facebook.com/v19.0/oauth/access_token',
        },
        scopes: ['public_profile', 'email'],
        redirectUri: makeRedirectUri({
          native: env.oauth.facebook.appId ? `fb${env.oauth.facebook.appId}://authorize` : undefined,
          scheme: 'alli',
          path: 'oauth/facebook',
        }),
      };
    case 'x':
      return {
        label: 'X',
        clientId: env.oauth.x.clientId,
        discovery: {
          authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
          tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
        },
        scopes: ['tweet.read', 'users.read'],
        redirectUri: makeRedirectUri({ scheme: 'alli', path: 'oauth/x' }),
      };
  }
}

export type OAuthButton = {
  label: string;
  /** False when no client id is configured (and the app is not in mock mode). */
  available: boolean;
  /** Opens the consent screen. Resolves once the code has been handed on, or the user backed out. */
  prompt: () => Promise<void>;
};

/**
 * One provider's sign-in button. `onCode` is called with what the server
 * needs; the caller sends it and owns the session that comes back.
 */
export function useOAuth(provider: OAuthProvider, onCode: (code: OAuthCode) => Promise<void>): OAuthButton {
  const setup = setupFor(provider);
  const config: AuthRequestConfig = {
    clientId: setup.clientId ?? 'unconfigured',
    scopes: setup.scopes,
    redirectUri: setup.redirectUri,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: setup.extraParams,
  };
  const [request, response, promptAsync] = useAuthRequest(config, setup.discovery);

  const latest = useRef(onCode);
  useEffect(() => {
    latest.current = onCode;
  }, [onCode]);

  const handled = useRef<typeof response>(null);
  useEffect(() => {
    if (!response || response === handled.current) return;
    handled.current = response;
    if (response.type !== 'success' || !request?.codeVerifier) return;
    const code = response.params.code;
    if (!code) return;
    void latest.current({
      provider,
      code,
      codeVerifier: request.codeVerifier,
      redirectUri: setup.redirectUri,
    });
  }, [response, request, provider, setup.redirectUri]);

  const prompt = useCallback(async () => {
    if (isMock) {
      // No provider in mock mode: the mock API mints a demo session.
      await latest.current({ provider, code: 'mock', codeVerifier: 'mock', redirectUri: setup.redirectUri });
      return;
    }
    await promptAsync();
  }, [provider, promptAsync, setup.redirectUri]);

  return {
    label: setup.label,
    available: isMock || (!!setup.clientId && !!request),
    prompt,
  };
}
