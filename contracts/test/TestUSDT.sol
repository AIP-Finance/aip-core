// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestUSDT is ERC20 {
    uint256 mintedAmount;
    mapping(address => bool) mintedAddresses;

    constructor(uint256 amountToMint) ERC20("TestUSDT", "testUSDT") {
        _mint(msg.sender, amountToMint);
    }

    function mint() external {
        require(mintedAddresses[msg.sender] == false, "Already minted");
        require(mintedAmount <= 1000000 * 1e18, "Reach limit");
        mintedAddresses[msg.sender] = true;
        mintedAmount += 1000 * 1e18;
        _mint(msg.sender, 1000 * 1e18);
    }
}
