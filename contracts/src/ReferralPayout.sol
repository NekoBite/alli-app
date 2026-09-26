// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ReferralPayout
 * @notice Pays referral commissions (docs/referral-programs.md) as a cumulative Merkle distributor.
 *
 *         The split — rates per generation, qualification, roll-up, treasury share — is computed off
 *         chain by the backend with the same module the app uses (src/features/referrals/rules.ts)
 *         and booked in a ledger. Periodically the backend publishes one Merkle root per token over
 *         every member's *cumulative* earnings: leaf = (account, token, cumulativeAmount).
 *
 *         A member (or the relayer, gas-free for them) claims `cumulative - alreadyClaimed`. Because
 *         amounts are cumulative, a new root never needs the old ones, a missed epoch costs nothing,
 *         and nothing can be claimed twice. Publishing a root is the only privileged act, and it can
 *         only move money the contract has been funded with.
 */
contract ReferralPayout is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Current root per payout token (USDT, ALLI).
    mapping(address token => bytes32) public merkleRoot;
    /// @notice Epoch counter per token, for off-chain bookkeeping.
    mapping(address token => uint256) public epoch;
    mapping(address token => mapping(address account => uint256)) public claimed;

    event RootPublished(address indexed token, uint256 indexed epoch, bytes32 root);
    event Claimed(address indexed token, address indexed account, uint256 amount, uint256 cumulative);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error BadProof();
    error NothingToClaim();

    constructor(address admin, address publisher) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(PUBLISHER_ROLE, publisher);
    }

    function publish(address token, bytes32 root) external onlyRole(PUBLISHER_ROLE) {
        merkleRoot[token] = root;
        uint256 e = ++epoch[token];
        emit RootPublished(token, e, root);
    }

    /// @notice Pays `account` everything owed up to `cumulative`. Callable by anyone; funds go to `account`.
    function claim(address token, address account, uint256 cumulative, bytes32[] calldata proof)
        external
        whenNotPaused
        returns (uint256 amount)
    {
        bytes32 leaf = leafFor(account, token, cumulative);
        if (!MerkleProof.verifyCalldata(proof, merkleRoot[token], leaf)) revert BadProof();
        uint256 already = claimed[token][account];
        if (cumulative <= already) revert NothingToClaim();
        amount = cumulative - already;
        claimed[token][account] = cumulative;
        IERC20(token).safeTransfer(account, amount);
        emit Claimed(token, account, amount, cumulative);
    }

    /// @notice Double-hashed leaf (OpenZeppelin StandardMerkleTree layout), so a leaf can never be
    ///         mistaken for an inner node.
    function leafFor(address account, address token, uint256 cumulative) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, token, cumulative))));
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function withdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }
}
