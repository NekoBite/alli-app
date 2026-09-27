// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title PaymentRouter
 * @notice The one door every in-app purchase goes through: run packs and membership (2.5), seeds
 *         (3.2), shoe upgrades, market orders (4.4).
 *
 *         The backend quotes a purchase as a signed EIP-712 intent — id, payer, token, amount, kind,
 *         deadline — and the payer submits it here. The contract checks the quote signature, that
 *         the caller is the payer, that the token is accepted, the deadline, and that the intent was
 *         never paid, then pulls exactly `amount` to the treasury and emits `Paid`. The backend's
 *         chain watcher fulfils on that event; nothing is granted on the phone's word.
 *
 *         Binding the amount into a signature is what makes client-side prices safe to show: a
 *         tampered app can display any price, but only the server's quote clears the contract.
 */
contract PaymentRouter is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant QUOTE_SIGNER_ROLE = keccak256("QUOTE_SIGNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 id,address payer,address token,uint256 amount,uint8 kind,uint256 deadline)"
    );

    /// @dev Mirrors PAYMENT_KIND_CODE in src/services/chain/types.ts.
    uint8 public constant KIND_RUNS = 1;
    uint8 public constant KIND_MEMBERSHIP = 2;
    uint8 public constant KIND_SEED = 3;
    uint8 public constant KIND_SHOE = 4;
    uint8 public constant KIND_ORDER = 5;

    struct PaymentIntent {
        bytes32 id;
        address payer;
        address token;
        uint256 amount;
        uint8 kind;
        uint256 deadline;
    }

    address public treasury;
    mapping(address token => bool) public acceptedToken;
    mapping(bytes32 id => bool) public paid;

    event Paid(bytes32 indexed id, address indexed payer, address indexed token, uint256 amount, uint8 kind);
    event TreasuryChanged(address treasury);
    event TokenAccepted(address indexed token, bool accepted);

    error AlreadyPaid(bytes32 id);
    error NotPayer();
    error QuoteExpired();
    error BadSignature();
    error TokenNotAccepted(address token);
    error ZeroAddress();

    constructor(address admin, address quoteSigner, address treasury_, address[] memory tokens)
        EIP712("ALLI PaymentRouter", "1")
    {
        if (treasury_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(QUOTE_SIGNER_ROLE, quoteSigner);
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
        for (uint256 i = 0; i < tokens.length; i++) {
            acceptedToken[tokens[i]] = true;
            emit TokenAccepted(tokens[i], true);
        }
    }

    function pay(PaymentIntent calldata intent, bytes calldata signature) external nonReentrant whenNotPaused {
        if (paid[intent.id]) revert AlreadyPaid(intent.id);
        if (msg.sender != intent.payer) revert NotPayer();
        if (block.timestamp > intent.deadline) revert QuoteExpired();
        if (!acceptedToken[intent.token]) revert TokenNotAccepted(intent.token);

        address signer = ECDSA.recover(hashIntent(intent), signature);
        if (!hasRole(QUOTE_SIGNER_ROLE, signer)) revert BadSignature();

        paid[intent.id] = true;
        IERC20(intent.token).safeTransferFrom(intent.payer, treasury, intent.amount);
        emit Paid(intent.id, intent.payer, intent.token, intent.amount, intent.kind);
    }

    function hashIntent(PaymentIntent calldata i) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(INTENT_TYPEHASH, i.id, i.payer, i.token, i.amount, i.kind, i.deadline))
        );
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function setAcceptedToken(address token, bool accepted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        acceptedToken[token] = accepted;
        emit TokenAccepted(token, accepted);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
