// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestUSDC is ERC20 {
    constructor(uint256 amountToMint) ERC20("USD Coin", "TestUSDC") {
        _mint(msg.sender, amountToMint);
    }

    function decimals() public view override returns (uint8) {
        return 6;
    }
}
