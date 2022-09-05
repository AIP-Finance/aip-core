const { utils, BigNumber, constants } = require("ethers");
const { ethers, waffle } = require("hardhat");

const {
  abi: poolAbi,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");

const { expect } = require("./utils/expect");
const { getCreate2Address } = require("./utils/helpers");
const { generateUniswapPool, FeeAmount } = require("./utils/uniswapHelpers");
const { completeFixture } = require("./utils/fixtures");
const { TIME_UNIT, PROCESSING_GAS } = require("./utils/constants");

let wallet, investor1, investor2, other;
let weth9;
let tokens;
let planManager;
let swapManager;
let usdt;
let factory;
let poolBytecode;
let pool;
let poolAddress;

const PROTOCOL_FEE = 1000; // 1/x

const frequency = 3;
const tickAmount0 = 10;
const ticks = 3;
const tickAmount = utils.parseEther(tickAmount0.toString());

const subscribe = (investor, tickAmount, periods) =>
  planManager
    .connect(investor)
    .subscribe([
      usdt.address,
      tokens[1].address,
      frequency,
      tickAmount,
      periods,
    ]);

const getTriggerFee = async () => {
  const { gasPrice } = await ethers.provider.getFeeData();
  const gasFee = gasPrice.mul(PROCESSING_GAS);

  // console.log("gasFee", gasFee.toString());

  const price = await swapManager.poolPrice(
    usdt.address,
    weth9.address,
    FeeAmount.MEDIUM
  );
  return gasFee.mul(utils.parseEther("1")).div(price);
};

const swapWithoutProtocolFee = async (amount) => {
  const triggerFee = await getTriggerFee();
  return swapManager
    .connect(other)
    .callStatic.swap(
      usdt.address,
      tokens[1].address,
      FeeAmount.MEDIUM,
      other.address,
      true,
      amount.sub(amount.div(PROTOCOL_FEE)).sub(triggerFee)
    );
};

describe("AipPlanManager", () => {
  const createFixtureLoader = waffle.createFixtureLoader;

  const fixture = async (wallets, provider) => {
    const {
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      dai,
      usdc,
      usdt,
    } = await completeFixture(wallets, provider);

    await factory.enable(
      swapManager.address,
      dai.address,
      usdc.address,
      usdt.address,
      weth9.address
    );

    await usdt
      .connect(other)
      .approve(swapManager.address, constants.MaxUint256);

    usdt.connect(investor1).approve(planManager.address, constants.MaxUint256);
    usdt.connect(investor2).approve(planManager.address, constants.MaxUint256);
    usdt
      .connect(other)
      .approve(mockLiquidityManager.address, constants.MaxUint256);
    await usdt.transfer(investor1.address, utils.parseEther("1000000"));
    await usdt.transfer(investor2.address, utils.parseEther("1000000"));
    await usdt.transfer(other.address, utils.parseEther("1000000"));

    // approve & fund wallets
    for (const token of tokens) {
      await token
        .connect(investor1)
        .approve(planManager.address, constants.MaxUint256);

      await token
        .connect(investor2)
        .approve(planManager.address, constants.MaxUint256);

      await token
        .connect(other)
        .approve(swapManager.address, constants.MaxUint256);

      await token.transfer(investor1.address, utils.parseEther("1000000"));
      await token.transfer(investor2.address, utils.parseEther("1000000"));
      await token.transfer(other.address, utils.parseEther("1000000"));
    }

    await generateUniswapPool(
      mockLiquidityManager,
      swapFactory,
      usdt,
      weth9,
      FeeAmount.MEDIUM,
      wallet
    );

    await generateUniswapPool(
      mockLiquidityManager,
      swapFactory,
      usdt,
      tokens[1],
      FeeAmount.MEDIUM,
      wallet
    );

    return {
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      usdt,
    };
  };

  let loadFixture;
  before("create fixture loader", async () => {
    [wallet, investor1, investor2, other] = await ethers.getSigners();
    loadFixture = createFixtureLoader([wallet, investor1, investor2, other]);
  });

  beforeEach("load fixture", async () => {
    ({
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      dai,
      usdc,
      usdt,
    } = await loadFixture(fixture));
  });

  before("load pool bytecode", async () => {
    poolBytecode = (await ethers.getContractFactory("AipPool")).bytecode;
    const COMPUTED_INIT_CODE_HASH = utils.keccak256(poolBytecode);
    console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);
  });

  // it("bytecode size", async () => {
  //   expect(
  //     ((await coverageManager.provider.getCode(coverageManager.address))
  //       .length -
  //       2) /
  //       2
  //   ).to.matchSnapshot();
  // });

  beforeEach("create pool", async () => {
    await planManager.createPoolIfNecessary([
      usdt.address,
      tokens[1].address,
      frequency,
    ]);
    poolAddress = getCreate2Address(
      factory.address,
      [usdt.address, tokens[1].address, frequency],
      poolBytecode
    );
    pool = await new ethers.Contract(poolAddress, poolAbi, wallet);
  });

  describe("#setSwapFee", () => {
    it("success", async () => {
      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        weth9,
        FeeAmount.LOW,
        wallet
      );
      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        tokens[1],
        FeeAmount.HIGH,
        wallet
      );
      await pool.setSwapFee(FeeAmount.HIGH, FeeAmount.LOW);
      expect((await pool.swapFee()).toString()).equal(
        FeeAmount.HIGH.toString()
      );
      expect((await pool.swapWETH9Fee()).toString()).equal(
        FeeAmount.LOW.toString()
      );
    });
    it("fails if requester is not factory owner", async () => {
      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        weth9,
        FeeAmount.LOW,
        wallet
      );
      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        tokens[1],
        FeeAmount.LOW,
        wallet
      );
      await expect(
        pool.connect(investor1).setSwapFee(FeeAmount.LOW, FeeAmount.LOW)
      ).to.be.reverted;
    });
    it("fails if token0 token1 pool is not exist", async () => {
      await expect(pool.setSwapFee(FeeAmount.LOW, FeeAmount.MEDIUM)).to.be
        .reverted;
    });
    it("fails if token0 weth9 pool is not exist", async () => {
      await expect(pool.setSwapFee(FeeAmount.MEDIUM, FeeAmount.LOW)).to.be
        .reverted;
    });
  });

  describe("#poolPrice", () => {
    it("equal uniswap pool", async () => {
      const price = await pool.price();

      expect(Number(utils.formatEther(price))).to.be.approximately(
        2,
        0.00000001
      );
    });

    it("equal uniswap pool if change fee", async () => {
      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        weth9,
        FeeAmount.LOW,
        wallet
      );

      await generateUniswapPool(
        mockLiquidityManager,
        swapFactory,
        usdt,
        tokens[1],
        FeeAmount.LOW,
        wallet
      );

      await pool.setSwapFee(FeeAmount.LOW, FeeAmount.LOW);

      const price = await pool.price();

      expect(Number(utils.formatEther(price))).to.be.approximately(
        1,
        0.00000001
      );
    });
  });

  describe("#subscribe", () => {
    it("success", async () => {
      const balance0Before = await usdt.balanceOf(investor1.address);
      await subscribe(investor1, tickAmount, ticks);
      const balance0 = await usdt.balanceOf(investor1.address);
      expect(balance0Before.sub(balance0)).to.equal(tickAmount.mul(ticks));
      const poolPlan = await pool.plans(1);
      expect(poolPlan.index.toNumber()).equal(1);
      expect(poolPlan.investor).equal(investor1.address);
      expect(poolPlan.tickAmount0).equal(tickAmount);
      expect(poolPlan.claimedAmount1).equal(0);
      expect(poolPlan.startTick).equal(1);
      expect(poolPlan.endTick).equal(ticks);

      const planDetails = await planManager.getPlan(1);
      expect(planDetails.plan.index.toNumber()).equal(1);
      expect(planDetails.plan.investor).equal(investor1.address);
      expect(planDetails.plan.token0).equal(usdt.address);
      expect(planDetails.plan.token1).equal(tokens[1].address);
      expect(planDetails.plan.frequency).equal(frequency);
      expect(planDetails.plan.index).equal(poolPlan.index.toNumber());
      expect(planDetails.plan.tickAmount).equal(tickAmount);

      const tickInfo1 = await pool.tickInfo(1);
      const tickInfo2 = await pool.tickInfo(2);
      const tickInfo3 = await pool.tickInfo(3);
      const tickInfo4 = await pool.tickInfo(4);
      expect(tickInfo1.amount0).to.equal(tickAmount);
      expect(tickInfo2.amount0).to.equal(tickAmount);
      expect(tickInfo3.amount0).to.equal(tickAmount);
      expect(tickInfo4.amount0).to.equal(0);
    });

    it("emits event", async () => {
      await expect(subscribe(investor1, tickAmount, ticks))
        .to.be.emit(pool, "Subscribe")
        .withArgs(1, investor1.address, tickAmount, 1, ticks);
    });

    it("fails if insufficient usdt funds", async () => {
      await usdt
        .connect(investor1)
        .approve(planManager.address, tickAmount.mul(ticks).sub(1));
      await expect(subscribe(investor1, tickAmount, ticks)).to.be.revertedWith(
        "STF"
      );
    });

    it("fails if invalid input amount", async () => {
      const minAmount = utils.parseEther("10");
      await expect(
        subscribe(investor1, minAmount.sub(1), ticks)
      ).to.be.revertedWith("Invalid tick amount");
      await expect(subscribe(investor1, tickAmount, 0)).to.be.revertedWith(
        "Invalid periods"
      );
    });
  });

  describe("#trigger", () => {
    it("success", async () => {
      const protocolFeeBefore = await pool.protocolFee();
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      const tickInfo = await pool.tickInfo(1);
      expect(tickInfo.amount0).to.equal(tickAmount);
      expect(tickInfo.amount1).to.equal(result.amount1.abs());

      const protocolFee = await pool.protocolFee();
      expect(protocolFee.sub(protocolFeeBefore)).to.equal(
        tickAmount.div(PROTOCOL_FEE)
      );
    });
    it("plan with right statisctics", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await subscribe(investor2, tickAmount, 4);
      const now = Date.now() + 1000;
      await ethers.provider.send("evm_setNextBlockTimestamp", [now]);
      const result = await swapWithoutProtocolFee(tickAmount.mul(2));
      await pool.trigger();
      let planDetails = await planManager.getPlan(1);
      expect(planDetails.statistics.startedTime).to.equal(now);
      expect(planDetails.statistics.endedTime).to.equal(
        now + frequency * TIME_UNIT * 2
      );
      expect(planDetails.statistics.swapAmount1).to.equal(
        result.amount1.abs().div(2)
      );
      expect(planDetails.statistics.remainingTicks.toString()).to.equal("2");
      expect(planDetails.statistics.ticks.toString()).to.equal("3");
      expect(planDetails.statistics.lastTriggerTime).to.equal(now);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const now2 = now + frequency * TIME_UNIT * 2 + 1325;
      await ethers.provider.send("evm_setNextBlockTimestamp", [now2]);
      await pool.trigger();
      planDetails = await planManager.getPlan(1);
      expect(planDetails.statistics.endedTime).to.equal(now2);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      planDetails = await planManager.getPlan(1);
      expect(planDetails.statistics.endedTime).to.equal(now2);
    });

    it("success trigger again", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result = await swapWithoutProtocolFee(tickAmount);
      const protocolFeeBefore = await pool.protocolFee();

      await pool.trigger();
      const tickInfo = await pool.tickInfo(2);
      expect(tickInfo.amount0).to.equal(tickAmount);
      expect(tickInfo.amount1).to.equal(result.amount1.abs());
      const protocolFee = await pool.protocolFee();
      expect(protocolFee.sub(protocolFeeBefore)).to.equal(
        tickAmount.div(PROTOCOL_FEE)
      );
    });
    it("two investors", async () => {
      const protocolFeeBefore = await pool.protocolFee();
      await subscribe(investor1, tickAmount, ticks);
      await subscribe(investor2, tickAmount.mul(2), ticks);
      const result = await swapWithoutProtocolFee(tickAmount.mul(3));
      await pool.trigger();
      const tickInfo = await pool.tickInfo(1);
      expect(tickInfo.amount0).to.equal(tickAmount.mul(3));
      expect(tickInfo.amount1).to.equal(result.amount1.abs());
      const protocolFee = await pool.protocolFee();
      expect(protocolFee.sub(protocolFeeBefore)).to.equal(
        tickAmount.mul(3).div(PROTOCOL_FEE)
      );
    });
    it("emits event", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      const protocolFee = tickAmount.div(PROTOCOL_FEE);
      const triggerFee = await getTriggerFee();
      await expect(pool.trigger())
        .to.be.emit(pool, "Trigger")
        .withArgs(1, tickAmount, result.amount1.abs(), triggerFee, protocolFee);
    });
    it("fails if tick volume equal 0", async () => {
      await expect(pool.trigger()).to.be.revertedWith("Tick volume equal 0");
    });
    it("fails if wrong time", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [
        frequency * TIME_UNIT - 10,
      ]);
      await ethers.provider.send("evm_mine");
      await expect(pool.trigger()).to.be.revertedWith("Not yet");
    });
  });

  describe("#unsubscribe", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      const balance0Before = await usdt.balanceOf(investor1.address);
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).unsubscribe(1);

      const plan = await pool.plans(1);
      const balance0 = await usdt.balanceOf(investor1.address);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(2));
      expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
      expect(plan.endTick).to.equal(1);

      const tickInfo1 = await pool.tickInfo(1);
      const tickInfo2 = await pool.tickInfo(2);
      const tickInfo3 = await pool.tickInfo(3);
      expect(tickInfo1.amount0).to.equal(tickAmount);
      expect(tickInfo2.amount0).to.equal(0);
      expect(tickInfo3.amount0).to.equal(0);
    });
    it("success if cancel after subscribe", async () => {
      await subscribe(investor2, tickAmount, 5);
      await pool.trigger();
      await subscribe(investor1, tickAmount, ticks);
      const balance0Before = await usdt.balanceOf(investor1.address);
      await planManager.connect(investor1).unsubscribe(2);
      const balance0 = await usdt.balanceOf(investor1.address);
      expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(ticks));
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();

      const planDetails = await planManager.getPlan(2);
      expect(planDetails.statistics.startedTime).to.equal(0);
      expect(planDetails.statistics.endedTime).to.equal(0);
      expect(planDetails.statistics.swapAmount1).to.equal(0);
      expect(planDetails.statistics.remainingTicks.toString()).to.equal("0");
      expect(planDetails.statistics.ticks.toString()).to.equal("0");
    });
    it("emits event", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      await expect(planManager.connect(investor1).unsubscribe(1))
        .to.be.emit(pool, "Unsubscribe")
        .withArgs(1, tickAmount.mul(2), result.amount1.abs());
    });
    it("fails if requester is not owner", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(
        planManager.connect(investor2).unsubscribe(1)
      ).to.be.revertedWith("Only owner");
    });
    it("fails if request time larger than plan end time", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await expect(
        planManager.connect(investor1).unsubscribe(1)
      ).to.be.revertedWith("Finished");
    });
  });

  describe("#claim", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).claim(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
    });
    it("success if claim again", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await planManager.connect(investor1).claim(1);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).claim(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(
        result2.amount1.abs().add(result3.amount1.abs())
      );
    });
    it("success with right ratio", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await subscribe(investor2, tickAmount.mul(2), ticks);
      const result = await swapWithoutProtocolFee(tickAmount.mul(3));
      await pool.trigger();
      const balance1Investor1Before = await tokens[1].balanceOf(
        investor1.address
      );
      const balance1Investor2Before = await tokens[1].balanceOf(
        investor2.address
      );
      await planManager.connect(investor1).claim(1);
      await planManager.connect(investor2).claim(2);
      const balance1Investor1 = await tokens[1].balanceOf(investor1.address);
      const balance1Investor2 = await tokens[1].balanceOf(investor2.address);
      expect(balance1Investor1.sub(balance1Investor1Before)).to.equal(
        result.amount1.abs().mul(1).div(3)
      );
      expect(balance1Investor2.sub(balance1Investor2Before)).to.equal(
        result.amount1.abs().mul(2).div(3)
      );
    });
    it("emits event", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      await expect(planManager.connect(investor1).claim(1))
        .to.be.emit(pool, "Claim")
        .withArgs(1, result.amount1.abs());
    });
    it("fails if requester is not owner", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(planManager.connect(investor2).claim(1)).to.be.revertedWith(
        "Only owner"
      );
    });
    it("fails if nothing to claim", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await planManager.connect(investor1).claim(1);
      await expect(planManager.connect(investor1).claim(1)).to.be.revertedWith(
        "Nothing to claim"
      );
    });
  });

  describe("#extend", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, 2);
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      let received = BigNumber.from(0);
      const result1 = await swapWithoutProtocolFee(tickAmount);
      received = received.add(result1.amount1.abs());
      await pool.trigger();
      await planManager.connect(investor1).extend(1, 1);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(tickAmount);
      received = received.add(result2.amount1.abs());
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(tickAmount);
      received = received.add(result3.amount1.abs());
      await pool.trigger();
      await planManager.connect(investor1).claim(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(received);
    });
    it("right ratio", async () => {
      const tickAmountI1 = tickAmount;
      const tickAmountI2 = tickAmount.mul(3);
      const totalTickAmount = tickAmountI1.add(tickAmountI2);
      await subscribe(investor1, tickAmountI1, 2);
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      const balance2Before = await tokens[1].balanceOf(investor2.address);
      let receivedI1 = BigNumber.from(0);
      let receivedI2 = BigNumber.from(0);
      const result1 = await swapWithoutProtocolFee(tickAmountI1);
      receivedI1 = receivedI1.add(result1.amount1.abs());
      await pool.trigger();
      await planManager.connect(investor1).extend(1, 1);
      await subscribe(investor2, tickAmountI2, 3);

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(totalTickAmount);

      receivedI1 = receivedI1.add(
        result2.amount1.abs().mul(tickAmountI1).div(totalTickAmount)
      );
      receivedI2 = receivedI2.add(
        result2.amount1.abs().mul(tickAmountI2).div(totalTickAmount)
      );
      await pool.trigger();

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(totalTickAmount);
      receivedI1 = receivedI1.add(
        result3.amount1.abs().mul(tickAmountI1).div(totalTickAmount)
      );
      receivedI2 = receivedI2.add(
        result3.amount1.abs().mul(tickAmountI2).div(totalTickAmount)
      );
      await pool.trigger();

      await planManager.connect(investor1).claim(1);
      await planManager.connect(investor2).claim(2);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      const balance2 = await tokens[1].balanceOf(investor2.address);
      expect(balance1.sub(balance1Before)).to.equal(receivedI1);
      expect(balance2.sub(balance2Before)).to.equal(receivedI2);
    });
    it("emits event", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      await expect(planManager.connect(investor1).extend(1, 1))
        .to.be.emit(pool, "Extend")
        .withArgs(1, ticks, ticks + 1);
    });
    it("fails if insufficient usdt funds", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await usdt
        .connect(investor1)
        .approve(planManager.address, tickAmount.mul(1).sub(1));
      await expect(
        planManager.connect(investor1).extend(1, 1)
      ).to.be.revertedWith("STF");
    });
    it("fails if periods invalid", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(
        planManager.connect(investor1).extend(1, 0)
      ).to.be.revertedWith("Invalid periods");
    });
    it("fails if plan finished", async () => {
      await subscribe(investor1, tickAmount, 1);
      await pool.trigger();
      await expect(
        planManager.connect(investor1).extend(1, 1)
      ).to.be.revertedWith("Finished");
    });
    it("fails if requester is not owner", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(
        planManager.connect(investor2).extend(1, 1)
      ).to.be.revertedWith("Only owner");
    });
  });
  describe("#claimReward", () => {
    const rewardAmount = utils.parseEther("10");
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);
      const balanceBefore = await tokens[2].balanceOf(investor1.address);
      await planManager.connect(investor1).claimReward(1);
      const balance = await tokens[2].balanceOf(investor1.address);
      expect(balance.sub(balanceBefore)).to.equal(rewardAmount);
    });
    it("right ratio", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await subscribe(investor2, tickAmount, ticks);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);
      const balanceI1Before = await tokens[2].balanceOf(investor1.address);
      await planManager.connect(investor1).claimReward(1);
      const balanceI1 = await tokens[2].balanceOf(investor1.address);
      const balanceI2Before = await tokens[2].balanceOf(investor2.address);
      await planManager.connect(investor2).claimReward(2);
      const balanceI2 = await tokens[2].balanceOf(investor2.address);
      expect(balanceI1.sub(balanceI1Before)).to.equal(
        rewardAmount.mul(2).div(3)
      );
      expect(balanceI2.sub(balanceI2Before)).to.equal(rewardAmount.div(3));
    });
    it("multiple time", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await subscribe(investor2, tickAmount, ticks);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);

      const balanceI1Cycle1Before = await tokens[2].balanceOf(
        investor1.address
      );
      await planManager.connect(investor1).claimReward(1);
      const balanceI1Cycle1 = await tokens[2].balanceOf(investor1.address);
      const balanceI2Cycle1Before = await tokens[2].balanceOf(
        investor2.address
      );
      await planManager.connect(investor2).claimReward(2);
      const balanceI2Cycle1 = await tokens[2].balanceOf(investor2.address);
      expect(balanceI1Cycle1.sub(balanceI1Cycle1Before)).to.equal(
        rewardAmount.mul(2).div(3)
      );
      expect(balanceI2Cycle1.sub(balanceI2Cycle1Before)).to.equal(
        rewardAmount.div(3)
      );
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);

      const balanceI1Cycle2Before = await tokens[2].balanceOf(
        investor1.address
      );
      await planManager.connect(investor1).claimReward(1);
      const balanceI1Cycle2 = await tokens[2].balanceOf(investor1.address);
      const balanceI2Cycle2Before = await tokens[2].balanceOf(
        investor2.address
      );
      await planManager.connect(investor2).claimReward(2);
      const balanceI2Cycle2 = await tokens[2].balanceOf(investor2.address);
      expect(balanceI1Cycle2.sub(balanceI1Cycle2Before)).to.equal(
        rewardAmount.div(2)
      );
      expect(balanceI2Cycle2.sub(balanceI2Cycle2Before)).to.equal(
        rewardAmount.div(2)
      );
    });
    it("returns 0 if no reward", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await planManager
        .connect(investor1)
        .callStatic.claimReward(1);
      expect(result.token).to.equal(constants.AddressZero);
      expect(result.unclaimedAmount).to.equal(0);
      expect(result.claimedAmount).to.equal(0);
    });
    it("fails if requester is not owner", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.initReward(tokens[2].address, other.address);
      await expect(
        planManager.connect(investor2).claimReward(1)
      ).to.be.revertedWith("Only owner");
    });
  });
});
