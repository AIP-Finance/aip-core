// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IERC721Access {
    function getTokenId(
        address token0,
        address token1,
        uint24 frequency,
        uint256 planIndex
    ) external view returns (uint256);

    function isLocked(uint256 tokenId) external view returns (bool);
}
