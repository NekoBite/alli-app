import { ethers } from 'hardhat';
import type { TypedDataDomain } from 'ethers';

export const E18 = 10n ** 18n;
export const alli = (n: number | bigint) => BigInt(n) * E18;

export async function now(): Promise<number> {
  const block = await ethers.provider.getBlock('latest');
  return block!.timestamp;
}

export async function domain(contract: { getAddress(): Promise<string> }, name: string): Promise<TypedDataDomain> {
  const { chainId } = await ethers.provider.getNetwork();
  return { name, version: '1', chainId, verifyingContract: await contract.getAddress() };
}
