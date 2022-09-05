// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./abstracts/Multicall.sol";
import "./base/AipPayments.sol";
import "./access/Ownable.sol";
import "./interfaces/IAipPoolDeployer.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IAipPool.sol";
import "./interfaces/IAipFactory.sol";
import "./interfaces/callback/IAipSubscribeCallback.sol";
import "./interfaces/callback/IAipExtendCallback.sol";
import "./libraries/CallbackValidation.sol";
import "./libraries/PoolAddress.sol";

contract AipPlanManager is
    Multicall,
    AipPayments,
    IAipSubscribeCallback,
    IAipExtendCallback
{
    address public immutable factory;
    uint256 private _nextId = 1;
    struct Plan {
        address investor;
        address token0;
        address token1;
        uint24 frequency;
        uint256 index;
        uint256 tickAmount;
        uint256 createdTime;
    }
    struct PlanStatistics {
        uint256 swapAmount0;
        uint256 swapAmount1;
        uint256 claimedAmount1;
        uint256 ticks;
        uint256 remainingTicks;
        uint256 startedTime;
        uint256 endedTime;
        uint256 lastTriggerTime;
    }
    mapping(uint256 => Plan) private _plans;

    mapping(address => uint256[]) public investorPlans;

    constructor(address _factory, address _WETH9) AipPayments(_WETH9) {
        factory = _factory;
    }

    struct SubscribeCallbackData {
        PoolAddress.PoolInfo poolInfo;
        address payer;
    }

    function aipSubscribeCallback(uint256 amount, bytes calldata data)
        external
        override
    {
        SubscribeCallbackData memory decoded = abi.decode(
            data,
            (SubscribeCallbackData)
        );
        CallbackValidation.verifyCallback(factory, decoded.poolInfo);
        pay(decoded.poolInfo.token0, decoded.payer, msg.sender, amount);
    }

    struct ExtendCallbackData {
        PoolAddress.PoolInfo poolInfo;
        address payer;
    }

    function aipExtendCallback(uint256 amount, bytes calldata data)
        external
        override
    {
        ExtendCallbackData memory decoded = abi.decode(
            data,
            (ExtendCallbackData)
        );
        CallbackValidation.verifyCallback(factory, decoded.poolInfo);
        pay(decoded.poolInfo.token0, decoded.payer, msg.sender, amount);
    }

    function plansOf(address addr) public view returns (uint256[] memory) {
        return investorPlans[addr];
    }

    function getPlan(uint256 planIndex)
        public
        view
        returns (Plan memory plan, PlanStatistics memory statistics)
    {
        plan = _plans[planIndex];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        (
            statistics.swapAmount1,
            statistics.claimedAmount1,
            statistics.ticks,
            statistics.remainingTicks,
            statistics.startedTime,
            statistics.endedTime,
            statistics.lastTriggerTime
        ) = pool.getPlanStatistics(plan.index);
    }

    function createPoolIfNecessary(PoolAddress.PoolInfo calldata poolInfo)
        external
        payable
        returns (address pool)
    {
        pool = IAipFactory(factory).getPool(
            poolInfo.token0,
            poolInfo.token1,
            poolInfo.frequency
        );
        if (pool == address(0)) {
            pool = IAipFactory(factory).createPool(
                poolInfo.token0,
                poolInfo.token1,
                poolInfo.frequency
            );
        }
    }

    struct SubscribeParams {
        address token0;
        address token1;
        uint24 frequency;
        uint256 tickAmount;
        uint256 periods;
    }

    function subscribe(SubscribeParams calldata params)
        external
        payable
        returns (uint256 id, IAipPool pool)
    {
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: params.token0,
            token1: params.token1,
            frequency: params.frequency
        });
        pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        uint256 index = pool.subscribe(
            msg.sender,
            params.tickAmount,
            params.periods,
            abi.encode(
                SubscribeCallbackData({poolInfo: poolInfo, payer: msg.sender})
            )
        );
        id = _nextId++;
        _plans[id] = Plan({
            investor: msg.sender,
            token0: params.token0,
            token1: params.token1,
            frequency: params.frequency,
            index: index,
            tickAmount: params.tickAmount,
            createdTime: block.timestamp
        });
        investorPlans[msg.sender].push(id);
    }

    function extend(uint256 id, uint256 periods) external payable {
        Plan memory plan = _plans[id];
        require(plan.index > 0, "Invalid plan");
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        pool.extend(
            msg.sender,
            plan.index,
            periods,
            abi.encode(
                ExtendCallbackData({poolInfo: poolInfo, payer: msg.sender})
            )
        );
    }

    function unsubscribe(uint256 id)
        external
        returns (uint256 received0, uint256 received1)
    {
        Plan memory plan = _plans[id];
        require(plan.index > 0, "Invalid plan");
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return pool.unsubscribe(msg.sender, plan.index);
    }

    function claim(uint256 id) external returns (uint256 received1) {
        Plan memory plan = _plans[id];
        require(plan.index > 0, "Invalid plan");
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return pool.claim(msg.sender, plan.index);
    }

    function claimReward(uint256 id)
        external
        returns (
            address token,
            uint256 unclaimedAmount,
            uint256 claimedAmount
        )
    {
        Plan memory plan = _plans[id];
        require(plan.index > 0, "Invalid plan");
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return pool.claimReward(msg.sender, plan.index);
    }
}
