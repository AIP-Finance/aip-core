// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAipPool {
    event Trigger(
        uint256 tickIndex,
        uint256 amount0,
        uint256 amount1,
        uint256 triggerFee0,
        uint256 protocolFee0
    );

    event Subscribe(
        uint256 planIndex,
        address investor,
        uint256 tickAmount,
        uint256 startTick,
        uint256 endTick
    );

    event Extend(uint256 planIndex, uint256 oldEndTick, uint256 newEndTick);

    event Unsubscribe(uint256 planIndex, uint256 received0, uint256 received1);

    event Claim(uint256 planIndex, uint256 received1);

    event ClaimReward(
        uint256 planIndex,
        uint256 unclaimedAmount,
        uint256 claimedAmount
    );
    event DepositReward(uint256 amount);
    event InitReward(address token, address operator);
    event RewardOperatorChanged(
        address oldRewardOperator,
        address newRewardOperator
    );

    event SwapFeeChanged(
        uint24 oldSwapFee,
        uint24 oldSwapWETH9Fee,
        uint24 newSwapFee,
        uint24 newSwapWETH9Fee
    );
    event CollectProtocol(address requester, address receiver, uint256 amount);

    struct PlanInfo {
        uint256 index;
        address investor;
        uint256 tickAmount0;
        uint256 claimedAmount1;
        uint256 startTick;
        uint256 endTick;
        uint256 claimedRewardIndex;
        uint256 claimedRewardAmount;
    }

    struct RewardCycleInfo {
        uint256 tickIndexStart;
        uint256 tickIndexEnd;
        uint256 rewardAmount;
        uint256 paymentAmount0;
    }

    function factory() external view returns (address);

    function swapManager() external view returns (address);

    function WETH9() external view returns (address);

    function rewardToken() external view returns (address);

    function rewardOperator() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function frequency() external view returns (uint24);

    function swapFee() external view returns (uint24);

    function swapWETH9Fee() external view returns (uint24);

    function protocolFee() external view returns (uint256);

    function totalPaymentAmount0() external view returns (uint256);

    function plans(uint256)
        external
        view
        returns (
            uint256 index,
            address investor,
            uint256 tickAmount0,
            uint256 claimedAmount1,
            uint256 startTick,
            uint256 endTick,
            uint256 claimedRewardIndex,
            uint256 claimedRewardAmount
        );

    function rewardCycles(uint256)
        external
        view
        returns (
            uint256 tickIndexStart,
            uint256 tickIndexEnd,
            uint256 rewardAmount,
            uint256 paymentAmount0
        );

    function price() external view returns (uint256);

    function lastTrigger() external view returns (uint256 tick, uint256 time);

    function nextTickVolume()
        external
        view
        returns (uint256 index, uint256 amount0);

    function tickInfo(uint256 tick)
        external
        view
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 fee0,
            uint256 time
        );

    function lastRewardCycle()
        external
        view
        returns (uint256 index, RewardCycleInfo memory rewardCycle);

    function getPlanStatistics(uint256 planIndex)
        external
        view
        returns (
            uint256 swapAmount1,
            uint256 claimedAmount1,
            uint256 ticks,
            uint256 remainingTicks,
            uint256 startedTime,
            uint256 endedTime,
            uint256 lastTriggerTime
        );

    function subscribe(
        address investor,
        uint256 tickAmount0,
        uint256 totalAmount0,
        bytes calldata data
    ) external returns (uint256 index);

    function claim(address requester, uint256 planIndex)
        external
        returns (uint256 received1);

    function extend(
        address requester,
        uint256 planIndex,
        uint256 extendedAmount0,
        bytes calldata data
    ) external;

    function unsubscribe(address requester, uint256 planIndex)
        external
        returns (uint256 received0, uint256 received1);

    function trigger() external returns (uint256 amount0, uint256 amount1);

    function setSwapFee(uint24 _swapFee, uint24 _swapWETH9Fee)
        external
        returns (address swapPool, address swapWETH9Pool);

    function claimReward(address requester, uint256 planIndex)
        external
        returns (
            address token,
            uint256 unclaimedAmount,
            uint256 claimedAmount
        );

    function depositReward(uint256 amount) external;

    function initReward(address _rewardToken, address _rewardOperator) external;

    function changeRewardOperator(address _operator) external;

    function collectProtocol(address recipient, uint256 amountRequested)
        external
        returns (uint256 amount);
}
