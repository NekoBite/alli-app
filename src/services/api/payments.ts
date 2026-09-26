import { isMock } from '@/config/env';
import { chain, chainClient, tokenMeta, type PaymentIntent } from '@/services/chain';
import { delay, request } from './client';

/**
 * What the server is asked to quote. The server prices it (the app's numbers are previews), binds
 * it to the signed-in member's wallet and a deadline, and signs it with its quote key.
 */
export type IntentRequest =
  | { kind: 'runs'; runs: number; currency: 'ALLI' | 'USDT' }
  | { kind: 'membership'; currency: 'ALLI' | 'USDT' }
  | { kind: 'seed'; seedId: string }
  | { kind: 'shoe'; tier: string; currency: 'ALLI' | 'USDT' }
  | { kind: 'order'; orderId: string };

export type IntentStatus = {
  id: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  txHash?: string;
};

export interface PaymentsApi {
  createIntent(input: IntentRequest): Promise<PaymentIntent>;
  getIntent(id: string): Promise<IntentStatus>;
}

const live: PaymentsApi = {
  createIntent: (input) => request('/v1/payments/intents', { method: 'POST', body: input }),
  getIntent: (id) => request(`/v1/payments/intents/${encodeURIComponent(id)}`),
};

const MOCK_PAYER = '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01';
const MOCK_ROUTER = '0x000000000000000000000000000000000000A11E';
const mockStatus = new Map<string, IntentStatus>();

/** Mock quotes: a flat price per kind, enough to exercise the flow and the balance checks. */
function mockQuote(input: IntentRequest): { symbol: 'ALLI' | 'USDT'; amount: number } {
  switch (input.kind) {
    case 'runs':
      return { symbol: input.currency, amount: input.currency === 'ALLI' ? input.runs * 9 : input.runs * (25 / 30) };
    case 'membership':
      return { symbol: input.currency, amount: input.currency === 'ALLI' ? 250 : 25 };
    case 'shoe':
      return { symbol: input.currency, amount: input.currency === 'ALLI' ? 5000 : 100 };
    case 'seed':
    case 'order':
      return { symbol: 'ALLI', amount: 1 };
  }
}

const mock: PaymentsApi = {
  async createIntent(input) {
    const { symbol, amount } = mockQuote(input);
    const { decimals, address } = tokenMeta(symbol);
    const raw = BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals - 6);
    const id = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    mockStatus.set(id, { id, status: 'pending' });
    return delay<PaymentIntent>({
      id,
      kind: input.kind,
      payer: MOCK_PAYER,
      symbol,
      token: address ?? '0x0000000000000000000000000000000000000000',
      amount: raw.toString(),
      formatted: amount.toString(),
      router: MOCK_ROUTER,
      deadline: Math.floor(Date.now() / 1000) + 600,
      signature: '0x',
    }, 300);
  },
  getIntent: (id) => delay(mockStatus.get(id) ?? { id, status: 'failed' as const }, 300),
};

export const paymentsApi: PaymentsApi = isMock ? mock : live;

/** How long to wait for the server's chain watcher before giving up on this screen. BSC blocks are ~3 s. */
const CONFIRM_TIMEOUT_MS = 90_000;
const POLL_MS = 3_000;

/**
 * The whole purchase: quote → sign and send → wait for the server to see it on chain.
 *
 * Nothing is granted by this function. Fulfilment (credits, a planted tree, a paid order) happens
 * server-side when the watcher sees the `Paid` event; the caller re-reads its state afterwards.
 * A timeout is not a failure: the payment may still confirm, and the purchase will show up.
 */
export async function payIntent(input: IntentRequest): Promise<{ intent: PaymentIntent; txHash: string }> {
  const intent = await paymentsApi.createIntent(input);
  if (intent.router.toLowerCase() === '0x0000000000000000000000000000000000000000' && !isMock) {
    throw new Error(`Payments are not open on ${chain.name} yet.`);
  }
  const { hash } = await chainClient().payIntent(intent);
  if (isMock) {
    mockStatus.set(intent.id, { id: intent.id, status: 'confirmed', txHash: hash });
    return { intent, txHash: hash };
  }

  const until = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < until) {
    const status = await paymentsApi.getIntent(intent.id);
    if (status.status === 'confirmed') return { intent, txHash: status.txHash ?? hash };
    if (status.status === 'failed' || status.status === 'expired') {
      throw new Error(status.status === 'expired' ? 'The quote expired before the payment landed.' : 'The payment failed on chain.');
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error('Payment sent — still waiting for confirmation. It will show in Wallet activity.');
}
