// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./abstracts/Multicall.sol";
import "./base/ERC721Permit.sol";
import "./interfaces/IAipPoolDeployer.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IAipPool.sol";
import "./interfaces/IAipFactory.sol";
import "./interfaces/INonfungibleTokenPlanDescriptor.sol";
import "./interfaces/INonfungiblePlanManager.sol";
import "./interfaces/IERC721Access.sol";
import "./interfaces/callback/IAipSubscribeCallback.sol";
import "./interfaces/callback/IAipExtendCallback.sol";
import "./interfaces/callback/IAipBurnCallback.sol";
import "./libraries/CallbackValidation.sol";
import "./libraries/PoolAddress.sol";
import "./libraries/TransferHelper.sol";

contract NonfungiblePlanManager is
    Multicall,
    ERC721Permit,
    IERC721Access,
    INonfungiblePlanManager,
    IAipSubscribeCallback,
    IAipExtendCallback,
    IAipBurnCallback
{
    address public immutable override factory;
    address private immutable _tokenDescriptor;
    uint256 private _nextId = 1;
    mapping(address => mapping(address => mapping(uint8 => mapping(uint256 => uint256))))
        public
        override getTokenId;

    mapping(uint256 => Plan) private _plans;
    mapping(address => uint256[]) private _investorPlans;

    constructor(address _factory, address _tokenDescriptor_)
        ERC721Permit("Aip Plan NFT", "AIP-PLAN", "1")
    {
        factory = _factory;
        _tokenDescriptor = _tokenDescriptor_;
    }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
        _;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721)
        returns (string memory)
    {
        require(_exists(tokenId));
        return
            INonfungibleTokenPlanDescriptor(_tokenDescriptor).tokenURI(
                this,
                tokenId
            );
    }

    // save bytecode by removing implementation of unused method
    function _baseURI() internal pure override returns (string memory) {}

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
        TransferHelper.safeTransferFrom(
            decoded.poolInfo.token0,
            decoded.payer,
            msg.sender,
            amount
        );
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
        TransferHelper.safeTransferFrom(
            decoded.poolInfo.token0,
            decoded.payer,
            msg.sender,
            amount
        );
    }

    struct BurnCallbackData {
        PoolAddress.PoolInfo poolInfo;
        uint256 tokenId;
    }

    function aipBurnCallback(bytes calldata data)
        external
        override
        returns (address receiver)
    {
        BurnCallbackData memory decoded = abi.decode(data, (BurnCallbackData));
        CallbackValidation.verifyCallback(factory, decoded.poolInfo);
        receiver = ownerOf(decoded.tokenId);
        _burn(decoded.tokenId);
    }

    function plansOf(address addr)
        external
        view
        override
        returns (uint256[] memory)
    {
        return _investorPlans[addr];
    }

    function getPlan(uint256 tokenId)
        public
        view
        override
        returns (Plan memory plan, PlanStatistics memory statistics)
    {
        plan = _plans[tokenId];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        (
            statistics.swapAmount1,
            statistics.withdrawnAmount1,
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
        override
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

    function mint(MintParams calldata params)
        external
        payable
        override
        returns (uint256 tokenId, uint256 planIndex)
    {
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: params.token0,
            token1: params.token1,
            frequency: params.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        planIndex = pool.subscribe(
            params.investor,
            params.tickAmount,
            params.periods,
            abi.encode(
                SubscribeCallbackData({poolInfo: poolInfo, payer: msg.sender})
            )
        );
        _mint(params.investor, (tokenId = _nextId++));
        _plans[tokenId] = Plan({
            nonce: 0,
            operator: address(0),
            investor: params.investor,
            token0: params.token0,
            token1: params.token1,
            frequency: params.frequency,
            index: planIndex,
            tickAmount: params.tickAmount,
            createdTime: block.timestamp
        });
        getTokenId[params.token0][params.token1][params.frequency][
            planIndex
        ] = tokenId;
        _investorPlans[msg.sender].push(tokenId);
    }

    function extend(uint256 tokenId, uint256 periods)
        external
        payable
        override
    {
        require(_exists(tokenId), "Invalid token");
        Plan memory plan = _plans[tokenId];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        pool.extend(
            plan.index,
            periods,
            abi.encode(
                ExtendCallbackData({poolInfo: poolInfo, payer: msg.sender})
            )
        );
    }

    function burn(uint256 tokenId)
        external
        override
        isAuthorizedForToken(tokenId)
        returns (uint256 received0, uint256 received1)
    {
        require(_exists(tokenId), "Invalid token");
        Plan memory plan = _plans[tokenId];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return
            pool.unsubscribe(
                plan.index,
                abi.encode(
                    BurnCallbackData({poolInfo: poolInfo, tokenId: tokenId})
                )
            );
    }

    function withdraw(uint256 tokenId)
        external
        override
        returns (uint256 received1)
    {
        require(_exists(tokenId), "Invalid token");
        Plan memory plan = _plans[tokenId];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return pool.withdraw(plan.index);
    }

    function claimReward(uint256 tokenId)
        external
        override
        returns (
            address token,
            uint256 unclaimedAmount,
            uint256 claimedAmount
        )
    {
        require(_exists(tokenId), "Invalid token");
        Plan memory plan = _plans[tokenId];
        PoolAddress.PoolInfo memory poolInfo = PoolAddress.PoolInfo({
            token0: plan.token0,
            token1: plan.token1,
            frequency: plan.frequency
        });
        IAipPool pool = IAipPool(PoolAddress.computeAddress(factory, poolInfo));
        return pool.claimReward(plan.index);
    }

    function _getAndIncrementNonce(uint256 tokenId)
        internal
        override
        returns (uint256)
    {
        return uint256(_plans[tokenId].nonce++);
    }

    function getApproved(uint256 tokenId)
        public
        view
        override(ERC721)
        returns (address)
    {
        require(
            _exists(tokenId),
            "ERC721: approved query for nonexistent token"
        );

        return _plans[tokenId].operator;
    }

    function _approve(address to, uint256 tokenId) internal override(ERC721) {
        _plans[tokenId].operator = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    function isLocked(uint256 tokenId) external view override returns (bool) {
        Plan memory plan = _plans[tokenId];
        return ownerOf(tokenId) != plan.investor;
    }
}
