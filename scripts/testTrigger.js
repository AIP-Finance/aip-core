const { ethers } = require("hardhat");
const { execSync } = require("child_process");
const {
  abi: erc20Abi,
} = require("../artifacts/contracts/interfaces/IERC20.sol/IERC20.json");
const {
  abi: poolAbi,
  bytecode: poolBytecode,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");
const { getCreate2Address } = require("../test/utils/helpers");
async function main() {
  const [wallet, wallet2] = await ethers.getSigners();
  // const usdt = new ethers.Contract(
  //   "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
  //   erc20Abi,
  //   wallet2
  // );
  // const tx = await usdt.approve(
  //   "0x5f200337b1d6574203a25e3F23bCf16855Ae4AF2",
  //   ethers.utils.parseEther("20")
  // );
  // console.log(tx);

  poolAddress = getCreate2Address(
    "0x65170bC4066da2c2A6DCb4441E02A927fE6E9d59",
    [
      "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
      "0xE06c2497422b6428350E2E7da24d3FE816166983",
      1,
    ],
    poolBytecode
  );

  console.log("poolAddress", poolAddress);

  const pool = new ethers.Contract(poolAddress, poolAbi, wallet2);
  const data = await pool.callStatic.trigger({ gasLimit: 400000 });
  console.log(data);

  const tx = await pool.trigger({ gasLimit: 400000 });
  console.log(tx);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });