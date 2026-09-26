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
 * Claim contract the backend signs for (contracts/src/RewardClaim.sol). The app never mints; it
 * presents a server-signed EIP-712 voucher and the contract verifies the signer, the nonce, the
 * deadline and the daily cap on-chain.
 */
export const REWARD_CLAIM_ABI = [
  'function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
  'function nonceOf(address user) view returns (uint256)',
  'function remainingToday() view returns (uint256)',
  'event Claimed(address indexed user, uint256 amount, uint256 nonce)',
] as const;

/**
 * Payment router (contracts/src/PaymentRouter.sol). Every purchase — run packs, membership, seeds,
 * shoes, market orders — is a server-quoted, server-signed intent the payer submits here; the
 * contract pulls the tokens to the treasury and emits `Paid`, which the backend watches.
 */
export const PAYMENT_ROUTER_ABI = [
  'function pay((bytes32 id, address payer, address token, uint256 amount, uint8 kind, uint256 deadline) intent, bytes signature)',
  'function paid(bytes32 id) view returns (bool)',
  'event Paid(bytes32 indexed id, address indexed payer, address indexed token, uint256 amount, uint8 kind)',
] as const;

/** Shoe NFTs (contracts/src/AlliShoes.sol): one tier per token, read to show what an account holds. */
export const SHOES_ABI = [
  'function tierOf(uint256 tokenId) view returns (uint8)',
  'function highestTier(address owner) view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
] as const;
