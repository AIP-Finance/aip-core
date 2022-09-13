const { ethers } = require("hardhat");
const hre = require("hardhat");
const fs = require("fs");
const { execSync } = require("child_process");

async function deploy() {
  const [wallet] = await ethers.getSigners();

  const testUSDTFactory = await ethers.getContractFactory("TestUSDT");
  const initialSupply = ethers.utils.parseEther("32000000000");
  const testUSDT = await testUSDTFactory.deploy(initialSupply);
  const testUSDTDeployed = await testUSDT.deployed();
  console.log("testUSDTAddress:", testUSDTDeployed.address);

  await hre.run("verify:verify", {
    address: testUSDTDeployed.address,
    constructorArguments: [initialSupply],
  });
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
