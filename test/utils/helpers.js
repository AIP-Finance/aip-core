const { utils, BigNumber } = require("ethers");

function getCreate2Address(
  factoryAddress,
  [token0, token1, frequency],
  bytecode
) {
  const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
    ["address", "address", "uint8"],
    [token0, token1, frequency]
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

function getPoolId(token0, token1, frequency) {
  const hexString = utils.keccak256(
    utils.defaultAbiCoder.encode(
      ["address", "address", "uint8"],
      [token0, token1, frequency]
    )
  );
  return BigNumber.from(hexString);
}

module.exports = {
  getCreate2Address,
  getPoolId,
};
