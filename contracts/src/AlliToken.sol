// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title ALLI (BEP-20)
 * @notice Fixed supply, minted once to the treasury at deployment. There is no mint function:
 *         rewards are paid out of pre-funded floats (RewardClaim, ReferralPayout), so a bug in the
 *         reward math can at worst drain a float, never inflate the supply.
 * @dev    If ALLI is already live on BSC, skip this contract and point the others at that token.
 */
contract AlliToken is ERC20, ERC20Burnable, ERC20Permit {
    constructor(address treasury, uint256 supply) ERC20("ALLI", "ALLI") ERC20Permit("ALLI") {
        require(treasury != address(0), "ALLI: treasury is zero");
        _mint(treasury, supply);
    }
}
