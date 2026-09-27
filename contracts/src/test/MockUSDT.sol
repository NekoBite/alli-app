// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stand-in for BSC-USD (18 decimals on BSC). Free mint: never deploy to mainnet.
contract MockUSDT is ERC20 {
    constructor() ERC20("Test USDT", "USDT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
