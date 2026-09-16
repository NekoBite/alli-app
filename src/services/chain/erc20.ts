/** Minimal BEP-20 (ERC-20 compatible) surface — read calls plus transfer. */
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;

/**
 * Claim contract the backend signs for. The app never mints; it presents a
 * server-signed voucher and the contract verifies the signature, the nonce and
 * the daily cap on-chain.
 *
 * TODO: replace with the real ABI once the contract is written and audited.
 */
export const REWARD_CLAIM_ABI = [
  'function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
  'function nonceOf(address user) view returns (uint256)',
  'event Claimed(address indexed user, uint256 amount, uint256 nonce)',
] as const;
