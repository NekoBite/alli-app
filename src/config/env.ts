/**
 * Typed access to EXPO_PUBLIC_* variables. These are inlined into the bundle at
 * build time, so everything here is public — secrets belong on the backend.
 */

type Network = 'mainnet' | 'testnet';
type DataSource = 'mock' | 'live';

function str(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const network = str(process.env.EXPO_PUBLIC_CHAIN, 'testnet') as Network;
const dataSource = str(process.env.EXPO_PUBLIC_DATA_SOURCE, 'mock') as DataSource;

export const env = {
  apiUrl: str(process.env.EXPO_PUBLIC_API_URL, 'https://api.trilumi.xyz'),
  network: network === 'mainnet' ? 'mainnet' : 'testnet',
  rpcUrlOverride: process.env.EXPO_PUBLIC_BSC_RPC_URL?.trim() || undefined,
  alliAddressOverride: process.env.EXPO_PUBLIC_ALLI_ADDRESS?.trim() || undefined,
  /**
   * `mock` runs the whole app off in-memory fixtures — no backend, no chain.
   * That is the default so the scaffold is runnable on day one.
   */
  dataSource: dataSource === 'live' ? 'live' : 'mock',
} as const;

export const isMock = env.dataSource === 'mock';
