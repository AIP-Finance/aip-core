const { ethers } = require("hardhat");
const { execSync } = require("child_process");

async function main() {
  poolBytecode = (await ethers.getContractFactory("AipPool")).bytecode;
  const COMPUTED_INIT_CODE_HASH = ethers.utils.keccak256(poolBytecode);
  // console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);

  const output = execSync(`bash ./pool.sh ${COMPUTED_INIT_CODE_HASH}`);
  console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);
  console.log("output", output);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
