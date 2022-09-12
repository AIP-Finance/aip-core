// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library PoolAddress {
    bytes32 internal constant POOL_INIT_CODE_HASH =
        0x48234c6852e647754123806977aedaa77990009bbdc430692b9df2f278281126;

    struct PoolInfo {
        address token0;
        address token1;
        uint8 frequency;
    }

    function getPoolInfo(
        address token0,
        address token1,
        uint8 frequency
    ) internal pure returns (PoolInfo memory) {
        return PoolInfo({token0: token0, token1: token1, frequency: frequency});
    }

    function computeAddress(address factory, PoolInfo memory poolInfo)
        internal
        pure
        returns (address pool)
    {
        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(
                                abi.encode(
                                    poolInfo.token0,
                                    poolInfo.token1,
                                    poolInfo.frequency
                                )
                            ),
                            POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );
    }
}
