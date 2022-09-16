const { Wallet, utils, constants } = require("ethers");
const { ethers, waffle } = require("hardhat");
const { expect } = require("./utils/expect");
const { getCreate2Address, getPoolId } = require("./utils/helpers");
const { completeFixture } = require("./utils/fixtures");
// import snapshotGasCost from "./shared/snapshotGasCost";

const {
  abi: poolAbi,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");
const { generateUniswapPool, FeeAmount } = require("./utils/uniswapHelpers");
const { TIME_UNIT } = require("./utils/constants");

const frequency = 3;
const rewardAmount = utils.parseEther("10");
const tickAmount = utils.parseEther("10");

const createFixtureLoader = waffle.createFixtureLoader;

describe("PoolReward", () => {
  let wallet, operator, other;

  let factory;
  let planManager;
  let tokens;
  let usdt;
  let poolBytecode;

  const subscribe = () =>
    planManager
      .connect(other)
      .mint([
        usdt.address,
        tokens[1].address,
        frequency,
        other.address,
        other.address,
        tickAmount,
        3,
      ]);

  const fixture = async (wallets, provider) => {
    const {
      factory,
      swapFactory,
      planManager,
      swapManager,
      mockLiquidityManager,
      tokens,
      dai,
      usdc,
      usdt,
      weth9,
    } = await completeFixture(wallets, provider);

    await factory.enable(
      swapManager.address,
      dai.address,
      usdc.address,
      usdt.address,
      weth9.address
    );

    usdt.connect(other).approve(planManager.address, constants.MaxUint256);
    usdt.approve(mockLiquidityManager.address, constants.MaxUint256);
    await usdt.transfer(other.address, utils.parseEther("1000000"));

    // approve & fund wallets
    for (const token of tokens) {
      await token
        .connect(other)
        .approve(planManager.address, constants.MaxUint256);

      await token.transfer(other.address, utils.parseEther("1000000"));
      await token.transfer(operator.address, utils.parseEther("1000000"));
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
      factory,
      planManager,
      tokens,
      usdt,
    };
  };

  let loadFixture;
  before("create fixture loader", async () => {
    [wallet, operator, other] = await ethers.getSigners();
    loadFixture = createFixtureLoader([wallet, operator, other]);
  });

  before("load pool bytecode", async () => {
    poolBytecode = (await ethers.getContractFactory("AipPool")).bytecode;
    const COMPUTED_INIT_CODE_HASH = utils.keccak256(poolBytecode);
    console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);
  });

  beforeEach("deploy factory", async () => {
    ({ factory, planManager, tokens, usdt } = await loadFixture(fixture));
  });

  beforeEach("create pool", async () => {
    await factory.createPool(usdt.address, tokens[1].address, frequency);
    poolAddress = getCreate2Address(
      factory.address,
      [usdt.address, tokens[1].address, frequency],
      poolBytecode
    );
    pool = await new ethers.Contract(poolAddress, poolAbi, wallet);
  });

  describe("#initReward", () => {
    it("success", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      expect(await pool.rewardToken()).to.eq(tokens[2].address);
      expect(await pool.rewardOperator()).to.eq(operator.address);
    });
    it("fails if caller is not factory owner", async () => {
      await expect(
        pool.connect(operator).initReward(tokens[2].address, operator.address)
      ).to.be.reverted;
    });
    it("fails if address is zero", async () => {
      await expect(
        pool.initReward(constants.AddressZero, operator.address)
      ).to.be.revertedWith("Invalid token address");
      await expect(
        pool.initReward(tokens[2].address, constants.AddressZero)
      ).to.be.revertedWith("Invalid operator address");
      await expect(
        pool.initReward(constants.AddressZero, constants.AddressZero)
      ).to.be.reverted;
    });
    it("fails if call again", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await expect(
        pool.connect(operator).initReward(tokens[2].address, operator.address)
      ).to.be.reverted;
    });

    it("emits event", async () => {
      await expect(pool.initReward(tokens[2].address, operator.address))
        .to.emit(pool, "InitReward")
        .withArgs(tokens[2].address, operator.address);
    });
  });

  describe("#changeRewardOperator", () => {
    it("success", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await pool.changeRewardOperator(other.address);
      expect(await pool.rewardOperator()).to.eq(other.address);
    });
    it("fails if caller is not factory owner", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await expect(pool.connect(operator).changeRewardOperator(other.address))
        .to.be.reverted;
      await expect(pool.connect(other).changeRewardOperator(other.address)).to
        .be.reverted;
    });
    it("fails if address is zero", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await expect(
        pool.changeRewardOperator(constants.AddressZero)
      ).to.be.revertedWith("Invalid address");
    });

    it("fails if reward not initialized yet", async () => {
      await expect(pool.changeRewardOperator(other.address)).to.be.revertedWith(
        "Operator is not exist"
      );
    });

    it("emits event", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await expect(pool.changeRewardOperator(other.address))
        .to.emit(pool, "RewardOperatorChanged")
        .withArgs(operator.address, other.address);
    });
  });

  describe("#depositReward", () => {
    beforeEach(async () => {
      await subscribe();
      await pool.trigger();
      await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
      await ethers.provider.send("evm_mine");
      await pool.trigger();
    });
    it("success", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await tokens[2].connect(operator).approve(pool.address, rewardAmount);

      await pool.connect(operator).depositReward(rewardAmount);
      const { reward } = await pool.tickInfo(2);
      expect(rewardAmount).to.equal(reward);
    });
    it("fails if caller is not operator", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await expect(pool.depositReward(rewardAmount)).to.be.reverted;
      await expect(pool.connect(other).depositReward(rewardAmount)).to.be
        .reverted;
    });

    it("fails if insufficient token funds", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await tokens[2]
        .connect(operator)
        .approve(pool.address, rewardAmount.sub(1));
      await expect(
        pool.connect(operator).depositReward(rewardAmount)
      ).to.be.revertedWith("STF");
    });

    it("emits event", async () => {
      await pool.initReward(tokens[2].address, operator.address);
      await tokens[2].connect(operator).approve(pool.address, rewardAmount);
      await expect(pool.connect(operator).depositReward(rewardAmount))
        .to.emit(pool, "DepositReward")
        .withArgs(rewardAmount);
    });
  });
  describe("#collectProtocol", () => {
    it("returns 0 if no fees", async () => {
      const amount = await pool.callStatic.collectProtocol(
        wallet.address,
        constants.MaxUint256
      );
      expect(amount).to.be.eq(0);
    });
    it("success", async () => {
      await subscribe();
      await pool.trigger();
      const protocolFee = await pool.protocolFee();
      const balance0Before = await usdt.balanceOf(wallet.address);
      await pool.collectProtocol(wallet.address, constants.MaxUint256);
      const balance0 = await usdt.balanceOf(wallet.address);

      expect(balance0.sub(balance0Before)).to.equal(protocolFee.sub(1));
    });
    it("emits event", async () => {
      await subscribe();
      await pool.trigger();
      const protocolFee = await pool.protocolFee();
      await expect(pool.collectProtocol(other.address, constants.MaxUint256))
        .to.be.emit(pool, "CollectProtocol")
        .withArgs(wallet.address, other.address, protocolFee.sub(1));
    });
  });
});
