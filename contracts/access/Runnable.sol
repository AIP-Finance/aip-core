//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Ownable.sol";

contract Runnable is Ownable {
    modifier whenRunning() {
        require(_isRunning, "Paused");
        _;
    }

    modifier whenNotRunning() {
        require(!_isRunning, "Running");
        _;
    }

    bool public _isRunning;

    constructor() {
        _isRunning = true;
    }

    function toggleRunning() external onlyOwner {
        _isRunning = !_isRunning;
    }
}
