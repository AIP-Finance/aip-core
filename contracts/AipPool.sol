// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./security/ReentrancyGuard.sol";
import "./interfaces/IAipPoolDeployer.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IAipPool.sol";
import "./interfaces/IAipFactory.sol";
import "./interfaces/IAipSwapManager.sol";

import "./interfaces/callback/IAipSubscribeCallback.sol";
import "./interfaces/callback/IAipExtendCallback.sol";
import "./libraries/TransferHelper.sol";

contract AipPool is IAipPool, ReentrancyGuard {
    address public immutable override factory;
    address public immutable override swapManager;
    address public immutable override WETH9;
    address public override rewardToken;
    address public override rewardOperator;
    address public immutable override token0;
    address public immutable override token1;
    uint24 public immutable override frequency;
    uint24 public override swapFee = 3000;
    uint24 public override swapWETH9Fee = 3000;
    uint24 private constant TIME_UNIT = 60;
    uint24 private constant PROCESSING_GAS = 400000;
    uint24 private constant PROTOCOL_FEE = 1000;
    uint256 private constant MIN_TICK_AMOUNT = 10 * 1e18;

    uint256 private _nextPlanIndex = 1;
    uint256 private _nextTickIndex = 1;
    uint256 private _nextRewardCycleIndex = 1;
    uint256 public override protocolFee;
    uint256 public override totalPaymentAmount0;
    mapping(uint256 => uint256) private _tickVolumes0;
    mapping(uint256 => uint256) private _tickVolumes1;
    mapping(uint256 => uint256) private _tickFees0;
    mapping(uint256 => uint256) private _tickTimes;
    mapping(uint256 => PlanInfo) public override plans;
    mapping(uint256 => RewardCycleInfo) public override rewardCycles;
    mapping(uint256 => uint256) private _tickCycles;

    constructor() {
        (
            factory,
            swapManager,
            WETH9,
            token0,
            token1,
            frequency
        ) = IAipPoolDeployer(msg.sender).parameters();
    }

    modifier onlyFactoryOwner() {
        require(msg.sender == IAipFactory(factory).owner());
        _;
    }

    modifier onlyRewardOperator() {
        require(msg.sender == rewardOperator);
        _;
    }

    function _getCurrentEndTick(uint256 endTick)
        private
        view
        returns (uint256)
    {
        return _nextTickIndex - 1 > endTick ? endTick : _nextTickIndex - 1;
    }

    function _getPlanAmount(
        uint256 tickAmount0,
        uint256 startTick,
        uint256 endTick
    ) private view returns (uint256 amount0, uint256 amount1) {
        uint256 currentEndTick = _getCurrentEndTick(endTick);
        mapping(uint256 => uint256) storage tickVolumes1 = _tickVolumes1;
        mapping(uint256 => uint256) storage tickVolumes0 = _tickVolumes0;
        for (uint256 i = startTick; i <= currentEndTick; i++) {
            amount0 += tickAmount0;
            amount1 += (tickVolumes1[i] * tickAmount0) / tickVolumes0[i];
        }
    }

    function balance0() private view returns (uint256) {
        (bool success, bytes memory data) = token0.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        require(success && data.length >= 32);
        return abi.decode(data, (uint256));
    }

    function balance1() private view returns (uint256) {
        (bool success, bytes memory data) = token1.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        require(success && data.length >= 32);
        return abi.decode(data, (uint256));
    }

    function balanceReward() private view returns (uint256) {
        (bool success, bytes memory data) = rewardToken.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        require(success && data.length >= 32);
        return abi.decode(data, (uint256));
    }

    function price() public view override returns (uint256) {
        return IAipSwapManager(swapManager).poolPrice(token0, token1, swapFee);
    }

    function lastTrigger()
        public
        view
        override
        returns (uint256 tick, uint256 time)
    {
        tick = _nextTickIndex - 1;
        time = _tickTimes[_nextTickIndex - 1];
    }

    function nextTickVolume()
        external
        view
        override
        returns (uint256 index, uint256 amount0)
    {
        index = _nextTickIndex;
        amount0 = _tickVolumes0[index];
    }

    function tickInfo(uint256 tick)
        external
        view
        override
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 fee0,
            uint256 time
        )
    {
        amount0 = _tickVolumes0[tick];
        amount1 = _tickVolumes1[tick];
        fee0 = _tickFees0[tick];
        time = _tickTimes[tick];
    }

    function lastRewardCycle()
        public
        view
        override
        returns (uint256 index, RewardCycleInfo memory rewardCycle)
    {
        index = _nextRewardCycleIndex - 1;
        rewardCycle = rewardCycles[index];
    }

    function getPlanStatistics(uint256 planIndex)
        external
        view
        override
        returns (
            uint256 swapAmount1,
            uint256 claimedAmount1,
            uint256 ticks,
            uint256 remainingTicks,
            uint256 startedTime,
            uint256 endedTime,
            uint256 lastTriggerTime
        )
    {
        PlanInfo memory plan = plans[planIndex];
        uint256 lastTriggerTick;
        (lastTriggerTick, lastTriggerTime) = lastTrigger();
        if (plan.endTick >= plan.startTick) {
            startedTime = _tickTimes[plan.startTick];
            (, swapAmount1) = _getPlanAmount(
                plan.tickAmount0,
                plan.startTick,
                plan.endTick
            );
            claimedAmount1 = plan.claimedAmount1;
            uint256 period = frequency * TIME_UNIT;
            if (plan.endTick > lastTriggerTick) {
                if (lastTriggerTime > 0) {
                    endedTime =
                        lastTriggerTime +
                        period *
                        (plan.endTick - lastTriggerTick);
                }
                remainingTicks = plan.endTick - lastTriggerTick;
            } else {
                endedTime = _tickTimes[plan.endTick];
            }
        }
        ticks = plan.endTick + 1 - plan.startTick;
    }

    function subscribe(
        address investor,
        uint256 tickAmount0,
        uint256 ticks,
        bytes calldata data
    ) external override nonReentrant returns (uint256 planIndex) {
        require(tickAmount0 >= MIN_TICK_AMOUNT, "Invalid tick amount");
        require(ticks > 0, "Invalid periods");
        planIndex = _nextPlanIndex++;
        PlanInfo storage plan = plans[planIndex];
        plan.index = planIndex;
        plan.investor = investor;
        plan.tickAmount0 = tickAmount0;
        plan.claimedAmount1 = 0;
        plan.startTick = _nextTickIndex;
        plan.endTick = _nextTickIndex + ticks - 1;
        mapping(uint256 => uint256) storage tickVolumes0 = _tickVolumes0;
        for (uint256 i = plan.startTick; i <= plan.endTick; i++) {
            tickVolumes0[i] += tickAmount0;
        }
        uint256 balance0Before = balance0();
        IAipSubscribeCallback(msg.sender).aipSubscribeCallback(
            ticks * tickAmount0,
            data
        );
        require(balance0Before + ticks * tickAmount0 <= balance0(), "S");
        emit Subscribe(
            plan.index,
            plan.investor,
            plan.tickAmount0,
            plan.startTick,
            plan.endTick
        );
    }

    function extend(
        address requester,
        uint256 planIndex,
        uint256 ticks,
        bytes calldata data
    ) external override nonReentrant {
        PlanInfo storage plan = plans[planIndex];
        require(plan.investor == requester, "Only owner");
        require(plan.endTick >= _nextTickIndex, "Finished");
        require(ticks > 0, "Invalid periods");
        uint256 oldEndTick = plan.endTick;
        plan.endTick = plan.endTick + ticks;
        for (uint256 i = oldEndTick + 1; i <= plan.endTick; i++) {
            _tickVolumes0[i] += plan.tickAmount0;
        }
        uint256 balance0Before = balance0();
        IAipExtendCallback(msg.sender).aipExtendCallback(
            ticks * plan.tickAmount0,
            data
        );
        require(balance0Before + ticks * plan.tickAmount0 <= balance0(), "E");
        emit Extend(planIndex, oldEndTick, plan.endTick);
    }

    function claim(address requester, uint256 planIndex)
        external
        override
        nonReentrant
        returns (uint256 received1)
    {
        PlanInfo storage plan = plans[planIndex];
        require(plan.investor == requester, "Only owner");
        (, uint256 amount1) = _getPlanAmount(
            plan.tickAmount0,
            plan.startTick,
            plan.endTick
        );
        received1 = amount1 - plan.claimedAmount1;
        plan.claimedAmount1 += received1;
        require(received1 > 0, "Nothing to claim");
        uint256 balance1Before = balance1();
        TransferHelper.safeTransfer(token1, plan.investor, received1);
        require(balance1Before - received1 <= balance1(), "C1");
        emit Claim(planIndex, received1);
    }

    function unsubscribe(address requester, uint256 planIndex)
        external
        override
        nonReentrant
        returns (uint256 received0, uint256 received1)
    {
        PlanInfo storage plan = plans[planIndex];
        require(plan.investor == requester, "Only owner");
        require(plan.endTick >= _nextTickIndex, "Finished");
        uint256 oldEndTick = plan.endTick;
        plan.endTick = _nextTickIndex - 1;
        received0 = plan.tickAmount0 * (oldEndTick - plan.endTick);

        if (plan.endTick >= plan.startTick) {
            (, uint256 amount1) = _getPlanAmount(
                plan.tickAmount0,
                plan.startTick,
                plan.endTick
            );
            received1 = amount1 - plan.claimedAmount1;
            plan.claimedAmount1 += received1;
        }

        mapping(uint256 => uint256) storage tickVolumes0 = _tickVolumes0;
        if (plan.endTick + 1 <= oldEndTick) {
            for (uint256 i = plan.endTick + 1; i <= oldEndTick; i++) {
                tickVolumes0[i] -= plan.tickAmount0;
            }
        }

        uint256 balance0Before = balance0();
        uint256 balance1Before = balance1();

        TransferHelper.safeTransfer(token0, plan.investor, received0);
        if (received1 > 0) {
            TransferHelper.safeTransfer(token1, plan.investor, received1);
            require(balance1Before - received1 <= balance1(), "U1");
        }
        require(balance0Before - received0 <= balance0(), "U0");
        emit Unsubscribe(planIndex, received0, received1);
    }

    function trigger()
        external
        override
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        uint256 tickIndex = _nextTickIndex++;
        amount0 = _tickVolumes0[tickIndex];
        require(amount0 > 0, "Tick volume equal 0");
        mapping(uint256 => uint256) storage tickTimes = _tickTimes;
        if (tickIndex > 1) {
            require(
                tickTimes[tickIndex - 1] + frequency * TIME_UNIT <=
                    block.timestamp + 5,
                "Not yet"
            );
        }
        tickTimes[tickIndex] = block.timestamp;
        uint256 gasFee = tx.gasprice * PROCESSING_GAS;
        uint256 _price = IAipSwapManager(swapManager).poolPrice(
            token0,
            WETH9,
            swapWETH9Fee
        );
        uint256 triggerFee0 = (gasFee * 1e18) / _price;
        uint256 protocolFee0 = amount0 / PROTOCOL_FEE;

        uint256 totalSwap = amount0 - protocolFee0 - triggerFee0;

        totalPaymentAmount0 += amount0;

        TransferHelper.safeApprove(token0, swapManager, totalSwap);

        uint256 balance0Before = balance0();
        uint256 balance1Before = balance1();
        (, int256 swapAmount1) = IAipSwapManager(swapManager).swap(
            token0,
            token1,
            swapFee,
            address(this),
            true,
            totalSwap
        );

        amount1 = swapAmount1 >= 0
            ? uint256(swapAmount1)
            : uint256(-swapAmount1);
        require(amount1 > 0);
        _tickVolumes1[tickIndex] += amount1;
        _tickFees0[tickIndex] += protocolFee0 + triggerFee0;
        protocolFee += protocolFee0;
        TransferHelper.safeTransfer(token0, msg.sender, triggerFee0);
        require(balance0Before - (totalSwap + triggerFee0) <= balance0(), "T0");
        require(balance1Before + amount1 <= balance1(), "T1");
        emit Trigger(tickIndex, amount0, amount1, triggerFee0, protocolFee0);
    }

    function setSwapFee(uint24 _swapFee, uint24 _swapWETH9Fee)
        external
        override
        nonReentrant
        onlyFactoryOwner
        returns (address swapPool, address swapWETH9Pool)
    {
        require(
            _swapFee == 500 || _swapFee == 3000 || _swapFee == 10000,
            "Invalid swap fee"
        );
        swapPool = IAipSwapManager(swapManager).getPool(
            token0,
            token1,
            _swapFee
        );
        swapWETH9Pool = IAipSwapManager(swapManager).getPool(
            token0,
            WETH9,
            _swapWETH9Fee
        );
        emit SwapFeeChanged(swapFee, swapWETH9Fee, _swapFee, _swapWETH9Fee);
        swapFee = _swapFee;
        swapWETH9Fee = _swapWETH9Fee;
    }

    function claimReward(address requester, uint256 planIndex)
        external
        override
        nonReentrant
        returns (
            address token,
            uint256 unclaimedAmount,
            uint256 claimedAmount
        )
    {
        PlanInfo storage plan = plans[planIndex];
        require(plan.investor == requester, "Only owner");
        token = rewardToken;
        if (token != address(0)) {
            uint256 currentEndTick = _getCurrentEndTick(plan.endTick);
            uint256 currentStartTick = plan.claimedRewardIndex == 0
                ? plan.startTick
                : plan.claimedRewardIndex + 1;
            if (currentEndTick >= currentStartTick) {
                for (uint256 i = currentStartTick; i <= currentEndTick; i++) {
                    RewardCycleInfo memory rewardCycle = rewardCycles[
                        _tickCycles[i]
                    ];
                    unclaimedAmount +=
                        (rewardCycle.rewardAmount * plan.tickAmount0) /
                        rewardCycle.paymentAmount0;
                }
            }

            claimedAmount = plan.claimedRewardAmount;

            if (unclaimedAmount > 0) {
                plan.claimedRewardAmount += unclaimedAmount;
                plan.claimedRewardIndex = _nextTickIndex - 1;
                uint256 balanceRewardBefore = balanceReward();
                TransferHelper.safeTransfer(
                    rewardToken,
                    plan.investor,
                    unclaimedAmount
                );
                require(
                    balanceRewardBefore - unclaimedAmount <= balanceReward(),
                    "CR"
                );
                emit ClaimReward(plan.index, unclaimedAmount, claimedAmount);
            }
        }
    }

    function depositReward(uint256 amount)
        external
        override
        nonReentrant
        onlyRewardOperator
    {
        uint256 rewardCycleIndex = _nextRewardCycleIndex++;
        RewardCycleInfo storage rewardCycle = rewardCycles[rewardCycleIndex];
        RewardCycleInfo memory _lastRewardCycle = rewardCycles[
            rewardCycleIndex - 1
        ];
        rewardCycle.rewardAmount = amount;
        rewardCycle.paymentAmount0 =
            totalPaymentAmount0 -
            _lastRewardCycle.paymentAmount0;
        rewardCycle.tickIndexStart = _lastRewardCycle.tickIndexEnd + 1;
        rewardCycle.tickIndexEnd = _nextTickIndex - 1;
        for (
            uint256 i = rewardCycle.tickIndexStart;
            i <= rewardCycle.tickIndexEnd;
            i++
        ) {
            _tickCycles[i] = rewardCycleIndex;
        }
        uint256 balanceRewardBefore = balanceReward();
        TransferHelper.safeTransferFrom(
            rewardToken,
            msg.sender,
            address(this),
            amount
        );
        require(balanceRewardBefore + amount <= balanceReward(), "DR");
        emit DepositReward(amount);
    }

    function initReward(address _rewardToken, address _rewardOperator)
        external
        override
        nonReentrant
        onlyFactoryOwner
    {
        require(rewardToken == address(0));
        require(_rewardToken != address(0), "Invalid token address");
        require(_rewardOperator != address(0), "Invalid operator address");
        rewardToken = _rewardToken;
        rewardOperator = _rewardOperator;
        emit InitReward(rewardToken, rewardOperator);
    }

    function changeRewardOperator(address _operator)
        external
        override
        nonReentrant
        onlyFactoryOwner
    {
        require(rewardOperator != address(0), "Operator is not exist");
        require(_operator != address(0), "Invalid address");
        emit RewardOperatorChanged(rewardOperator, _operator);
        rewardOperator = _operator;
    }

    function collectProtocol(address recipient, uint256 amountRequested)
        external
        override
        nonReentrant
        onlyFactoryOwner
        returns (uint256 amount)
    {
        amount = amountRequested > protocolFee ? protocolFee : amountRequested;

        if (amount > 0) {
            if (amount == protocolFee) amount--; // ensure that the slot is not cleared, for gas savings
            protocolFee -= amount;
            TransferHelper.safeTransfer(token0, recipient, amount);
        }

        emit CollectProtocol(msg.sender, recipient, amount);
    }
}
