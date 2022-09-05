// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAipExtendCallback {
    function aipExtendCallback(uint256 amount, bytes calldata data) external;
}
