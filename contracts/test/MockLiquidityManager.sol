// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../base/AipPayments.sol";
import "../libraries/UniswapPoolAddress.sol";

// import "hardhat/console.sol";

contract MockLiquidityManager is AipPayments {
    address public immutable factory;

    struct MintCallbackData {
        UniswapPoolAddress.PoolKey poolKey;
        address payer;
    }

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external {
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));
        if (amount0Owed > 0)
            pay(decoded.poolKey.token0, decoded.payer, msg.sender, amount0Owed);
        if (amount1Owed > 0)
            pay(decoded.poolKey.token1, decoded.payer, msg.sender, amount1Owed);
    }

    constructor(address _factory, address _WETH9) AipPayments(_WETH9) {
        factory = _factory;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool) {
        if (token0 > token1) {
            (token0, token1) = (token1, token0);
        }
        pool = IUniswapV3Factory(factory).getPool(token0, token1, fee);

        if (pool == address(0)) {
            pool = IUniswapV3Factory(factory).createPool(token0, token1, fee);
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        } else {
            (uint160 sqrtPriceX96Existing, , , , , , ) = IUniswapV3Pool(pool)
                .slot0();
            if (sqrtPriceX96Existing == 0) {
                IUniswapV3Pool(pool).initialize(sqrtPriceX96);
            }
        }
    }

    struct AddLiquidityParams {
        address token0;
        address token1;
        uint24 fee;
        address recipient;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    function addLiquidity(AddLiquidityParams memory params)
        external
        payable
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            IUniswapV3Pool pool
        )
    {
        UniswapPoolAddress.PoolKey memory poolKey = UniswapPoolAddress
            .getPoolKey(params.token0, params.token1, params.fee);

        pool = IUniswapV3Pool(
            UniswapPoolAddress.computeAddress(factory, poolKey)
        );

        liquidity = params.liquidity * 1e18;

        (amount0, amount1) = pool.mint(
            params.recipient,
            params.tickLower,
            params.tickUpper,
            params.liquidity * 1e18,
            abi.encode(MintCallbackData({poolKey: poolKey, payer: msg.sender}))
        );
    }
}
