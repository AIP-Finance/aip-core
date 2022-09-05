// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor(uint256 amountToMint) ERC20("TestERC20", "TEST") {
        _mint(msg.sender, amountToMint);
    }
}
