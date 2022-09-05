const { utils, BigNumber, constants } = require("ethers");
const bn = require("bignumber.js");
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const {
  abi: uniswapPoolAbi,
  bytecode: uniswapPoolBytecode,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

const FeeAmount = {
  LOW: 500,
  MEDIUM: 3000,
  HIGH: 10000,
};

const TICK_SPACINGS = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};

const TICK_PRICES = {
  [FeeAmount.LOW]: 1,
  [FeeAmount.MEDIUM]: 2,
  [FeeAmount.HIGH]: 3,
};

function encodePriceSqrt(reserve1, reserve0) {
  return BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  );
}

function encodeLiquidity(reserve1, reserve0) {
  return BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .integerValue(3)
      .toString()
  );
}

const getMinTick = (tickSpacing) =>
  Math.ceil(-887272 / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing) =>
  Math.floor(887272 / tickSpacing) * tickSpacing;

function getPoolAddress(factoryAddress, [tokenA, tokenB, fee], bytecode) {
  const [token0, token1] =
    tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
    ["address", "address", "uint24"],
    [token0, token1, fee]
  );
  const create2Inputs = [
    "0xff",
    factoryAddress,
    // salt
    utils.keccak256(constructorArgumentsEncoded),
    // init code. bytecode + constructor arguments
    utils.keccak256(bytecode),
  ];
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`);
}

MIN_SQRT_RATIO = BigNumber.from("4295128739");
MAX_SQRT_RATIO = BigNumber.from(
  "1461446703485210103287273052203988822378723970342"
);

const generateUniswapPool = async (
  mockLiquidityManager,
  swapFactory,
  token0,
  token1,
  fee,
  wallet
) => {
  await token0.approve(mockLiquidityManager.address, constants.MaxUint256);
  await token1.approve(mockLiquidityManager.address, constants.MaxUint256);

  await mockLiquidityManager.createAndInitializePoolIfNecessary(
    token0.address,
    token1.address,
    fee,
    encodePriceSqrt(TICK_PRICES[fee], 1)
  );
  // utils.defaultAbiCoder.decode(["address"], tx.data).map(console.log);
  const pool = await new ethers.Contract(
    getPoolAddress(
      swapFactory.address,
      [token0.address, token1.address, fee],
      uniswapPoolBytecode
    ),
    uniswapPoolAbi,
    wallet
  );

  // const liquidity = encodeLiquidity(TICK_PRICES[fee] * 500, 500);
  // console.log("FE: liquidity %s", liquidity);

  await mockLiquidityManager.addLiquidity(
    {
      token0: token0.address,
      token1: token1.address,
      tickLower: getMinTick(TICK_SPACINGS[fee]),
      tickUpper: getMaxTick(TICK_SPACINGS[fee]),
      fee: fee,
      recipient: wallet.address,
      liquidity: 100,
      // liquidity: parseEther("2"),
    },
    {
      value: utils.parseEther((TICK_PRICES[fee] * 100).toString()),
    }
  );
  return pool;
};

module.exports = {
  // getPoolAddress,
  // getMinTick,
  // getMaxTick,
  // encodePriceSqrt,
  // encodeLiquidity,
  generateUniswapPool,
  FeeAmount,
  // TICK_SPACINGS,
  // TICK_PRICES,
  // MIN_SQRT_RATIO,
  // MAX_SQRT_RATIO,
};
