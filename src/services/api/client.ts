import { env } from '@/config/env';
import { secure, SECURE_KEYS } from '@/services/storage/secure';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (sign-in, public catalogue). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

/**
 * Thin typed fetch wrapper. Every call goes through here so auth, error shape
 * and the base URL are defined once.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = await secure.get(SECURE_KEYS.session);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message =
      (detail as { message?: string } | null)?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status, (detail as { code?: string } | null)?.code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Simulated network latency so mock mode exercises real loading states. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
