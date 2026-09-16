import { env } from '@/config/env';

export type TokenSymbol = 'ALLI' | 'USDT' | 'BNB';

export type TokenMeta = {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  /** undefined = native coin (BNB), which has no contract. */
  address?: string;
  /** Not yet deployed — the app falls back to mock balances. */
  placeholder?: boolean;
};

export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: 'BNB';
  tokens: Record<TokenSymbol, TokenMeta>;
};

const BNB: TokenMeta = { symbol: 'BNB', name: 'BNB', decimals: 18 };

/**
 * BNB Smart Chain. USDT on BSC (BSC-USD) is 18 decimals, not the 6 it uses on
 * Ethereum/Tron — read decimals from the contract rather than hardcoding
 * anywhere new.
 */
export const CHAINS: Record<'mainnet' | 'testnet', ChainConfig> = {
  mainnet: {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.bnbchain.org',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    tokens: {
      BNB,
      USDT: {
        symbol: 'USDT',
        name: 'Binance-Peg BSC-USD',
        decimals: 18,
        address: '0x55d398326f99059fF775485246999027B3197955',
      },
      ALLI: {
        symbol: 'ALLI',
        name: 'Alli',
        decimals: 18,
        // TODO: set once the BEP-20 is deployed and verified on BscScan.
        address: undefined,
        placeholder: true,
      },
    },
  },
  testnet: {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeSymbol: 'BNB',
    tokens: {
      BNB,
      USDT: {
        symbol: 'USDT',
        name: 'Test USDT',
        decimals: 18,
        // TODO: point at your own test USDT deployment.
        address: undefined,
        placeholder: true,
      },
      ALLI: {
        symbol: 'ALLI',
        name: 'Alli (test)',
        decimals: 18,
        address: undefined,
        placeholder: true,
      },
    },
  },
};

function build(): ChainConfig {
  const base = CHAINS[env.network];
  const alli = env.alliAddressOverride
    ? { ...base.tokens.ALLI, address: env.alliAddressOverride, placeholder: false }
    : base.tokens.ALLI;

  return {
    ...base,
    rpcUrl: env.rpcUrlOverride ?? base.rpcUrl,
    tokens: { ...base.tokens, ALLI: alli },
  };
}

export const chain = build();

export function tokenMeta(symbol: TokenSymbol): TokenMeta {
  return chain.tokens[symbol];
}

export function explorerTxUrl(hash: string): string {
  return `${chain.explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${chain.explorerUrl}/address/${address}`;
}
