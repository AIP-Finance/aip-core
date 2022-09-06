// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAipBurnCallback {
    function aipBurnCallback(bytes calldata data) external returns (address);
}
