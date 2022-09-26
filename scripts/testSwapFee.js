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
const { FeeAmount } = require("../test/utils/uniswapHelpers");
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

  // poolAddress = getCreate2Address(
  //   "0x1Df28F18341dA507d985D1341Afc69A810404389",
  //   [
  //     "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
  //     "0xE06c2497422b6428350E2E7da24d3FE816166983",
  //     1,
  //   ],
  //   poolBytecode
  // );

  // console.log("poolAddress", poolAddress);

  const pools = [
    "0x89E6E6bc6de6015c2930e0C2d5Ab3A3DEc8643F7",
    "0xFBd5bC31aAA39e379662E5B90b317191DEFb530c",
    "0xd5617c303F004C15d31be0b80e36723f81d63A9E",
    "0xA31555652d7C6c502f37781AD29C9BdA4B4062c4",
  ];

  for (let i = 0; i < pools.length; i++) {
    const pool = new ethers.Contract(pools[i], poolAbi, wallet);
    const tx = await pool.setSwapFee(FeeAmount.LOW, FeeAmount.LOW);
    console.log(tx);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
