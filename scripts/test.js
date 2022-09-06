const { ethers } = require("hardhat");
const { execSync } = require("child_process");
const {
  abi: erc20Abi,
} = require("../artifacts/contracts/interfaces/IERC20.sol/IERC20.json");
const {
  abi: poolAbi,
  bytecode: poolBytecode,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");
const {
  abi: uniPoolAbi,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
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
    "0xdf869C6D7B37d8dF363bd6D9f1936197300816E1",
    [
      "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
      "0xb8E688e6fDAf4512f4bE1E43375c124c6BE2abaf",
      1,
    ],
    poolBytecode
  );

  console.log("poolAddress", poolAddress);

  const pool = new ethers.Contract(poolAddress, poolAbi, wallet2);
  const data = await pool.callStatic.trigger({ gasLimit: 400000 });
  console.log(data);

  // const tx = await pool.burn(wallet2.address, 2, { gasLimit: 500000 });
  // console.log(tx);

  // const pool = new ethers.Contract(
  //   "0xdc631C53885DD296Ea8F5ab3526B0E292c9a40DD",
  //   uniPoolAbi,
  //   wallet2
  // );
  // const tx = await pool.slot0();
  // console.log(tx.sqrtPriceX96.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
