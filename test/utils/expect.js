const { expect, use } = require("chai");
const { solidity } = require("ethereum-waffle");
const { jestSnapshotPlugin } = require("mocha-chai-jest-snapshot");

use(solidity);
use(jestSnapshotPlugin());

module.exports = { expect };
