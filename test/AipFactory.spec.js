const { Wallet, utils } = require("ethers");
const { ethers, waffle } = require("hardhat");
const { expect } = require("./utils/expect");
const { getCreate2Address, getPoolId } = require("./utils/helpers");
const { completeFixture } = require("./utils/fixtures");
// import snapshotGasCost from "./shared/snapshotGasCost";

const { constants } = ethers;

const TEST_ADDRESSES = [
  "0x1000000000000000000000000000000000000000",
  "0x2000000000000000000000000000000000000000",
];

//  "0x5b3e2bc1da86ff6235d9ead4504d598cae77dbcb"

const createFixtureLoader = waffle.createFixtureLoader;

describe("AipFactory", () => {
  let wallet, other;

  let factory;
  let swapManager;
  let planManager;
  let dai, usdc, usdt;
  let weth9;
  let poolBytecode;
  const fixture = async (wallets, provider) => {
    const { factory, swapManager, planManager, weth9, dai, usdc, usdt } =
      await completeFixture(wallets, provider);
    return { factory, swapManager, planManager, weth9, dai, usdc, usdt };
  };

  let loadFixture;
  before("create fixture loader", async () => {
    [wallet, other] = await ethers.getSigners();
    loadFixture = createFixtureLoader([wallet, other]);
  });

  before("load pool bytecode", async () => {
    poolBytecode = (await ethers.getContractFactory("AipPool")).bytecode;
    const COMPUTED_INIT_CODE_HASH = utils.keccak256(poolBytecode);
    console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);
  });

  beforeEach("deploy factory", async () => {
    ({ factory, swapManager, planManager, weth9, dai, usdc, usdt } =
      await loadFixture(fixture));
  });

  it("owner is deployer", async () => {
    expect(await factory.owner()).to.eq(wallet.address);
  });

  // it("factory bytecode size", async () => {
  //   expect(
  //     ((await waffle.provider.getCode(factory.address)).length - 2) / 2
  //   ).to.matchSnapshot();
  // });

  // it("pool bytecode size", async () => {
  //   await factory.createPool(...TEST_ADDRESSES, ...PARAMS);
  //   const poolAddress = getCreate2Address(
  //     factory.address,
  //     [...TEST_ADDRESSES, ...PARAMS],
  //     poolBytecode
  //   );
  //   expect(
  //     ((await waffle.provider.getCode(poolAddress)).length - 2) / 2
  //   ).to.matchSnapshot();
  // });

  async function createAndCheckPool(token0, token1, frequency) {
    const create2Address = getCreate2Address(
      factory.address,
      [token0, token1, frequency],
      poolBytecode
    );
    const create = factory.createPool(token0, token1, frequency);

    await expect(create)
      .to.emit(factory, "PoolCreated")
      .withArgs(token0, token1, frequency, create2Address);

    // await expect(
    //   factory.createPool(
    //     token0,
    //     token1,
    //     minPeriodD,
    //     maxPeriodD,
    //     dailyPremiumRate,
    //     lossCoverRate,
    //     minCoverageAmount1,
    //     maxCoverageAmount1
    //   )
    // ).to.be.reverted;
    expect(
      await factory.getPool(token0, token1, frequency),
      "getPool by params"
    ).to.eq(create2Address);

    // const poolContractFactory = await ethers.getContractFactory("AipPool");
    // const pool = poolContractFactory.attach(create2Address);
    // expect(await pool.factory(), "pool factory address").to.eq(factory.address);
    // expect(await pool.token0(), "pool token0").to.eq(TEST_ADDRESSES[0]);
    // expect(await pool.token1(), "pool token1").to.eq(TEST_ADDRESSES[1]);
  }

  describe("#createPool", () => {
    const enableFactory = async () =>
      await factory.enable(
        swapManager.address,
        dai.address,
        usdc.address,
        usdt.address,
        weth9.address
      );
    it("succeeds for create pool with DAI", async () => {
      await enableFactory();
      await createAndCheckPool(dai.address, TEST_ADDRESSES[0], 1);
    });
    it("succeeds for create pool with USDC", async () => {
      await enableFactory();
      await createAndCheckPool(usdc.address, TEST_ADDRESSES[0], 1);
    });
    it("succeeds for create pool with USDT", async () => {
      await enableFactory();
      await createAndCheckPool(usdt.address, TEST_ADDRESSES[0], 1);
    });

    it("fails if factory is not enabled", async () => {
      await expect(
        factory.createPool(usdt.address, TEST_ADDRESSES[0], 1)
      ).to.be.revertedWith("Not enabled");
    });

    it("fails if token a is not DAI, USDC, USDT", async () => {
      await enableFactory();
      await expect(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], 1))
        .to.be.reverted;
    });

    it("fails if token a == token b", async () => {
      await enableFactory();
      await expect(factory.createPool(dai.address, dai.address, 1)).to.be
        .reverted;
    });

    it("fails if frequency is invalid", async () => {
      await enableFactory();
      await expect(
        factory.createPool(dai.address, TEST_ADDRESSES[0], 0)
      ).to.be.revertedWith("Invalid date");
      await expect(
        factory.createPool(dai.address, TEST_ADDRESSES[0], 31)
      ).to.be.revertedWith("Invalid date");
    });

    it("fails if token a is 0 or token b is 0", async () => {
      await enableFactory();
      await expect(factory.createPool(dai.address, constants.AddressZero, 1)).to
        .be.reverted;
      await expect(factory.createPool(constants.AddressZero, dai.address, 1)).to
        .be.reverted;
      await expect(
        factory.createPool(constants.AddressZero, constants.AddressZero, 1)
      ).to.be.revertedWith("");
    });

    //   it('fails if fee amount is not enabled', async () => {
    //     await expect(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], 250)).to.be.reverted
    //   })

    //   it('gas', async () => {
    //     await snapshotGasCost(factory.createPool(TEST_ADDRESSES[0], TEST_ADDRESSES[1], FeeAmount.MEDIUM))
    //   })
  });

  describe("#setOwner", () => {
    it("fails if caller is not owner", async () => {
      await expect(factory.connect(other).setOwner(wallet.address)).to.be
        .reverted;
    });

    it("updates owner", async () => {
      await factory.setOwner(other.address);
      expect(await factory.owner()).to.eq(other.address);
    });

    it("emits event", async () => {
      await expect(factory.setOwner(other.address))
        .to.emit(factory, "OwnerChanged")
        .withArgs(wallet.address, other.address);
    });

    it("cannot be called by original owner", async () => {
      await factory.setOwner(other.address);
      await expect(factory.setOwner(wallet.address)).to.be.reverted;
    });
  });

  describe("#enable", () => {
    it("success", async () => {
      await factory.enable(
        swapManager.address,
        dai.address,
        usdc.address,
        usdt.address,
        weth9.address
      );
      expect(await factory.enabled()).to.eq(true);
      expect(await factory.swapManager()).to.eq(swapManager.address);
      expect(await factory.DAI()).to.eq(dai.address);
      expect(await factory.USDC()).to.eq(usdc.address);
      expect(await factory.USDT()).to.eq(usdt.address);
      expect(await factory.WETH9()).to.eq(weth9.address);
    });
    it("fails if caller is not owner", async () => {
      await expect(
        factory
          .connect(other)
          .enable(
            swapManager.address,
            dai.address,
            usdc.address,
            usdt.address,
            weth9.address
          )
      ).to.be.reverted;
    });

    it("emits event", async () => {
      await expect(
        factory.enable(
          swapManager.address,
          dai.address,
          usdc.address,
          usdt.address,
          weth9.address
        )
      )
        .to.emit(factory, "Enabled")
        .withArgs(
          swapManager.address,
          dai.address,
          usdc.address,
          usdt.address,
          weth9.address
        );
    });

    it("fails if calls again", async () => {
      await factory.enable(
        swapManager.address,
        dai.address,
        usdc.address,
        usdt.address,
        weth9.address
      );
      await expect(
        factory.enable(
          swapManager.address,
          dai.address,
          usdc.address,
          usdt.address,
          weth9.address
        )
      ).to.be.revertedWith("Enabled");
    });
    it("fails if zero address input", async () => {
      await expect(
        factory.enable(
          constants.AddressZero,
          dai.address,
          usdc.address,
          usdt.address,
          weth9.address
        )
      ).to.be.reverted;
      await expect(
        factory.enable(
          swapManager.address,
          constants.AddressZero,
          usdc.address,
          usdt.address,
          weth9.address
        )
      ).to.be.reverted;
      await expect(
        factory.enable(
          swapManager.address,
          dai.address,
          constants.AddressZero,
          usdt.address,
          weth9.address
        )
      ).to.be.reverted;
      await expect(
        factory.enable(
          swapManager.address,
          dai.address,
          usdc.address,
          constants.AddressZero,
          weth9.address
        )
      ).to.be.reverted;
      await expect(
        factory.enable(
          swapManager.address,
          dai.address,
          usdc.address,
          usdt.address,
          constants.AddressZero
        )
      ).to.be.reverted;
    });
  });
});
