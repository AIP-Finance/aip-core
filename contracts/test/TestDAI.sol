// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestDAI is ERC20 {
    constructor(uint256 amountToMint) ERC20("Dai Stablecoin", "TestDAI") {
        _mint(msg.sender, amountToMint);
    }
}
