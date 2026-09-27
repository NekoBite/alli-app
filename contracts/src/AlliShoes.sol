// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AlliShoes
 * @notice NFT footwear for ALLI RUN. Each token has a tier; the backend reads an account's highest
 *         tier and applies its multiplier when the daily quest pays (src/features/run/shoes.ts).
 *
 *         Tiers are small integers, 1 = Leather, 2 = Silver, 3 = Gold today. `maxTier` can be raised
 *         to add one (the wireframes also draw a Bronze) without redeploying; the multiplier itself
 *         lives off chain with the rest of the reward rules.
 *
 *         Shoes start soulbound. A tradeable top tier lets one Gold be rented across many accounts
 *         for a day each, multiplying emission, so transfers stay off until the economics are ready
 *         for a secondary market (`setTransferable`). Minting and burning are always allowed.
 *
 *         Minting is the backend's job (MINTER_ROLE): the free Leather shoe at sign-up, and upgrades
 *         once the PaymentRouter reports the payment.
 */
contract AlliShoes is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public maxTier = 3;
    bool public transferable;
    uint256 public nextId = 1;
    string private baseUri;

    mapping(uint256 tokenId => uint8) public tierOf;
    mapping(address owner => mapping(uint8 tier => uint256)) public tierCount;

    event ShoeMinted(address indexed to, uint256 indexed tokenId, uint8 tier);
    event MaxTierChanged(uint8 maxTier);
    event TransferableChanged(bool transferable);

    error BadTier(uint8 tier);
    error Soulbound();

    constructor(address admin, address minter, string memory baseUri_) ERC721("ALLI Shoes", "SHOE") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        baseUri = baseUri_;
    }

    function mint(address to, uint8 tier) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (tier == 0 || tier > maxTier) revert BadTier(tier);
        tokenId = nextId++;
        tierOf[tokenId] = tier;
        _safeMint(to, tokenId);
        emit ShoeMinted(to, tokenId, tier);
    }

    /// @notice An upgrade can retire the old shoe: the backend burns it when it mints the new one.
    function burn(uint256 tokenId) external onlyRole(MINTER_ROLE) {
        _burn(tokenId);
        delete tierOf[tokenId];
    }

    /// @notice The best tier `owner` holds, 0 if none.
    function highestTier(address owner) external view returns (uint8) {
        for (uint8 t = maxTier; t > 0; t--) {
            if (tierCount[owner][t] > 0) return t;
        }
        return 0;
    }

    function setMaxTier(uint8 tier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tier < maxTier) revert BadTier(tier); // never strand existing shoes above the ceiling
        maxTier = tier;
        emit MaxTierChanged(tier);
    }

    function setTransferable(bool on) external onlyRole(DEFAULT_ADMIN_ROLE) {
        transferable = on;
        emit TransferableChanged(on);
    }

    function setBaseURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseUri = uri;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseUri;
    }

    /// @dev Keeps `tierCount` in step on every mint, burn and transfer, and enforces soulbinding.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !transferable) revert Soulbound();
        uint8 tier = tierOf[tokenId];
        if (from != address(0)) tierCount[from][tier] -= 1;
        if (to != address(0)) tierCount[to][tier] += 1;
        return super._update(to, tokenId, auth);
    }
}
