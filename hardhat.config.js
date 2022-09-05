require("dotenv").config();
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");

// const { internalTask, task } = require("hardhat/config");
// const {
//   TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
// } = require("hardhat/builtin-tasks/task-names");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

// function addIfNotPresent(array, value) {
//   if (array.indexOf(value) === -1) {
//     array.push(value);
//   }
// }

// function setupExtraSolcSettings(settings) {
//   settings.metadata = settings.metadata || {};
//   settings.libraries = settings.libraries || {};

//   // if (settings.outputSelection === undefined) {
//   settings.outputSelection = {
//     "*": {
//       "*": [],
//     },
//   };
//   // }
//   // if (settings.outputSelection["*"] === undefined) {
//   //   settings.outputSelection["*"] = {
//   //     "*": [],
//   //     "": [],
//   //   };
//   // }
//   // if (settings.outputSelection["*"]["*"] === undefined) {
//   //   settings.outputSelection["*"]["*"] = [];
//   // }
//   // if (settings.outputSelection["*"][""] === undefined) {
//   //   settings.outputSelection["*"][""] = [];
//   // }
//   addIfNotPresent(settings.outputSelection["*"]["*"], "evm.bytecode");
//   addIfNotPresent(settings.outputSelection["*"]["*"], "evm.deployedBytecode");
//   addIfNotPresent(settings.outputSelection["*"]["*"], "abi");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "metadata");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "devdoc");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "userdoc");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "storageLayout");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "evm.methodIdentifiers");
//   // addIfNotPresent(settings.outputSelection["*"]["*"], "evm.gasEstimates");
//   // addIfNotPresent(settings.outputSelection["*"][""], "ir");
//   // addIfNotPresent(settings.outputSelection["*"][""], "irOptimized");
//   // addIfNotPresent(settings.outputSelection["*"][""], "ast");
// }

// internalTask(TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT).setAction(
//   async (_, __, runSuper) => {
//     const input = await runSuper();
//     setupExtraSolcSettings(input.settings);

//     return input;
//   }
// );

module.exports = {
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: false,
    },
    testnet: {
      url: process.env.TESTNET_NODE_URL,
      accounts: [
        `0x${process.env.PRIVATE_KEY_1}`,
        `0x${process.env.PRIVATE_KEY_2}`,
      ],
      DAI: "0xd6e992c9A794A599DA83812b9D27B14876C25F73",
      USDC: "0xc1A2e73109201214AD9F695eB56B9bC6EC7471cF",
      USDT: "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
      UNI: "0xE06c2497422b6428350E2E7da24d3FE816166983",
      WETH9: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
      uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
    mainnet: {
      url: process.env.MAINNET_NODE_URL,
      accounts: [
        `0x${process.env.PRIVATE_KEY_1}`,
        `0x${process.env.PRIVATE_KEY_2}`,
      ],
    },
  },
  gasReporter: {
    currency: "USD",
    token: "ETH",
    gasPrice: 22,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
