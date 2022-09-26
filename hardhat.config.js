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
    rinkeby: {
      url: process.env.RINKEBY_NODE_URL,
      accounts: [
        `0x${process.env.PRIVATE_KEY_1}`,
        `0x${process.env.PRIVATE_KEY_2}`,
      ],
      DAI: "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735",
      USDC: "0xc1fF7d0c1d13E18cDbF824C61B854d234DaF0255",
      USDT: "0x8004f66F0d4eE4032C727B1F185404d14b965F00",
      TI1: "0x5bfC833BC041DCb65D8294C2DD9C817D71aEa9b8",
      WETH9: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
      uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
    ropsten: {
      url: process.env.ROPSTEN_NODE_URL,
      accounts: [
        `0x${process.env.PRIVATE_KEY_1}`,
        `0x${process.env.PRIVATE_KEY_2}`,
      ],
      DAI: "0xd6e992c9A794A599DA83812b9D27B14876C25F73",
      USDC: "0xc1A2e73109201214AD9F695eB56B9bC6EC7471cF",
      USDT: "0xD3F4aB2AA30a4B9254476b8e35536f218D2C10cA",
      TI1: "0xE06c2497422b6428350E2E7da24d3FE816166983",
      WETH9: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
      uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
    mainnet: {
      url: process.env.MAINNET_NODE_URL,
      accounts: [
        `0x${process.env.PRIVATE_KEY_1}`,
        `0x${process.env.PRIVATE_KEY_2}`,
      ],
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      TI1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      WETH9: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
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
