const { waffle } = require("hardhat");

const {
  abi: FACTORY_ABI,
  bytecode: FACTORY_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");

const { constants } = require("ethers");
const WETH9 = require("../contracts/WETH9.json");

async function wethFixture([wallet]) {
  const weth9 = await waffle.deployContract(wallet, {
    bytecode: WETH9.bytecode,
    abi: WETH9.abi,
  });
  return { weth9 };
}

async function v3CoreFactoryFixture([wallet]) {
  return await waffle.deployContract(wallet, {
    bytecode: FACTORY_BYTECODE,
    abi: FACTORY_ABI,
  });
}

async function completeFixture([wallet], provider) {
  const { weth9 } = await wethFixture([wallet]);
  const swapFactory = await v3CoreFactoryFixture([wallet]);
  const tokenFactory = await ethers.getContractFactory("TestERC20");
  const tokens = [
    await tokenFactory.deploy(constants.MaxUint256.div(2)),
    await tokenFactory.deploy(constants.MaxUint256.div(2)),
    await tokenFactory.deploy(constants.MaxUint256.div(2)),
  ];
  const dai = await tokenFactory.deploy(constants.MaxUint256.div(2));
  const usdc = await tokenFactory.deploy(constants.MaxUint256.div(2));
  const usdt = await tokenFactory.deploy(constants.MaxUint256.div(2));
  // if (usdt.address < tokens[1].address) {
  //   const tmp = usdt;
  //   usdt = tokens[1];
  //   tokens[1] = tmp;
  // }
  const mockLiquidityManagerFactory = await ethers.getContractFactory(
    "MockLiquidityManager"
  );
  const mockLiquidityManager = await mockLiquidityManagerFactory.deploy(
    swapFactory.address,
    weth9.address
  );
  const swapManagerFactory = await ethers.getContractFactory("UniswapManager");
  const swapManager = await swapManagerFactory.deploy(
    swapFactory.address,
    weth9.address
  );

  const factoryFactory = await ethers.getContractFactory("AipFactory");
  const factory = await factoryFactory.deploy();
  const planManagerFactory = await ethers.getContractFactory(
    "NonfungiblePlanManager"
  );
  const planManager = await planManagerFactory.deploy(factory.address);

  return {
    weth9,
    dai,
    usdc,
    usdt,
    factory,
    swapFactory,
    mockLiquidityManager,
    planManager,
    swapManager,
    tokens,
  };
}

module.exports = {
  completeFixture,
};
