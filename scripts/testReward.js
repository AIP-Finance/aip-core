const { ethers } = require("hardhat");
const { execSync } = require("child_process");
const {
  abi: erc20Abi,
} = require("../artifacts/contracts/interfaces/IERC20.sol/IERC20.json");
const {
  abi: poolAbi,
  bytecode: poolBytecode,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");

async function main() {
  const [wallet, wallet2] = await ethers.getSigners();

  const pool = new ethers.Contract(
    "0xCB85Fd7d2476bc4f7055722dAb385b4D3C26Cd22",
    poolAbi,
    wallet
  );

  const tx = await pool.initReward(
    "0xb8E688e6fDAf4512f4bE1E43375c124c6BE2abaf",
    wallet2.address
  );
  console.log(tx);

  const test = new ethers.Contract(
    "0xb8E688e6fDAf4512f4bE1E43375c124c6BE2abaf",
    erc20Abi,
    wallet2
  );
  await test.approve(
    "0xCB85Fd7d2476bc4f7055722dAb385b4D3C26Cd22",
    ethers.utils.parseEther("2")
  );

  const tx2 = await pool
    .connect(wallet2)
    .depositReward(ethers.utils.parseEther("1"));
  console.log(tx2);
  const tx3 = await pool.connect(wallet2).claimReward(1);
  console.log(tx3);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
