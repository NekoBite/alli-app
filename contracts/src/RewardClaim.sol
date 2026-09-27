// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title RewardClaim
 * @notice Pays ALLI for stars the backend has already burned (wireframe 2.6, "Exchange stars").
 *
 *         The backend signs an EIP-712 voucher (user, amount, nonce, deadline). Anyone may submit
 *         it — the user, or the backend's relayer so the member pays no gas ("Network fee: covered
 *         by ALLI") — and the tokens always go to `user`, so relaying cannot redirect them.
 *
 *         Safety rails, each on chain:
 *         - `nonce` must equal `nonceOf[user]`: every voucher is single-use and ordered.
 *         - `deadline` bounds how long a leaked voucher is worth anything.
 *         - `dailyCap` bounds what the contract pays in one UTC day across all users, so a
 *           compromised signer drains at most one day's cap before someone pauses it.
 *         - The contract holds a float, topped up from the treasury; it cannot mint.
 */
contract RewardClaim is AccessControl, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address user,uint256 amount,uint256 nonce,uint256 deadline)");

    IERC20 public immutable token;

    mapping(address user => uint256) public nonceOf;

    /// @notice Most ALLI (in wei) paid per UTC day across every user. 0 = no claims at all.
    uint256 public dailyCap;
    uint256 public paidToday;
    uint256 public currentDay;

    event Claimed(address indexed user, uint256 amount, uint256 nonce);
    event DailyCapChanged(uint256 cap);
    event Withdrawn(address indexed to, uint256 amount);

    error VoucherExpired();
    error BadNonce(uint256 expected, uint256 got);
    error BadSignature();
    error DailyCapReached(uint256 remaining);
    error ZeroAmount();

    constructor(IERC20 token_, address admin, address signer, uint256 dailyCap_) EIP712("ALLI RewardClaim", "1") {
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
        dailyCap = dailyCap_;
        emit DailyCapChanged(dailyCap_);
    }

    /// @notice Claim a voucher issued to the caller.
    function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes calldata signature) external {
        _claim(msg.sender, amount, nonce, deadline, signature);
    }

    /// @notice Submit a voucher on the user's behalf. The ALLI still goes to `user`.
    function claimFor(address user, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata signature)
        external
    {
        _claim(user, amount, nonce, deadline, signature);
    }

    /// @notice What can still be paid today before the cap.
    function remainingToday() public view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 spent = today == currentDay ? paidToday : 0;
        return spent >= dailyCap ? 0 : dailyCap - spent;
    }

    /// @notice The digest a voucher signs, for off-chain tooling and tests.
    function hashClaim(address user, uint256 amount, uint256 nonce, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, user, amount, nonce, deadline)));
    }

    function setDailyCap(uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyCap = cap;
        emit DailyCapChanged(cap);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Move float back to the treasury (e.g. when retiring the contract).
    function withdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function _claim(address user, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata signature)
        private
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert VoucherExpired();
        uint256 expected = nonceOf[user];
        if (nonce != expected) revert BadNonce(expected, nonce);

        address signer = ECDSA.recover(hashClaim(user, amount, nonce, deadline), signature);
        if (!hasRole(SIGNER_ROLE, signer)) revert BadSignature();

        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            paidToday = 0;
        }
        uint256 remaining = dailyCap > paidToday ? dailyCap - paidToday : 0;
        if (amount > remaining) revert DailyCapReached(remaining);

        nonceOf[user] = expected + 1;
        paidToday += amount;
        token.safeTransfer(user, amount);
        emit Claimed(user, amount, nonce);
    }
}
