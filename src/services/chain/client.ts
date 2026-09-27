import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';

import { isMock } from '@/config/env';
import { chain, tokenMeta, type TokenSymbol } from './config';
import { ERC20_ABI } from './erc20';
import type { Address, ChainClient, FeeEstimate, PaymentIntent, TokenBalance } from './types';

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
    ALLI: parseUnits('12480.5', 18),
    USDT: parseUnits('1090', 18),
    BNB: parseUnits('0.014', 18),
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
    return { hash: mockHash() };
  }

  async payIntent(intent: PaymentIntent) {
    const value = BigInt(intent.amount);
    if (value > this.balances[intent.symbol]) throw new Error(`Not enough ${intent.symbol}.`);
    if (intent.deadline * 1000 < Date.now()) throw new Error('This quote has expired. Try again.');
    this.balances[intent.symbol] -= value;
    return { hash: mockHash() };
  }
}

function mockHash(): string {
  return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
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

  /**
   * The read half is here so the flow is testable against a node; the two writes (approve, pay)
   * need the signer the custody decision provides. With a signer `s`:
   *
   *   const token = new Contract(intent.token, ERC20_ABI, s);
   *   if ((await token.allowance(intent.payer, intent.router)) < BigInt(intent.amount))
   *     await (await token.approve(intent.router, intent.amount)).wait();
   *   const router = new Contract(intent.router, PAYMENT_ROUTER_ABI, s);
   *   const tx = await router.pay([intent.id, intent.payer, intent.token, intent.amount,
   *     PAYMENT_KIND_CODE[intent.kind], intent.deadline], intent.signature);
   */
  async payIntent(intent: PaymentIntent): Promise<{ hash: string }> {
    const token = new Contract(intent.token, ERC20_ABI, this.provider);
    const balance = (await token.balanceOf!(intent.payer)) as bigint;
    if (balance < BigInt(intent.amount)) throw new Error(`Not enough ${intent.symbol}.`);
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
