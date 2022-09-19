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
const getPermitNFTSignature = require("./utils/getPermitNFTSignature");

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

const frequency = 30;
const tickAmount0 = 10;
const ticks = 100;
const tickAmount = utils.parseEther(tickAmount0.toString());

const subscribe = (investor, tickAmount, periods) =>
  planManager
    .connect(investor)
    .mint([
      usdt.address,
      tokens[1].address,
      frequency,
      investor.address,
      investor.address,
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

describe("NonfungiblePlanManager", () => {
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

  describe("#mint", () => {
    it("success", async () => {
      const balance0Before = await usdt.balanceOf(investor1.address);
      await subscribe(investor1, tickAmount, ticks);
      const balance0 = await usdt.balanceOf(investor1.address);
      expect(balance0Before.sub(balance0)).to.equal(tickAmount.mul(ticks));
      const poolPlan = await pool.plans(1);
      expect(poolPlan.index.toNumber()).equal(1);
      expect(poolPlan.owner).equal(planManager.address);
      expect(poolPlan.tickAmount0).equal(tickAmount);
      expect(poolPlan.withdrawnAmount1).equal(0);
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

      const tokenOwner = await planManager.ownerOf(1);
      expect(tokenOwner).to.eq(investor1.address);

      for (let i = 1; i <= ticks; i++) {
        const tickInfo = await pool.tickInfo(i);
        expect(tickInfo.amount0).to.equal(tickAmount);
      }
      const tickInfoOut = await pool.tickInfo(ticks + 1);
      expect(tickInfoOut.amount0).to.equal(0);
    });

    it("success with another payer", async () => {
      await planManager
        .connect(investor2)
        .mint([
          usdt.address,
          tokens[1].address,
          frequency,
          investor1.address,
          investor1.address,
          tickAmount,
          3,
        ]);
      const planDetails = await planManager.getPlan(1);
      expect(planDetails.plan.investor).equal(investor1.address);
    });

    it("emits plan minted event", async () => {
      await expect(subscribe(investor1, tickAmount, ticks))
        .to.be.emit(planManager, "PlanMinted")
        .withArgs(
          1,
          investor1.address,
          usdt.address,
          tokens[1].address,
          frequency,
          1,
          investor1.address
        );
    });

    it("emits subscribe event", async () => {
      await expect(subscribe(investor1, tickAmount, ticks))
        .to.be.emit(pool, "Subscribe")
        .withArgs(1, planManager.address, tickAmount, 1, ticks);
    });

    it("fails if insufficient usdt funds", async () => {
      await usdt
        .connect(investor1)
        .approve(planManager.address, tickAmount.mul(ticks).sub(1));
      await expect(subscribe(investor1, tickAmount, ticks)).to.be.revertedWith(
        "STF"
      );
    });
    it("fails if invalid periods", async () => {
      await expect(subscribe(investor1, tickAmount, 366)).to.be.revertedWith(
        "Invalid periods"
      );
      await expect(subscribe(investor1, tickAmount, 0)).to.be.revertedWith(
        "Invalid periods"
      );
    });
    it("fails if invalid input amount", async () => {
      const minAmount = utils.parseEther("10");
      await expect(
        subscribe(investor1, minAmount.sub(1), ticks)
      ).to.be.revertedWith("Invalid tick amount");
    });
  });

  describe("#trigger", () => {
    it("success", async () => {
      const protocolFeeBefore = await pool.protocolFee();
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      console.log("pool.nextTickVolume", await pool.nextTickVolume());
      await pool.trigger();
      console.log(await planManager.tokenURI(1));
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
        now + frequency * TIME_UNIT * (ticks - 1)
      );
      expect(planDetails.statistics.swapAmount1).to.equal(
        result.amount1.abs().div(2)
      );
      expect(planDetails.statistics.remainingTicks.toNumber()).to.equal(
        ticks - 1
      );
      expect(planDetails.statistics.ticks.toNumber()).to.equal(ticks);
      expect(planDetails.statistics.lastTriggerTime).to.equal(now);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const now2 = now + frequency * TIME_UNIT * 2 + 1325;
      await ethers.provider.send("evm_setNextBlockTimestamp", [now2]);
      await pool.trigger();
      planDetails = await planManager.getPlan(1);
      expect(planDetails.statistics.endedTime).to.equal(
        now2 + frequency * TIME_UNIT * (ticks - 3)
      );
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

  describe("#burn", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      const balance0Before = await usdt.balanceOf(investor1.address);
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).burn(1);

      await expect(planManager.ownerOf(1)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      const plan = await pool.plans(1);
      const balance0 = await usdt.balanceOf(investor1.address);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(ticks - 1));
      expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
      expect(plan.endTick).to.equal(1);

      const tickInfo1 = await pool.tickInfo(1);
      const tickInfo2 = await pool.tickInfo(2);
      const tickInfo3 = await pool.tickInfo(3);
      expect(tickInfo1.amount0).to.equal(tickAmount);
      expect(tickInfo2.amount0).to.equal(0);
      expect(tickInfo3.amount0).to.equal(0);
    });
    it("success when transfered NFT to another", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      const balance0Before = await usdt.balanceOf(investor2.address);
      const balance1Before = await tokens[1].balanceOf(investor2.address);

      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);

      await planManager.connect(investor2).burn(1);

      const plan = await pool.plans(1);
      const balance0 = await usdt.balanceOf(investor2.address);
      const balance1 = await tokens[1].balanceOf(investor2.address);
      expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(ticks - 1));
      expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
      expect(plan.endTick).to.equal(1);
    });
    it("success if cancel after subscribe", async () => {
      await subscribe(investor2, tickAmount, 5);
      await pool.trigger();
      await subscribe(investor1, tickAmount, ticks);
      const balance0Before = await usdt.balanceOf(investor1.address);
      await planManager.connect(investor1).burn(2);
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
      await expect(planManager.connect(investor1).burn(1))
        .to.be.emit(pool, "Unsubscribe")
        .withArgs(1, tickAmount.mul(ticks - 1), result.amount1.abs());
    });
    it("fails if requester is not approved", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(planManager.connect(investor2).burn(1)).to.be.revertedWith(
        "Not approved"
      );
    });
    it("fails if NFT transfered", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);
      await expect(planManager.connect(investor1).burn(1)).to.be.revertedWith(
        "Not approved"
      );
    });
  });

  describe("#withdraw", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).withdraw(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
    });
    it("success if withdraw again", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await planManager.connect(investor1).withdraw(1);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).withdraw(1);
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
      await planManager.connect(investor1).withdraw(1);
      await planManager.connect(investor2).withdraw(2);
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
      await expect(planManager.connect(investor1).withdraw(1))
        .to.be.emit(pool, "Withdraw")
        .withArgs(1, result.amount1.abs());
    });
    it("fails if nothing to withdraw", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await planManager.connect(investor1).withdraw(1);
      await expect(
        planManager.connect(investor1).withdraw(1)
      ).to.be.revertedWith("Nothing to withdraw");
    });
    it("fails if transfered to another account", async () => {
      await subscribe(investor1, tickAmount, 2);
      await pool.trigger();
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);
      await expect(
        planManager.connect(investor1).withdraw(1)
      ).to.be.revertedWith("Not approved");
      await expect(
        planManager.connect(investor2).withdraw(1)
      ).to.be.revertedWith("Locked");
    });
  });

  describe("#withdrawIn", () => {
    it("success", async () => {
      await subscribe(investor1, tickAmount, ticks);
      const result1 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();

      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).withdrawIn(1, 2);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(
        result1.amount1.abs().add(result2.amount1.abs())
      );
    });
    it("success if withdrawn in the past", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await planManager.connect(investor1).withdraw(1);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result2 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).withdrawIn(1, 2);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(
        result2.amount1.abs().add(result3.amount1.abs())
      );
    });
    it("success if withdraw after withdraw in", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await planManager.connect(investor1).withdrawIn(1, 2);

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      const result3 = await swapWithoutProtocolFee(tickAmount);
      await pool.trigger();

      const balance1Before = await tokens[1].balanceOf(investor1.address);
      await planManager.connect(investor1).withdraw(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(result3.amount1.abs());
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
      await planManager.connect(investor1).withdraw(1);
      await planManager.connect(investor2).withdrawIn(2, 1);
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
      await expect(planManager.connect(investor1).withdrawIn(1, 1))
        .to.be.emit(pool, "Withdraw")
        .withArgs(1, result.amount1.abs());
    });
    it("fails if invalid period", async () => {
      await subscribe(investor1, tickAmount, 2);
      await pool.trigger();
      await expect(
        planManager.connect(investor1).withdrawIn(1, 0)
      ).to.be.revertedWith("Invalid period");
      await expect(
        planManager.connect(investor1).withdrawIn(1, 2)
      ).to.be.revertedWith("Invalid period");
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await expect(
        planManager.connect(investor1).withdrawIn(1, 3)
      ).to.be.revertedWith("Invalid period");
    });
    it("fails if transfered to another account", async () => {
      await subscribe(investor1, tickAmount, 2);
      await pool.trigger();
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);
      await expect(
        planManager.connect(investor1).withdrawIn(1, 1)
      ).to.be.revertedWith("Not approved");
      await expect(
        planManager.connect(investor2).withdrawIn(1, 1)
      ).to.be.revertedWith("Locked");
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
      await planManager.connect(investor1).withdraw(1);
      const balance1 = await tokens[1].balanceOf(investor1.address);
      expect(balance1.sub(balance1Before)).to.equal(received);
    });
    it("success with another payer", async () => {
      await subscribe(investor1, tickAmount, 2);
      await planManager.connect(investor2).extend(1, 1);
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

      await planManager.connect(investor1).withdraw(1);
      await planManager.connect(investor2).withdraw(2);
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
    it("fails if invalid periods", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await expect(
        planManager.connect(investor1).extend(1, 0)
      ).to.be.revertedWith("Invalid periods");
      await expect(
        planManager.connect(investor1).extend(1, 366 - ticks)
      ).to.be.revertedWith("Invalid periods");
    });
    it("fails if plan finished", async () => {
      await subscribe(investor1, tickAmount, 1);
      await pool.trigger();
      await expect(
        planManager.connect(investor1).extend(1, 1)
      ).to.be.revertedWith("Finished");
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
    it("success if transfered to another account", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);
      const balanceBefore = await tokens[2].balanceOf(investor1.address);
      await planManager.connect(investor1).claimReward(1);
      const balance = await tokens[2].balanceOf(investor1.address);
      expect(balance.sub(balanceBefore)).to.equal(rewardAmount);
    });
    it("right ratio", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await subscribe(investor2, tickAmount.mul(2), ticks);
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount.mul(3));
      await pool.connect(other).depositReward(rewardAmount);
      await pool.connect(other).depositReward(rewardAmount.mul(2));
      const balanceI1Before = await tokens[2].balanceOf(investor1.address);
      const balanceI2Before = await tokens[2].balanceOf(investor2.address);
      await planManager.connect(investor1).claimReward(1);
      await planManager.connect(investor2).claimReward(2);
      const balanceI1 = await tokens[2].balanceOf(investor1.address);
      const balanceI2 = await tokens[2].balanceOf(investor2.address);
      expect(balanceI1.sub(balanceI1Before)).to.equal(rewardAmount);
      expect(balanceI2.sub(balanceI2Before)).to.equal(rewardAmount.mul(2));

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await planManager.connect(investor1).claimReward(1);
      await planManager.connect(investor2).claimReward(2);
      const balanceI1After = await tokens[2].balanceOf(investor1.address);
      const balanceI2After = await tokens[2].balanceOf(investor2.address);
      expect(balanceI1After).to.equal(balanceI1);
      expect(balanceI2After).to.equal(balanceI2);
    });
    it("claim again", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount.mul(6));
      await pool.connect(other).depositReward(rewardAmount);
      const balanceBefore = await tokens[2].balanceOf(investor1.address);
      await planManager.connect(investor1).claimReward(1);
      const balance = await tokens[2].balanceOf(investor1.address);
      expect(balance.sub(balanceBefore)).to.equal(rewardAmount);
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await pool.connect(other).depositReward(rewardAmount.mul(3));

      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
      await pool.connect(other).depositReward(rewardAmount.mul(2));
      await planManager.connect(investor1).claimReward(1);
      const balanceAfter = await tokens[2].balanceOf(investor1.address);
      expect(balanceAfter.sub(balance)).to.equal(rewardAmount.mul(5));
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
    it("fails if caller is not investor", async () => {
      await subscribe(investor1, tickAmount, ticks);
      await pool.trigger();
      await pool.initReward(tokens[2].address, other.address);
      await tokens[2].connect(other).approve(pool.address, rewardAmount);
      await pool.connect(other).depositReward(rewardAmount);
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, 1);
      await expect(
        planManager.connect(investor2).claimReward(1)
      ).to.be.revertedWith("Only investor");
    });
  });

  describe("#transferFrom", () => {
    const tokenId = 1;
    beforeEach("mint a plan", async () => {
      await subscribe(investor1, tickAmount, ticks);
    });

    it("can only be called by authorized or owner", async () => {
      await expect(
        planManager.transferFrom(investor1.address, investor2.address, tokenId)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("changes the owner", async () => {
      await planManager
        .connect(investor1)
        .transferFrom(investor1.address, investor2.address, tokenId);
      expect(await planManager.ownerOf(tokenId)).to.eq(investor2.address);
    });

    it("removes existing approval", async () => {
      await planManager.connect(investor1).approve(wallet.address, tokenId);
      expect(await planManager.getApproved(tokenId)).to.eq(wallet.address);
      await planManager.transferFrom(
        investor1.address,
        wallet.address,
        tokenId
      );
      expect(await planManager.getApproved(tokenId)).to.eq(
        constants.AddressZero
      );
    });

    // it('gas', async () => {
    //   await snapshotGasCost(nft.connect(other).transferFrom(other.address, wallet.address, tokenId))
    // })

    // it('gas comes from approved', async () => {
    //   await nft.connect(other).approve(wallet.address, tokenId)
    //   await snapshotGasCost(nft.transferFrom(other.address, wallet.address, tokenId))
    // })
  });

  describe("#permit", () => {
    describe("owned by eoa", () => {
      const tokenId = 1;
      const deadline = Date.now();
      beforeEach("mint a plan", async () => {
        await subscribe(investor1, tickAmount, ticks);
      });

      it("changes the operator of the coverage and increments the nonce", async () => {
        const { v, r, s } = await getPermitNFTSignature(
          investor1,
          planManager,
          investor2.address,
          tokenId,
          deadline
        );
        await planManager.permit(investor2.address, tokenId, deadline, v, r, s);
        expect((await planManager.getPlan(tokenId)).plan.nonce).to.eq(1);
        expect((await planManager.getPlan(tokenId)).plan.operator).to.eq(
          investor2.address
        );
      });

      it("cannot be called twice with the same signature", async () => {
        const { v, r, s } = await getPermitNFTSignature(
          investor1,
          planManager,
          investor2.address,
          tokenId,
          deadline
        );
        await planManager.permit(investor2.address, tokenId, deadline, v, r, s);
        await expect(
          planManager.permit(investor2.address, tokenId, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("fails with invalid signature", async () => {
        const { v, r, s } = await getPermitNFTSignature(
          investor2,
          planManager,
          investor2.address,
          tokenId,
          deadline
        );
        await expect(
          planManager.permit(investor2.address, tokenId, deadline, v + 3, r, s)
        ).to.be.revertedWith("Invalid signature");
      });

      it("fails with signature not from owner", async () => {
        const { v, r, s } = await getPermitNFTSignature(
          investor2,
          planManager,
          investor2.address,
          tokenId,
          deadline
        );
        await expect(
          planManager.permit(investor2.address, tokenId, deadline, v, r, s)
        ).to.be.revertedWith("Unauthorized");
      });

      // it('gas', async () => {
      //   const { v, r, s } = await getPermitNFTSignature(other, coverageManager, wallet.address, tokenId, 1)
      //   await snapshotGasCost(coverageManager.permit(wallet.address, tokenId, 1, v, r, s))
      // })
    });
  });
});
