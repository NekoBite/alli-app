import { Contract, JsonRpcProvider, Wallet, parseUnits } from 'ethers';

import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';
import { signVoucher } from './signer.ts';

const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export type RelayerStatus =
  | { configured: false; reason: string }
  | { configured: true; address: string };

function missing(): string | null {
  if (!env.BSC_RPC_URL) return 'BSC_RPC_URL is not set';
  if (!env.ALLI_TOKEN_ADDRESS) return 'ALLI_TOKEN_ADDRESS is not set (the token is not deployed)';
  if (!env.RELAYER_PRIVATE_KEY) return 'RELAYER_PRIVATE_KEY is not set';
  return null;
}

let cached: { wallet: Wallet; token: Contract } | null = null;

function connect() {
  if (cached) return cached;

  const reason = missing();
  if (reason) {
    // Refused rather than faked. A redemption that "succeeds" without moving
    // tokens is worse than one that plainly cannot run yet.
    throw ApiError.unavailable('redemption_unavailable', `Redemption is not available yet: ${reason}.`);
  }

  const provider = new JsonRpcProvider(env.BSC_RPC_URL);
  const wallet = new Wallet(env.RELAYER_PRIVATE_KEY!, provider);
  const token = new Contract(env.ALLI_TOKEN_ADDRESS!, ERC20_TRANSFER_ABI, wallet);
  cached = { wallet, token };
  return cached;
}

export function relayerStatus(): RelayerStatus {
  const reason = missing();
  if (reason) return { configured: false, reason };
  return { configured: true, address: new Wallet(env.RELAYER_PRIVATE_KEY!).address };
}

/** Throws ApiError(503) when the chain side is not configured. Call before debiting points. */
export function assertRedemptionAvailable(): void {
  connect();
}

/**
 * Sends ALLI from the treasury wallet to the user.
 *
 * Deliberately *not* a mint: the relayer holds a float that has to be topped up,
 * which caps the blast radius of a bug in the reward math at the float's
 * balance rather than at the token's total supply.
 *
 * Returns as soon as the transaction is accepted by the node. Confirmation is
 * the reconciler's job — blocking a mobile request on block time would leave
 * the user staring at a spinner for seconds at best.
 */
export async function sendAlli(to: string, amount: string): Promise<{ hash: string }> {
  const { token } = connect();

  const decimals = Number(await token.decimals!());
  const value = parseUnits(amount, decimals);

  // The RewardClaim float lives in the contract, so the relayer wallet's balance is irrelevant there.
  if (env.REWARD_CLAIM_ADDRESS) return claimThroughContract(to, value);

  const balance = (await token.balanceOf!(await (await connect()).wallet.getAddress())) as bigint;
  if (balance < value) {
    throw ApiError.unavailable(
      'treasury_empty',
      'The reward treasury is temporarily out of funds. Your points have not been deducted.',
    );
  }

  const tx = await token.transfer!(to, value);
  return { hash: tx.hash as string };
}

const REWARD_CLAIM_ABI = [
  'function nonceOf(address user) view returns (uint256)',
  'function remainingToday() view returns (uint256)',
  'function claimFor(address user, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
];

/**
 * The RewardClaim path (contracts/src/RewardClaim.sol): sign a one-time voucher and submit it with
 * claimFor, so the member pays no gas and the contract's daily cap and nonce rules apply on top of
 * the server's. The float lives in the contract, not in the relayer wallet.
 *
 * Exchanges for one user are serialised by openExchange's row lock, and the route is rate-limited,
 * so two vouchers for the same nonce are not issued in practice. A voucher that still reverts on
 * chain (nonce race, cap reached between the check and the block) is a pending redemption whose
 * transaction failed: the reconciler's job, like any other failed transfer.
 */
async function claimThroughContract(to: string, value: bigint): Promise<{ hash: string }> {
  const { wallet } = connect();
  const claim = new Contract(env.REWARD_CLAIM_ADDRESS!, REWARD_CLAIM_ABI, wallet);
  const remaining = (await claim.remainingToday!()) as bigint;
  if (remaining < value) {
    throw ApiError.unavailable(
      'daily_cap_reached',
      "Today's exchange limit has been reached. Your stars have not been deducted — try again tomorrow.",
    );
  }
  const nonce = (await claim.nonceOf!(to)) as bigint;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const signature = await signVoucher({ user: to, amount: value, nonce, deadline });
  const tx = await claim.claimFor!(to, value, nonce, deadline, signature);
  return { hash: tx.hash as string };
}
