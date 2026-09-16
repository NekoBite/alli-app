import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';

import { isMock } from '@/config/env';
import { chain, tokenMeta, type TokenSymbol } from './config';
import { ERC20_ABI } from './erc20';
import type { Address, ChainClient, FeeEstimate, TokenBalance } from './types';

const SYMBOLS: TokenSymbol[] = ['ALLI', 'USDT', 'BNB'];

function toBalance(symbol: TokenSymbol, raw: bigint): TokenBalance {
  const { decimals } = tokenMeta(symbol);
  return {
    symbol,
    raw: raw.toString(),
    decimals,
    formatted: formatUnits(raw, decimals),
  };
}

/** In-memory chain. Lets every screen render with no RPC and no deployed token. */
export class MockChainClient implements ChainClient {
  private balances: Record<TokenSymbol, bigint> = {
    ALLI: parseUnits('1284.5', 18),
    USDT: parseUnits('42.17', 18),
    BNB: parseUnits('0.0413', 18),
  };

  async getBalance(_address: Address, symbol: TokenSymbol): Promise<TokenBalance> {
    return toBalance(symbol, this.balances[symbol]);
  }

  async getBalances(address: Address): Promise<TokenBalance[]> {
    return Promise.all(SYMBOLS.map((s) => this.getBalance(address, s)));
  }

  async estimateTransferFee(symbol: TokenSymbol): Promise<FeeEstimate> {
    const gasLimit = symbol === 'BNB' ? 21_000n : 65_000n;
    const gasPriceWei = 1_000_000_000n; // 1 gwei — BSC's usual floor.
    return {
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      bnb: formatUnits(gasLimit * gasPriceWei, 18),
    };
  }

  async transfer({ symbol, amount }: { to: Address; symbol: TokenSymbol; amount: string }) {
    const { decimals } = tokenMeta(symbol);
    const value = parseUnits(amount, decimals);
    if (value > this.balances[symbol]) throw new Error('Insufficient balance');
    this.balances[symbol] -= value;
    return { hash: `0xmock${Date.now().toString(16).padStart(60, '0')}` };
  }
}

/**
 * Real BSC client. The read path works today against any JSON-RPC endpoint.
 *
 * The write path deliberately throws: signing needs a key, and how the key is
 * held (in-app keystore vs. WalletConnect vs. an MPC provider) is a decision
 * that has to be made before any code touches it. See mobile/README.md.
 */
export class EthersChainClient implements ChainClient {
  private provider = new JsonRpcProvider(chain.rpcUrl, {
    chainId: chain.chainId,
    name: chain.name,
  });

  async getBalance(address: Address, symbol: TokenSymbol): Promise<TokenBalance> {
    const meta = tokenMeta(symbol);

    if (!meta.address) {
      if (symbol === 'BNB') {
        return toBalance(symbol, await this.provider.getBalance(address));
      }
      // Token not deployed on this network yet — report zero rather than throw.
      return toBalance(symbol, 0n);
    }

    const erc20 = new Contract(meta.address, ERC20_ABI, this.provider);
    const raw = (await erc20.balanceOf!(address)) as bigint;
    return toBalance(symbol, raw);
  }

  async getBalances(address: Address): Promise<TokenBalance[]> {
    return Promise.all(SYMBOLS.map((s) => this.getBalance(address, s)));
  }

  async estimateTransferFee(symbol: TokenSymbol): Promise<FeeEstimate> {
    const fee = await this.provider.getFeeData();
    const gasPriceWei = fee.gasPrice ?? 1_000_000_000n;
    const gasLimit = symbol === 'BNB' ? 21_000n : 65_000n;
    return {
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPriceWei.toString(),
      bnb: formatUnits(gasLimit * gasPriceWei, 18),
    };
  }

  async transfer(): Promise<{ hash: string }> {
    throw new Error(
      'Signing is not wired up. Choose a key-custody model first (see mobile/README.md).',
    );
  }
}

let client: ChainClient | undefined;

export function chainClient(): ChainClient {
  client ??= isMock ? new MockChainClient() : new EthersChainClient();
  return client;
}
