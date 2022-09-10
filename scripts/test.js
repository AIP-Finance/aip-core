const { ethers } = require("hardhat");
const { execSync } = require("child_process");
const {
  abi: erc20Abi,
} = require("../artifacts/contracts/interfaces/IERC20.sol/IERC20.json");
const {
  abi: planManagerAbi,
} = require("../artifacts/contracts/NonfungiblePlanManager.sol/NonfungiblePlanManager.json");
const { getCreate2Address } = require("../test/utils/helpers");
async function main() {
  const [wallet, wallet2] = await ethers.getSigners();

  const planManager = new ethers.Contract(
    "0x87cDb1d9b36CD4CA6097aB3173a15Cbe79644bB8",
    planManagerAbi,
    wallet2
  );
  const data = await planManager.tokenURI(1, { gasLimit: 500000 });
  console.log(data);
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
