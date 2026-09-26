import { isMock } from '@/config/env';
import type { CardTransaction, VisaCard } from '@/features/wallet/types';
import { delay, request } from './client';

/**
 * Card issuing is never done by this app. A licensed issuer or BIN sponsor runs
 * KYC, holds the fiat float, and owns the PAN; the app only shows status and
 * sends instructions. Concretely:
 *
 *  - KYC happens in the issuer's SDK or hosted flow. No document ever touches
 *    this codebase.
 *  - The full card number, CVV and PIN are fetched by the issuer's own secure
 *    component. `last4` is the most this app should ever hold.
 *  - Freeze/unfreeze and top-up are instructions to the issuer's API, proxied
 *    through the backend so the issuer's API key is never in the bundle.
 *
 * TODO: pick the issuing partner and replace these endpoints with theirs.
 */
export interface CardApi {
  getCard(): Promise<VisaCard | undefined>;
  getCardTransactions(): Promise<CardTransaction[]>;
  /** Kicks off KYC. Returns the card in whatever state the issuer reports. */
  startApplication(): Promise<VisaCard>;
  setFrozen(frozen: boolean): Promise<VisaCard>;
  /** Converts ALLI/USDT into spendable fiat on the card. */
  topUp(amountUsd: number, from: 'ALLI' | 'USDT'): Promise<VisaCard>;
  /** Which token tops the card up at swipe time. */
  setFundingToken(token: 'ALLI' | 'USDT'): Promise<VisaCard>;
}

const live: CardApi = {
  getCard: () => request('/v1/card'),
  getCardTransactions: () => request('/v1/card/transactions'),
  startApplication: () => request('/v1/card/apply', { method: 'POST' }),
  setFrozen: (frozen) => request('/v1/card/freeze', { method: 'POST', body: { frozen } }),
  topUp: (amountUsd, from) =>
    request('/v1/card/topup', { method: 'POST', body: { amountUsd, from } }),
  setFundingToken: (token) => request('/v1/card/funding', { method: 'POST', body: { token } }),
};

let mockCard: VisaCard | undefined = {
  id: 'card-mock-1',
  status: 'active',
  last4: '4417',
  expiry: '09/29',
  fundingToken: 'USDT',
  availableUsd: 128.4,
  frozen: false,
};

const mock: CardApi = {
  async setFundingToken(token) {
    if (!mockCard) throw new Error('No card on this account.');
    mockCard = { ...mockCard, fundingToken: token };
    return delay({ ...mockCard });
  },

  getCard: () => delay(mockCard ? { ...mockCard } : undefined),

  getCardTransactions: () =>
    delay<CardTransaction[]>([
      {
        id: 'ct-1',
        merchant: 'Sports Nutrition Co.',
        amountUsd: 24.9,
        timestamp: Date.now() - 3 * 3_600_000,
        status: 'settled',
      },
      {
        id: 'ct-2',
        merchant: 'Metro Coffee',
        amountUsd: 4.5,
        timestamp: Date.now() - 20 * 3_600_000,
        status: 'settled',
      },
      {
        id: 'ct-3',
        merchant: 'City Parking',
        amountUsd: 12,
        timestamp: Date.now() - 52 * 3_600_000,
        status: 'refunded',
      },
    ]),

  async startApplication() {
    mockCard = {
      id: `card-${Date.now()}`,
      status: 'kyc-pending',
      fundingToken: 'USDT',
      availableUsd: 0,
      frozen: false,
    };
    return delay({ ...mockCard }, 900);
  },

  async setFrozen(frozen) {
    if (!mockCard) throw new Error('No card on this account.');
    mockCard = { ...mockCard, frozen, status: frozen ? 'frozen' : 'active' };
    return delay({ ...mockCard }, 500);
  },

  async topUp(amountUsd) {
    if (!mockCard) throw new Error('No card on this account.');
    if (amountUsd <= 0) throw new Error('Enter an amount above zero.');
    mockCard = { ...mockCard, availableUsd: mockCard.availableUsd + amountUsd };
    return delay({ ...mockCard }, 900);
  },
};

export const cardApi: CardApi = isMock ? mock : live;
