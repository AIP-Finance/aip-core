const { ethers } = require("hardhat");
const hre = require("hardhat");
const fs = require("fs");
const { execSync } = require("child_process");
const {
  abi: planManagerAbi,
} = require("../artifacts/contracts/NonfungiblePlanManager.sol/NonfungiblePlanManager.json");

async function deploy() {
  const [wallet, wallet2] = await ethers.getSigners();
  const dai = hre.network.config.DAI;
  const usdc = hre.network.config.USDC;
  const usdt = hre.network.config.USDT;
  const weth9 = hre.network.config.WETH9;
  const swapFactory = hre.network.config.uniswapFactory;
  const swapManagerFactory = await ethers.getContractFactory("UniswapManager");
  const swapManager = await swapManagerFactory.deploy(swapFactory, weth9);
  const swapManagerDeployed = await swapManager.deployed();
  console.log("swapManagerAddress:", swapManagerDeployed.address);

  const factoryFactory = await ethers.getContractFactory("AipFactory");
  const factory = await factoryFactory.deploy();
  const factoryDeployed = await factory.deployed();
  console.log("factoryAddress:", factoryDeployed.address);
  const planManagerFactory = await ethers.getContractFactory(
    "NonfungiblePlanManager"
  );
  const planManager = await planManagerFactory.deploy(factoryDeployed.address);
  const planManagerDeployed = await planManager.deployed();
  console.log("planManagerAddress:", planManagerDeployed.address);

  await factory.enable(
    swapManagerDeployed.address,
    planManagerDeployed.address,
    dai,
    usdc,
    usdt,
    weth9
  );

  // const planManager = new ethers.Contract(
  //   "0xadd39eA9a42A51C4666637535B670194Ad121A97", // PLAN_MANAGER_ADDRESS
  //   planManagerAbi,
  //   wallet2
  // );

  const tokens = [
    "0xE06c2497422b6428350E2E7da24d3FE816166983",
    "0xb8E688e6fDAf4512f4bE1E43375c124c6BE2abaf",
  ];
  const frequencies = [1, 7, 14, 30];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < frequencies.length; j++) {
      const result = await planManager.callStatic.createPoolIfNecessary({
        token0: "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
        token1: tokens[i],
        frequency: frequencies[j],
      });
      console.log(result);
      await planManager.createPoolIfNecessary({
        token0: "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
        token1: tokens[i],
        frequency: frequencies[j],
      });
    }
  }

  // const factoryDeployed = {
  //   address: "0x65170bC4066da2c2A6DCb4441E02A927fE6E9d59",
  // };

  // const swapManagerDeployed = {
  //   address: "0x4F4F29130B4C0C5c04A2C4DBB085888E9FB79f55",
  // };

  // const planManagerDeployed = {
  //   address: "0xadd39eA9a42A51C4666637535B670194Ad121A97",
  // };

  await hre.run("verify:verify", {
    address: factoryDeployed.address,
    constructorArguments: [],
  });

  await hre.run("verify:verify", {
    address: swapManagerDeployed.address,
    constructorArguments: [swapFactory, weth9],
  });

  await hre.run("verify:verify", {
    address: planManagerDeployed.address,
    constructorArguments: [factoryDeployed.address],
  });
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
