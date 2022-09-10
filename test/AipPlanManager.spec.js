const { utils, BigNumber, constants } = require("ethers");
const { ethers, waffle } = require("hardhat");

const {
  abi: poolAbi,
} = require("../artifacts/contracts/AipPool.sol/AipPool.json");

const { expect } = require("./utils/expect");
const { getCreate2Address } = require("./utils/helpers");
const { generateUniswapPool, FeeAmount } = require("./utils/uniswapHelpers");
const { completeFixture } = require("./utils/fixtures");
const { TIME_UNIT, PROCESSING_GAS } = require("./utils/constants");
const getPermitNFTSignature = require("./utils/getPermitNFTSignature");

let wallet, investor1, investor2, other;
let weth9;
let tokens;
let planManager;
let swapManager;
let usdt;
let factory;
let poolBytecode;
let pool;
let poolAddress;

const PROTOCOL_FEE = 1000; // 1/x

const frequency = 3;
const tickAmount0 = 10;
const ticks = 3;
const tickAmount = utils.parseEther(tickAmount0.toString());

const subscribe = (investor, tickAmount, periods) =>
  planManager
    .connect(investor)
    .mint([
      investor.address,
      usdt.address,
      tokens[1].address,
      frequency,
      tickAmount,
      periods,
    ]);

const getTriggerFee = async () => {
  const { gasPrice } = await ethers.provider.getFeeData();
  const gasFee = gasPrice.mul(PROCESSING_GAS);

  // console.log("gasFee", gasFee.toString());

  const price = await swapManager.poolPrice(
    usdt.address,
    weth9.address,
    FeeAmount.MEDIUM
  );
  return gasFee.mul(utils.parseEther("1")).div(price);
};

const swapWithoutProtocolFee = async (amount) => {
  const triggerFee = await getTriggerFee();
  return swapManager
    .connect(other)
    .callStatic.swap(
      usdt.address,
      tokens[1].address,
      FeeAmount.MEDIUM,
      other.address,
      true,
      amount.sub(amount.div(PROTOCOL_FEE)).sub(triggerFee)
    );
};

describe("NonfungiblePlanManager", () => {
  const createFixtureLoader = waffle.createFixtureLoader;

  const fixture = async (wallets, provider) => {
    const {
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      dai,
      usdc,
      usdt,
    } = await completeFixture(wallets, provider);

    await factory.enable(
      swapManager.address,
      planManager.address,
      dai.address,
      usdc.address,
      usdt.address,
      weth9.address
    );

    await usdt
      .connect(other)
      .approve(swapManager.address, constants.MaxUint256);

    usdt.connect(investor1).approve(planManager.address, constants.MaxUint256);
    usdt.connect(investor2).approve(planManager.address, constants.MaxUint256);
    usdt
      .connect(other)
      .approve(mockLiquidityManager.address, constants.MaxUint256);
    await usdt.transfer(investor1.address, utils.parseEther("1000000"));
    await usdt.transfer(investor2.address, utils.parseEther("1000000"));
    await usdt.transfer(other.address, utils.parseEther("1000000"));

    // approve & fund wallets
    for (const token of tokens) {
      await token
        .connect(investor1)
        .approve(planManager.address, constants.MaxUint256);

      await token
        .connect(investor2)
        .approve(planManager.address, constants.MaxUint256);

      await token
        .connect(other)
        .approve(swapManager.address, constants.MaxUint256);

      await token.transfer(investor1.address, utils.parseEther("1000000"));
      await token.transfer(investor2.address, utils.parseEther("1000000"));
      await token.transfer(other.address, utils.parseEther("1000000"));
    }

    await generateUniswapPool(
      mockLiquidityManager,
      swapFactory,
      usdt,
      weth9,
      FeeAmount.MEDIUM,
      wallet
    );

    await generateUniswapPool(
      mockLiquidityManager,
      swapFactory,
      usdt,
      tokens[1],
      FeeAmount.MEDIUM,
      wallet
    );

    return {
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      usdt,
    };
  };

  let loadFixture;
  before("create fixture loader", async () => {
    [wallet, investor1, investor2, other] = await ethers.getSigners();
    loadFixture = createFixtureLoader([wallet, investor1, investor2, other]);
  });

  beforeEach("load fixture", async () => {
    ({
      weth9,
      factory,
      swapFactory,
      swapManager,
      mockLiquidityManager,
      planManager,
      tokens,
      dai,
      usdc,
      usdt,
    } = await loadFixture(fixture));
  });

  before("load pool bytecode", async () => {
    poolBytecode = (await ethers.getContractFactory("AipPool")).bytecode;
    const COMPUTED_INIT_CODE_HASH = utils.keccak256(poolBytecode);
    console.log("COMPUTED_INIT_CODE_HASH", COMPUTED_INIT_CODE_HASH);
  });

  // it("bytecode size", async () => {
  //   expect(
  //     ((await coverageManager.provider.getCode(coverageManager.address))
  //       .length -
  //       2) /
  //       2
  //   ).to.matchSnapshot();
  // });

  beforeEach("create pool", async () => {
    await planManager.createPoolIfNecessary([
      usdt.address,
      tokens[1].address,
      frequency,
    ]);
    poolAddress = getCreate2Address(
      factory.address,
      [usdt.address, tokens[1].address, frequency],
      poolBytecode
    );
    pool = await new ethers.Contract(poolAddress, poolAbi, wallet);
  });

  // describe("#setSwapFee", () => {
  //   it("success", async () => {
  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       weth9,
  //       FeeAmount.LOW,
  //       wallet
  //     );
  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       tokens[1],
  //       FeeAmount.HIGH,
  //       wallet
  //     );
  //     await pool.setSwapFee(FeeAmount.HIGH, FeeAmount.LOW);
  //     expect((await pool.swapFee()).toString()).equal(
  //       FeeAmount.HIGH.toString()
  //     );
  //     expect((await pool.swapWETH9Fee()).toString()).equal(
  //       FeeAmount.LOW.toString()
  //     );
  //   });
  //   it("fails if requester is not factory owner", async () => {
  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       weth9,
  //       FeeAmount.LOW,
  //       wallet
  //     );
  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       tokens[1],
  //       FeeAmount.LOW,
  //       wallet
  //     );
  //     await expect(
  //       pool.connect(investor1).setSwapFee(FeeAmount.LOW, FeeAmount.LOW)
  //     ).to.be.reverted;
  //   });
  //   it("fails if token0 token1 pool is not exist", async () => {
  //     await expect(pool.setSwapFee(FeeAmount.LOW, FeeAmount.MEDIUM)).to.be
  //       .reverted;
  //   });
  //   it("fails if token0 weth9 pool is not exist", async () => {
  //     await expect(pool.setSwapFee(FeeAmount.MEDIUM, FeeAmount.LOW)).to.be
  //       .reverted;
  //   });
  // });

  // describe("#poolPrice", () => {
  //   it("equal uniswap pool", async () => {
  //     const price = await pool.price();

  //     expect(Number(utils.formatEther(price))).to.be.approximately(
  //       2,
  //       0.00000001
  //     );
  //   });

  //   it("equal uniswap pool if change fee", async () => {
  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       weth9,
  //       FeeAmount.LOW,
  //       wallet
  //     );

  //     await generateUniswapPool(
  //       mockLiquidityManager,
  //       swapFactory,
  //       usdt,
  //       tokens[1],
  //       FeeAmount.LOW,
  //       wallet
  //     );

  //     await pool.setSwapFee(FeeAmount.LOW, FeeAmount.LOW);

  //     const price = await pool.price();

  //     expect(Number(utils.formatEther(price))).to.be.approximately(
  //       1,
  //       0.00000001
  //     );
  //   });
  // });

  describe("#mint", () => {
    it("success", async () => {
      const balance0Before = await usdt.balanceOf(investor1.address);
      await subscribe(investor1, tickAmount, ticks);
      const balance0 = await usdt.balanceOf(investor1.address);
      expect(balance0Before.sub(balance0)).to.equal(tickAmount.mul(ticks));
      const poolPlan = await pool.plans(1);
      expect(poolPlan.index.toNumber()).equal(1);
      expect(poolPlan.investor).equal(investor1.address);
      expect(poolPlan.tickAmount0).equal(tickAmount);
      expect(poolPlan.claimedAmount1).equal(0);
      expect(poolPlan.startTick).equal(1);
      expect(poolPlan.endTick).equal(ticks);

      const planDetails = await planManager.getPlan(1);
      expect(planDetails.plan.index.toNumber()).equal(1);
      expect(planDetails.plan.investor).equal(investor1.address);
      expect(planDetails.plan.token0).equal(usdt.address);
      expect(planDetails.plan.token1).equal(tokens[1].address);
      expect(planDetails.plan.frequency).equal(frequency);
      expect(planDetails.plan.index).equal(poolPlan.index.toNumber());
      expect(planDetails.plan.tickAmount).equal(tickAmount);

      const tokenOwner = await planManager.ownerOf(1);
      expect(tokenOwner).to.eq(investor1.address);

      expect(await planManager.tokenURI(1)).to.eq(
        "data:application/json;base64,eyJuYW1lIjoiQUlQIC0gSW52ZXN0IFRFU1Qgd2l0aCAxMCBURVNUIGV2ZXJ5IDMgZGF5cyBhbmQgMyBwZXJpb2RzIC0gSW52ZXN0ZWQ6IDAgVEVTVC4gT25nb2luZzogMzAgVEVTVCIsICJkZXNjcmlwdGlvbiI6IlRoaXMgTkZUIHJlcHJlc2VudHMgYW4gYXV0byBpbnZlc3RtZW50IHBsYW4gaW4gYW4gQUlQIFRFU1QvVEVTVCBwb29sLiBUaGUgb3duZXIgb2YgdGhpcyBORlQgY2FuIGVuZCB0aGUgcGxhbiBhbmQgd2l0aGRyYXcgYWxsIHJlbWFpbmluZyB0b2tlbnMuXG5cblBvb2wgQWRkcmVzczogMHg5ZTVlMmYwZjI4ZTA5OTFkNWU4NDAyNzYwN2UzOTI2MGU3MmRhNjFkXG5URVNUIEFkZHJlc3M6IDB4Y2Y3ZWQzYWNjYTVhNDY3ZTllNzA0YzcwM2U4ZDg3ZjYzNGZiMGZjOVxuVEVTVCBBZGRyZXNzOiAweGE1MTNlNmU0YjhmMmE5MjNkOTgzMDRlYzg3ZjY0MzUzYzRkNWM4NTNcbkZyZXF1ZW5jeTogMyBkYXlzXG5Ub2tlbiBJRDogMVxuXG7imqDvuI8gRElTQ0xBSU1FUjogRHVlIGRpbGlnZW5jZSBpcyBpbXBlcmF0aXZlIHdoZW4gYXNzZXNzaW5nIHRoaXMgTkZULiBNYWtlIHN1cmUgdG9rZW4gYWRkcmVzc2VzIG1hdGNoIHRoZSBleHBlY3RlZCB0b2tlbnMsIGFzIHRva2VuIHN5bWJvbHMgbWF5IGJlIGltaXRhdGVkLiIsImltYWdlIjogImRhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEhOMlp5QjNhV1IwYUQwaU5EQXdJaUJvWldsbmFIUTlJalV3TUNJZ2RtbGxkMEp2ZUQwaU1DQXdJRFF3TUNBMU1EQWlJSGh0Ykc1elBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHlNREF3TDNOMlp5SWdlRzFzYm5NNmVHeHBibXM5SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpFNU9Ua3ZlR3hwYm1zaVBqeHlaV04wSUhrOUlqUXlNeUlnWm1sc2JEMGlJekF6TURNd015SWdkMmxrZEdnOUlqUXdNQ0lnYUdWcFoyaDBQU0kzT0NJdlBqeDBaWGgwSUhSeVlXNXpabTl5YlQwaWJXRjBjbWw0S0RFZ01DQXdJREVnTWpBZ05EZ3dLU0lnWm05dWRDMXphWHBsUFNJeE1YQjRJaUJtYVd4c1BTSjNhR2wwWlNJZ1ptOXVkQzFtWVcxcGJIazlJaWREYjNWeWFXVnlJRTVsZHljc0lHMXZibTl6Y0dGalpTSStWRVZUVkNEaWdLSWdNSGhqWmpkbFpETmhZMk5oTldFME5qZGxPV1UzTURSak56QXpaVGhrT0RkbU5qTTBabUl3Wm1NNVBDOTBaWGgwUGp4MFpYaDBJSFJ5WVc1elptOXliVDBpYldGMGNtbDRLREVnTUNBd0lERWdNakFnTkRVd0tTSWdabTl1ZEMxemFYcGxQU0l4TVhCNElpQm1hV3hzUFNKM2FHbDBaU0lnWm05dWRDMW1ZVzFwYkhrOUlpZERiM1Z5YVdWeUlFNWxkeWNzSUcxdmJtOXpjR0ZqWlNJK1ZFVlRWQ0RpZ0tJZ01IaGhOVEV6WlRabE5HSTRaakpoT1RJelpEazRNekEwWldNNE4yWTJORE0xTTJNMFpEVmpPRFV6UEM5MFpYaDBQanhzYVc1bFlYSkhjbUZrYVdWdWRDQnBaRDBpVTFaSFNVUmZNVjhpSUdkeVlXUnBaVzUwVlc1cGRITTlJblZ6WlhKVGNHRmpaVTl1VlhObElpQjRNVDBpTFRFM0xqY3hNallpSUhreFBTSXpOQzR5T1RBMklpQjRNajBpTWpjeUxqVTNOVFFpSUhreVBTSXpPREV1T1RBNE5pSStQSE4wYjNBZ2IyWm1jMlYwUFNJd0lpQnpkSGxzWlQwaWMzUnZjQzFqYjJ4dmNqb2pZVFV4TTJVMklpOCtQSE4wYjNBZ2IyWm1jMlYwUFNJeElpQnpkSGxzWlQwaWMzUnZjQzFqYjJ4dmNqb2pZMlkzWldReklpOCtQQzlzYVc1bFlYSkhjbUZrYVdWdWRENDhjbVZqZENCNVBTSXhOamNpSUdacGJHdzlJblZ5YkNnalUxWkhTVVJmTVY4cElpQjNhV1IwYUQwaU5EQXdJaUJvWldsbmFIUTlJakkxTmlJdlBqeHdZWFJvSUdacGJHdzlJaU15TXpJMk1rWWlJRzl3WVdOcGRIazlJakF1TmpnaUlHUTlJazB6T0RBc016UTVMamxJTWpCMk16bGpNQ3cyTGpZc05TNDBMREV5TERFeUxERXlhRE16Tm1NMkxqWXNNQ3d4TWkwMUxqUXNNVEl0TVRKV016UTVMamw2SWk4K1BIQmhkR2dnWm1sc2JEMGlJekl6TWpZeVJpSWdiM0JoWTJsMGVUMGlNQzQyT0NJZ1pEMGlUVE0yT0N3eU5EVklNekpqTFRZdU5pd3dMVEV5TERVdU5DMHhNaXd4TW5Zek9XZ3pOakIyTFRNNVF6TTRNQ3d5TlRBdU5Dd3pOelF1Tml3eU5EVXNNelk0TERJME5Yb2lMejQ4Y21WamRDQjRQU0l5TUNJZ2VUMGlNamszTGpNaUlHWnBiR3c5SWlNeU16STJNa1lpSUc5d1lXTnBkSGs5SWpBdU5qZ2lJSGRwWkhSb1BTSXpOakFpSUdobGFXZG9kRDBpTlRFaUx6NDhjR0YwYUNCbWFXeHNQU0lqTWpNeU5qSkdJaUJ2Y0dGamFYUjVQU0l3TGpZNElpQmtQU0pOTXpZMExqZ3NNVGczTGpWSU16VXVNbU10T0M0MExEQXRNVFV1TWl3MkxqZ3RNVFV1TWl3eE5TNHlkakl3TGpkak1DdzRMalFzTmk0NExERTFMaklzTVRVdU1pd3hOUzR5YURNeU9TNDNZemd1TkN3d0xERTFMakl0Tmk0NExERTFMakl0TVRVdU1uWXRNakF1TjBNek9EQXNNVGswTGpNc016Y3pMaklzTVRnM0xqVXNNelkwTGpnc01UZzNMalY2SWk4K1BIUmxlSFFnZEhKaGJuTm1iM0p0UFNKdFlYUnlhWGdvTVNBd0lEQWdNU0F6TWlBeU56WXBJaUJtYVd4c1BTSWpRakZDTlVNMElpQm1iMjUwTFhOcGVtVTlJakU0Y0hnaUlHWnZiblF0Wm1GdGFXeDVQU0luUTI5MWNtbGxjaUJPWlhjbkxDQnRiMjV2YzNCaFkyVWlQa2x1ZG1WemRHVmtPand2ZEdWNGRENDhkR1Y0ZENCMGNtRnVjMlp2Y20wOUltMWhkSEpwZUNneElEQWdNQ0F4SURFMU1DQXlOellwSWlCbWIyNTBMWE5wZW1VOUlqRTRjSGdpSUNCbWFXeHNQU0ozYUdsMFpTSWdabTl1ZEMxbVlXMXBiSGs5SWlkRGIzVnlhV1Z5SUU1bGR5Y3NJRzF2Ym05emNHRmpaU0krTUNCVVJWTlVQQzkwWlhoMFBqeDBaWGgwSUhSeVlXNXpabTl5YlQwaWJXRjBjbWw0S0RFZ01DQXdJREVnTXpJZ016STVLU0lnWm1sc2JEMGlJMEl4UWpWRE5DSWdabTl1ZEMxemFYcGxQU0l4T0hCNElpQm1iMjUwTFdaaGJXbHNlVDBpSjBOdmRYSnBaWElnVG1WM0p5d2diVzl1YjNOd1lXTmxJajVYYVhSb1pISmhkMjQ2UEM5MFpYaDBQangwWlhoMElIUnlZVzV6Wm05eWJUMGliV0YwY21sNEtERWdNQ0F3SURFZ01UVXdJRE15T1NraUlHWnZiblF0YzJsNlpUMGlNVGh3ZUNJZ0lHWnBiR3c5SW5kb2FYUmxJaUJtYjI1MExXWmhiV2xzZVQwaUowTnZkWEpwWlhJZ1RtVjNKeXdnYlc5dWIzTndZV05sSWo0d0lGUkZVMVE4TDNSbGVIUStQSFJsZUhRZ2RISmhibk5tYjNKdFBTSnRZWFJ5YVhnb01TQXdJREFnTVNBek1pQXpPREVwSWlCbWFXeHNQU0lqUWpGQ05VTTBJaUJtYjI1MExYTnBlbVU5SWpFNGNIZ2lJR1p2Ym5RdFptRnRhV3g1UFNJblEyOTFjbWxsY2lCT1pYY25MQ0J0YjI1dmMzQmhZMlVpUGs5dVoyOXBibWM2UEM5MFpYaDBQangwWlhoMElIUnlZVzV6Wm05eWJUMGliV0YwY21sNEtERWdNQ0F3SURFZ01UVXdJRE00TVNraUlHWnZiblF0YzJsNlpUMGlNVGh3ZUNJZ0lHWnBiR3c5SW5kb2FYUmxJaUJtYjI1MExXWmhiV2xzZVQwaUowTnZkWEpwWlhJZ1RtVjNKeXdnYlc5dWIzTndZV05sSWo0ek1DQlVSVk5VUEM5MFpYaDBQanh3WVhSb0lHWnBiR3c5SW5kb2FYUmxJaUJrUFNKTk5UQXVPU3d5TURWakxUUXVNeXd3TFRjdU55d3pMamN0Tnk0M0xEaERORGN1TlN3eU1UTXNOVEF1T1N3eU1Ea3VNeXcxTUM0NUxESXdOWG9pTHo0OGNHRjBhQ0JtYVd4c1BTSjNhR2wwWlNJZ1pEMGlUVFV4TERJd05XTXdMRFF1TXl3ekxqTXNPQ3czTGpjc09FTTFPQzQyTERJd09DNDNMRFUxTGpNc01qQTFMRFV4TERJd05Yb2lMejQ4Y0dGMGFDQm1hV3hzUFNKM2FHbDBaU0lnWkQwaVRUVTRMallzTWpFell5MDBMaklzTUM0eUxUY3VOU3d6TGpZdE55NDFMRGhETlRVdU1pd3lNakF1T1N3MU9DNDJMREl4Tnk0ekxEVTRMallzTWpFemVpSXZQanh3WVhSb0lHWnBiR3c5SW5kb2FYUmxJaUJrUFNKTk5UQXVPU3d5TWpGak1DNHhMREFzTUM0eExEQXNNQzR5TERCakxUQXVNaTAwTGpNdE15NDFMVGN1T0MwM0xqZ3RPRU0wTXk0ekxESXhOeTQxTERRMkxqWXNNakl4TERVd0xqa3NNakl4ZWlJdlBqeHdZWFJvSUdacGJHdzlJbmRvYVhSbElpQmtQU0pOTlRFdU1pd3lNVFF1TTB3MU1TNHlMREl4TkM0elREVXhMaklzTWpFMExqTk1OVEV1TWl3eU1UUXVNM29pTHo0OGNtVmpkQ0I0UFNJek9TSWdlVDBpTWpBeElpQjBjbUZ1YzJadmNtMDlJbTFoZEhKcGVDZ3dMamN3TnpFZ0xUQXVOekEzTVNBd0xqY3dOekVnTUM0M01EY3hJQzB4TXpVdU5qZ3pOQ0E1T0M0ME1qZzJLU0lnWm1sc2JEMGlibTl1WlNJZ2MzUnliMnRsUFNJalJUWkZPRVZESWlCemRISnZhMlV0ZDJsa2RHZzlJakF1TWpVaUlIZHBaSFJvUFNJeU5DSWdhR1ZwWjJoMFBTSXlOQ0l2UGp4MFpYaDBJSFJ5WVc1elptOXliVDBpYldGMGNtbDRLREVnTUNBd0lERWdPREFnTWpFM0tTSWdabWxzYkQwaUkwSXhRalZETkNJZ1ptOXVkQzF6YVhwbFBTSXhPSEI0SWlCbWIyNTBMV1poYldsc2VUMGlKME52ZFhKcFpYSWdUbVYzSnl3Z2JXOXViM053WVdObElqNUpSRG84TDNSbGVIUStQSFJsZUhRZ2RISmhibk5tYjNKdFBTSnRZWFJ5YVhnb01TQXdJREFnTVNBeE1qZ2dNakUzS1NJZ1ptOXVkQzF6YVhwbFBTSXhPSEI0SWlBZ1ptbHNiRDBpZDJocGRHVWlJR1p2Ym5RdFptRnRhV3g1UFNJblEyOTFjbWxsY2lCT1pYY25MQ0J0YjI1dmMzQmhZMlVpUGpFOEwzUmxlSFErUEhKbFkzUWdabWxzYkQwaUl6QXpNRE13TXlJZ2QybGtkR2c5SWpRd01DSWdhR1ZwWjJoMFBTSXhOamNpTHo0OGRHVjRkQ0IwY21GdWMyWnZjbTA5SW0xaGRISnBlQ2d4SURBZ01DQXhJREl3SURRMktTSWdabTl1ZEMxemFYcGxQU0l6Tm5CNElpQm1hV3hzUFNKM2FHbDBaU0lnWm05dWRDMW1ZVzFwYkhrOUlpZERiM1Z5YVdWeUlFNWxkeWNzSUcxdmJtOXpjR0ZqWlNJK1ZFVlRWT0tBb2pORVBDOTBaWGgwUGp4MFpYaDBJSFJ5WVc1elptOXliVDBpYldGMGNtbDRLREVnTUNBd0lERWdNakFnT0RJcElpQm1hV3hzUFNJalFqRkNOVU0wSWlCbWIyNTBMWE5wZW1VOUlqRTRjSGdpSUdadmJuUXRabUZ0YVd4NVBTSW5RMjkxY21sbGNpQk9aWGNuTENCdGIyNXZjM0JoWTJVaVBqRXdJRlJGVTFRZ2NHVnlJSEJsY21sdlpEd3ZkR1Y0ZEQ0OGNtVmpkQ0I0UFNJeU1DSWdlVDBpTVRBNElpQm1hV3hzUFNKM2FHbDBaU0lnZDJsa2RHZzlJak0yTUNJZ2FHVnBaMmgwUFNJMklpOCtQSEpsWTNRZ2VEMGlNakFpSUhrOUlqRXdPQ0lnWm1sc2JEMGlJMEl4UlRnME5pSWdkMmxrZEdnOUlqQWlJR2hsYVdkb2REMGlOaUl2UGp4MFpYaDBJSFJ5WVc1elptOXliVDBpYldGMGNtbDRLREVnTUNBd0lERWdNakFnTVRReUtTSWdabTl1ZEMxemFYcGxQU0l4T0hCNElpQm1hV3hzUFNJalFqRkZPRFEySWlCbWIyNTBMV1poYldsc2VUMGlKME52ZFhKcFpYSWdUbVYzSnl3Z2JXOXViM053WVdObElqNHdMek1nVUdWeWFXOWtjend2ZEdWNGRENDhMM04yWno0PSJ9"
      );

      const tickInfo1 = await pool.tickInfo(1);
      const tickInfo2 = await pool.tickInfo(2);
      const tickInfo3 = await pool.tickInfo(3);
      const tickInfo4 = await pool.tickInfo(4);
      expect(tickInfo1.amount0).to.equal(tickAmount);
      expect(tickInfo2.amount0).to.equal(tickAmount);
      expect(tickInfo3.amount0).to.equal(tickAmount);
      expect(tickInfo4.amount0).to.equal(0);
    });

    // it("success with another payer", async () => {
    //   await planManager
    //     .connect(investor2)
    //     .mint([
    //       investor1.address,
    //       usdt.address,
    //       tokens[1].address,
    //       frequency,
    //       tickAmount,
    //       3,
    //     ]);
    //   const planDetails = await planManager.getPlan(1);
    //   expect(planDetails.plan.investor).equal(investor1.address);
    // });

    // it("emits event", async () => {
    //   await expect(subscribe(investor1, tickAmount, ticks))
    //     .to.be.emit(pool, "Subscribe")
    //     .withArgs(1, investor1.address, tickAmount, 1, ticks);
    // });

    // it("fails if insufficient usdt funds", async () => {
    //   await usdt
    //     .connect(investor1)
    //     .approve(planManager.address, tickAmount.mul(ticks).sub(1));
    //   await expect(subscribe(investor1, tickAmount, ticks)).to.be.revertedWith(
    //     "STF"
    //   );
    // });

    // it("fails if invalid input amount", async () => {
    //   const minAmount = utils.parseEther("10");
    //   await expect(
    //     subscribe(investor1, minAmount.sub(1), ticks)
    //   ).to.be.revertedWith("Invalid tick amount");
    //   await expect(subscribe(investor1, tickAmount, 0)).to.be.revertedWith(
    //     "Invalid periods"
    //   );
    // });
  });

  // describe("#trigger", () => {
  //   it("success", async () => {
  //     const protocolFeeBefore = await pool.protocolFee();
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();

  //     const tickInfo = await pool.tickInfo(1);
  //     expect(tickInfo.amount0).to.equal(tickAmount);
  //     expect(tickInfo.amount1).to.equal(result.amount1.abs());

  //     const protocolFee = await pool.protocolFee();
  //     expect(protocolFee.sub(protocolFeeBefore)).to.equal(
  //       tickAmount.div(PROTOCOL_FEE)
  //     );
  //   });
  //   it("plan with right statisctics", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await subscribe(investor2, tickAmount, 4);
  //     const now = Date.now() + 1000;
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [now]);
  //     const result = await swapWithoutProtocolFee(tickAmount.mul(2));
  //     await pool.trigger();
  //     let planDetails = await planManager.getPlan(1);
  //     expect(planDetails.statistics.startedTime).to.equal(now);
  //     expect(planDetails.statistics.endedTime).to.equal(
  //       now + frequency * TIME_UNIT * 2
  //     );
  //     expect(planDetails.statistics.swapAmount1).to.equal(
  //       result.amount1.abs().div(2)
  //     );
  //     expect(planDetails.statistics.remainingTicks.toString()).to.equal("2");
  //     expect(planDetails.statistics.ticks.toString()).to.equal("3");
  //     expect(planDetails.statistics.lastTriggerTime).to.equal(now);
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await pool.trigger();
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const now2 = now + frequency * TIME_UNIT * 2 + 1325;
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [now2]);
  //     await pool.trigger();
  //     planDetails = await planManager.getPlan(1);
  //     expect(planDetails.statistics.endedTime).to.equal(now2);
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     await pool.trigger();
  //     planDetails = await planManager.getPlan(1);
  //     expect(planDetails.statistics.endedTime).to.equal(now2);
  //   });

  //   it("success trigger again", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     const protocolFeeBefore = await pool.protocolFee();

  //     await pool.trigger();
  //     const tickInfo = await pool.tickInfo(2);
  //     expect(tickInfo.amount0).to.equal(tickAmount);
  //     expect(tickInfo.amount1).to.equal(result.amount1.abs());
  //     const protocolFee = await pool.protocolFee();
  //     expect(protocolFee.sub(protocolFeeBefore)).to.equal(
  //       tickAmount.div(PROTOCOL_FEE)
  //     );
  //   });
  //   it("two investors", async () => {
  //     const protocolFeeBefore = await pool.protocolFee();
  //     await subscribe(investor1, tickAmount, ticks);
  //     await subscribe(investor2, tickAmount.mul(2), ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount.mul(3));
  //     await pool.trigger();
  //     const tickInfo = await pool.tickInfo(1);
  //     expect(tickInfo.amount0).to.equal(tickAmount.mul(3));
  //     expect(tickInfo.amount1).to.equal(result.amount1.abs());
  //     const protocolFee = await pool.protocolFee();
  //     expect(protocolFee.sub(protocolFeeBefore)).to.equal(
  //       tickAmount.mul(3).div(PROTOCOL_FEE)
  //     );
  //   });
  //   it("emits event", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     const protocolFee = tickAmount.div(PROTOCOL_FEE);
  //     const triggerFee = await getTriggerFee();
  //     await expect(pool.trigger())
  //       .to.be.emit(pool, "Trigger")
  //       .withArgs(1, tickAmount, result.amount1.abs(), triggerFee, protocolFee);
  //   });
  //   it("fails if tick volume equal 0", async () => {
  //     await expect(pool.trigger()).to.be.revertedWith("Tick volume equal 0");
  //   });
  //   it("fails if wrong time", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await ethers.provider.send("evm_increaseTime", [
  //       frequency * TIME_UNIT - 10,
  //     ]);
  //     await ethers.provider.send("evm_mine");
  //     await expect(pool.trigger()).to.be.revertedWith("Not yet");
  //   });
  // });

  // describe("#burn", () => {
  //   it("success", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     const balance0Before = await usdt.balanceOf(investor1.address);
  //     const balance1Before = await tokens[1].balanceOf(investor1.address);
  //     await planManager.connect(investor1).burn(1);

  //     await expect(planManager.ownerOf(1)).to.be.revertedWith(
  //       "ERC721: owner query for nonexistent token"
  //     );

  //     const plan = await pool.plans(1);
  //     const balance0 = await usdt.balanceOf(investor1.address);
  //     const balance1 = await tokens[1].balanceOf(investor1.address);
  //     expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(2));
  //     expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
  //     expect(plan.endTick).to.equal(1);

  //     const tickInfo1 = await pool.tickInfo(1);
  //     const tickInfo2 = await pool.tickInfo(2);
  //     const tickInfo3 = await pool.tickInfo(3);
  //     expect(tickInfo1.amount0).to.equal(tickAmount);
  //     expect(tickInfo2.amount0).to.equal(0);
  //     expect(tickInfo3.amount0).to.equal(0);
  //   });
  //   it("success when transfered NFT to another", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     const balance0Before = await usdt.balanceOf(investor2.address);
  //     const balance1Before = await tokens[1].balanceOf(investor2.address);

  //     await planManager
  //       .connect(investor1)
  //       .transferFrom(investor1.address, investor2.address, 1);

  //     await planManager.connect(investor2).burn(1);

  //     const plan = await pool.plans(1);
  //     const balance0 = await usdt.balanceOf(investor2.address);
  //     const balance1 = await tokens[1].balanceOf(investor2.address);
  //     expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(2));
  //     expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
  //     expect(plan.endTick).to.equal(1);
  //   });
  //   it("success if cancel after subscribe", async () => {
  //     await subscribe(investor2, tickAmount, 5);
  //     await pool.trigger();
  //     await subscribe(investor1, tickAmount, ticks);
  //     const balance0Before = await usdt.balanceOf(investor1.address);
  //     await planManager.connect(investor1).burn(2);
  //     const balance0 = await usdt.balanceOf(investor1.address);
  //     expect(balance0.sub(balance0Before)).to.equal(tickAmount.mul(ticks));
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     await pool.trigger();

  //     const planDetails = await planManager.getPlan(2);
  //     expect(planDetails.statistics.startedTime).to.equal(0);
  //     expect(planDetails.statistics.endedTime).to.equal(0);
  //     expect(planDetails.statistics.swapAmount1).to.equal(0);
  //     expect(planDetails.statistics.remainingTicks.toString()).to.equal("0");
  //     expect(planDetails.statistics.ticks.toString()).to.equal("0");
  //   });
  //   it("emits event", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     await expect(planManager.connect(investor1).burn(1))
  //       .to.be.emit(pool, "Unsubscribe")
  //       .withArgs(1, tickAmount.mul(2), result.amount1.abs());
  //   });
  //   it("fails if requester is not approved", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await expect(planManager.connect(investor2).burn(1)).to.be.revertedWith(
  //       "Not approved"
  //     );
  //   });
  //   it("fails if NFT transfered", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await planManager
  //       .connect(investor1)
  //       .transferFrom(investor1.address, investor2.address, 1);
  //     await expect(planManager.connect(investor1).burn(1)).to.be.revertedWith(
  //       "Not approved"
  //     );
  //   });
  // });

  // describe("#claim", () => {
  //   it("success", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     const balance1Before = await tokens[1].balanceOf(investor1.address);
  //     await planManager.connect(investor1).claim(1);
  //     const balance1 = await tokens[1].balanceOf(investor1.address);
  //     expect(balance1.sub(balance1Before)).to.equal(result.amount1.abs());
  //   });
  //   it("success if claim again", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await planManager.connect(investor1).claim(1);
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result2 = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();

  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result3 = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();

  //     const balance1Before = await tokens[1].balanceOf(investor1.address);
  //     await planManager.connect(investor1).claim(1);
  //     const balance1 = await tokens[1].balanceOf(investor1.address);
  //     expect(balance1.sub(balance1Before)).to.equal(
  //       result2.amount1.abs().add(result3.amount1.abs())
  //     );
  //   });
  //   it("success with right ratio", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await subscribe(investor2, tickAmount.mul(2), ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount.mul(3));
  //     await pool.trigger();
  //     const balance1Investor1Before = await tokens[1].balanceOf(
  //       investor1.address
  //     );
  //     const balance1Investor2Before = await tokens[1].balanceOf(
  //       investor2.address
  //     );
  //     await planManager.connect(investor1).claim(1);
  //     await planManager.connect(investor2).claim(2);
  //     const balance1Investor1 = await tokens[1].balanceOf(investor1.address);
  //     const balance1Investor2 = await tokens[1].balanceOf(investor2.address);
  //     expect(balance1Investor1.sub(balance1Investor1Before)).to.equal(
  //       result.amount1.abs().mul(1).div(3)
  //     );
  //     expect(balance1Investor2.sub(balance1Investor2Before)).to.equal(
  //       result.amount1.abs().mul(2).div(3)
  //     );
  //   });
  //   it("emits event", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     await expect(planManager.connect(investor1).claim(1))
  //       .to.be.emit(pool, "Claim")
  //       .withArgs(1, result.amount1.abs());
  //   });
  //   it("fails if nothing to claim", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await planManager.connect(investor1).claim(1);
  //     await expect(planManager.connect(investor1).claim(1)).to.be.revertedWith(
  //       "Nothing to claim"
  //     );
  //   });
  //   it("fails if investor is not NFT owner", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await planManager
  //       .connect(investor1)
  //       .transferFrom(investor1.address, investor2.address, 1);
  //     await expect(planManager.connect(investor1).claim(1)).to.be.revertedWith(
  //       "Locked"
  //     );
  //   });
  // });

  // describe("#extend", () => {
  //   it("success", async () => {
  //     await subscribe(investor1, tickAmount, 2);
  //     const balance1Before = await tokens[1].balanceOf(investor1.address);
  //     let received = BigNumber.from(0);
  //     const result1 = await swapWithoutProtocolFee(tickAmount);
  //     received = received.add(result1.amount1.abs());
  //     await pool.trigger();
  //     await planManager.connect(investor1).extend(1, 1);
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result2 = await swapWithoutProtocolFee(tickAmount);
  //     received = received.add(result2.amount1.abs());
  //     await pool.trigger();
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result3 = await swapWithoutProtocolFee(tickAmount);
  //     received = received.add(result3.amount1.abs());
  //     await pool.trigger();
  //     await planManager.connect(investor1).claim(1);
  //     const balance1 = await tokens[1].balanceOf(investor1.address);
  //     expect(balance1.sub(balance1Before)).to.equal(received);
  //   });
  //   it("success with another payer", async () => {
  //     await subscribe(investor1, tickAmount, 2);
  //     await planManager.connect(investor2).extend(1, 1);
  //   });
  //   it("right ratio", async () => {
  //     const tickAmountI1 = tickAmount;
  //     const tickAmountI2 = tickAmount.mul(3);
  //     const totalTickAmount = tickAmountI1.add(tickAmountI2);
  //     await subscribe(investor1, tickAmountI1, 2);
  //     const balance1Before = await tokens[1].balanceOf(investor1.address);
  //     const balance2Before = await tokens[1].balanceOf(investor2.address);
  //     let receivedI1 = BigNumber.from(0);
  //     let receivedI2 = BigNumber.from(0);
  //     const result1 = await swapWithoutProtocolFee(tickAmountI1);
  //     receivedI1 = receivedI1.add(result1.amount1.abs());
  //     await pool.trigger();
  //     await planManager.connect(investor1).extend(1, 1);
  //     await subscribe(investor2, tickAmountI2, 3);

  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result2 = await swapWithoutProtocolFee(totalTickAmount);

  //     receivedI1 = receivedI1.add(
  //       result2.amount1.abs().mul(tickAmountI1).div(totalTickAmount)
  //     );
  //     receivedI2 = receivedI2.add(
  //       result2.amount1.abs().mul(tickAmountI2).div(totalTickAmount)
  //     );
  //     await pool.trigger();

  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     const result3 = await swapWithoutProtocolFee(totalTickAmount);
  //     receivedI1 = receivedI1.add(
  //       result3.amount1.abs().mul(tickAmountI1).div(totalTickAmount)
  //     );
  //     receivedI2 = receivedI2.add(
  //       result3.amount1.abs().mul(tickAmountI2).div(totalTickAmount)
  //     );
  //     await pool.trigger();

  //     await planManager.connect(investor1).claim(1);
  //     await planManager.connect(investor2).claim(2);
  //     const balance1 = await tokens[1].balanceOf(investor1.address);
  //     const balance2 = await tokens[1].balanceOf(investor2.address);
  //     expect(balance1.sub(balance1Before)).to.equal(receivedI1);
  //     expect(balance2.sub(balance2Before)).to.equal(receivedI2);
  //   });
  //   it("emits event", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await swapWithoutProtocolFee(tickAmount);
  //     await pool.trigger();
  //     await expect(planManager.connect(investor1).extend(1, 1))
  //       .to.be.emit(pool, "Extend")
  //       .withArgs(1, ticks, ticks + 1);
  //   });
  //   it("fails if insufficient usdt funds", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await usdt
  //       .connect(investor1)
  //       .approve(planManager.address, tickAmount.mul(1).sub(1));
  //     await expect(
  //       planManager.connect(investor1).extend(1, 1)
  //     ).to.be.revertedWith("STF");
  //   });
  //   it("fails if periods invalid", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await expect(
  //       planManager.connect(investor1).extend(1, 0)
  //     ).to.be.revertedWith("Invalid periods");
  //   });
  //   it("fails if plan finished", async () => {
  //     await subscribe(investor1, tickAmount, 1);
  //     await pool.trigger();
  //     await expect(
  //       planManager.connect(investor1).extend(1, 1)
  //     ).to.be.revertedWith("Finished");
  //   });
  // });
  // describe("#claimReward", () => {
  //   const rewardAmount = utils.parseEther("10");
  //   it("success", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await pool.initReward(tokens[2].address, other.address);
  //     await tokens[2].connect(other).approve(pool.address, rewardAmount);
  //     await pool.connect(other).depositReward(rewardAmount);
  //     const balanceBefore = await tokens[2].balanceOf(investor1.address);
  //     await planManager.connect(investor1).claimReward(1);
  //     const balance = await tokens[2].balanceOf(investor1.address);
  //     expect(balance.sub(balanceBefore)).to.equal(rewardAmount);
  //   });
  //   it("right ratio", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await subscribe(investor2, tickAmount.mul(2), ticks);
  //     await pool.trigger();
  //     await pool.initReward(tokens[2].address, other.address);
  //     await tokens[2].connect(other).approve(pool.address, rewardAmount.mul(3));
  //     await pool.connect(other).depositReward(rewardAmount);
  //     await pool.connect(other).depositReward(rewardAmount.mul(2));
  //     const balanceI1Before = await tokens[2].balanceOf(investor1.address);
  //     const balanceI2Before = await tokens[2].balanceOf(investor2.address);
  //     await planManager.connect(investor1).claimReward(1);
  //     await planManager.connect(investor2).claimReward(2);
  //     const balanceI1 = await tokens[2].balanceOf(investor1.address);
  //     const balanceI2 = await tokens[2].balanceOf(investor2.address);
  //     expect(balanceI1.sub(balanceI1Before)).to.equal(rewardAmount);
  //     expect(balanceI2.sub(balanceI2Before)).to.equal(rewardAmount.mul(2));

  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     await pool.trigger();
  //     await planManager.connect(investor1).claimReward(1);
  //     await planManager.connect(investor2).claimReward(2);
  //     const balanceI1After = await tokens[2].balanceOf(investor1.address);
  //     const balanceI2After = await tokens[2].balanceOf(investor2.address);
  //     expect(balanceI1After).to.equal(balanceI1);
  //     expect(balanceI2After).to.equal(balanceI2);
  //   });
  //   it("claim again", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await pool.initReward(tokens[2].address, other.address);
  //     await tokens[2].connect(other).approve(pool.address, rewardAmount.mul(6));
  //     await pool.connect(other).depositReward(rewardAmount);
  //     const balanceBefore = await tokens[2].balanceOf(investor1.address);
  //     await planManager.connect(investor1).claimReward(1);
  //     const balance = await tokens[2].balanceOf(investor1.address);
  //     expect(balance.sub(balanceBefore)).to.equal(rewardAmount);
  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     await pool.trigger();
  //     await pool.connect(other).depositReward(rewardAmount.mul(3));

  //     await ethers.provider.send("evm_increaseTime", [frequency * TIME_UNIT]);
  //     await ethers.provider.send("evm_mine");
  //     await pool.trigger();
  //     await pool.connect(other).depositReward(rewardAmount.mul(2));
  //     await planManager.connect(investor1).claimReward(1);
  //     const balanceAfter = await tokens[2].balanceOf(investor1.address);
  //     expect(balanceAfter.sub(balance)).to.equal(rewardAmount.mul(5));
  //   });
  //   it("returns 0 if no reward", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     const result = await planManager
  //       .connect(investor1)
  //       .callStatic.claimReward(1);
  //     expect(result.token).to.equal(constants.AddressZero);
  //     expect(result.unclaimedAmount).to.equal(0);
  //     expect(result.claimedAmount).to.equal(0);
  //   });
  //   it("fails if investor is not NFT owner", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //     await pool.trigger();
  //     await pool.initReward(tokens[2].address, other.address);
  //     await tokens[2].connect(other).approve(pool.address, rewardAmount);
  //     await pool.connect(other).depositReward(rewardAmount);
  //     await planManager
  //       .connect(investor1)
  //       .transferFrom(investor1.address, investor2.address, 1);
  //     await expect(
  //       planManager.connect(investor1).claimReward(1)
  //     ).to.be.revertedWith("Locked");
  //   });
  // });

  // describe("#transferFrom", () => {
  //   const tokenId = 1;
  //   beforeEach("mint a plan", async () => {
  //     await subscribe(investor1, tickAmount, ticks);
  //   });

  //   it("can only be called by authorized or owner", async () => {
  //     await expect(
  //       planManager.transferFrom(investor1.address, investor2.address, tokenId)
  //     ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  //   });

  //   it("changes the owner", async () => {
  //     await planManager
  //       .connect(investor1)
  //       .transferFrom(investor1.address, investor2.address, tokenId);
  //     expect(await planManager.ownerOf(tokenId)).to.eq(investor2.address);
  //   });

  //   it("removes existing approval", async () => {
  //     await planManager.connect(investor1).approve(wallet.address, tokenId);
  //     expect(await planManager.getApproved(tokenId)).to.eq(wallet.address);
  //     await planManager.transferFrom(
  //       investor1.address,
  //       wallet.address,
  //       tokenId
  //     );
  //     expect(await planManager.getApproved(tokenId)).to.eq(
  //       constants.AddressZero
  //     );
  //   });

  //   // it('gas', async () => {
  //   //   await snapshotGasCost(nft.connect(other).transferFrom(other.address, wallet.address, tokenId))
  //   // })

  //   // it('gas comes from approved', async () => {
  //   //   await nft.connect(other).approve(wallet.address, tokenId)
  //   //   await snapshotGasCost(nft.transferFrom(other.address, wallet.address, tokenId))
  //   // })
  // });

  // describe("#permit", () => {
  //   describe("owned by eoa", () => {
  //     const tokenId = 1;
  //     const deadline = Date.now();
  //     beforeEach("mint a plan", async () => {
  //       await subscribe(investor1, tickAmount, ticks);
  //     });

  //     it("changes the operator of the coverage and increments the nonce", async () => {
  //       const { v, r, s } = await getPermitNFTSignature(
  //         investor1,
  //         planManager,
  //         investor2.address,
  //         tokenId,
  //         deadline
  //       );
  //       await planManager.permit(investor2.address, tokenId, deadline, v, r, s);
  //       expect((await planManager.getPlan(tokenId)).plan.nonce).to.eq(1);
  //       expect((await planManager.getPlan(tokenId)).plan.operator).to.eq(
  //         investor2.address
  //       );
  //     });

  //     it("cannot be called twice with the same signature", async () => {
  //       const { v, r, s } = await getPermitNFTSignature(
  //         investor1,
  //         planManager,
  //         investor2.address,
  //         tokenId,
  //         deadline
  //       );
  //       await planManager.permit(investor2.address, tokenId, deadline, v, r, s);
  //       await expect(
  //         planManager.permit(investor2.address, tokenId, deadline, v, r, s)
  //       ).to.be.reverted;
  //     });

  //     it("fails with invalid signature", async () => {
  //       const { v, r, s } = await getPermitNFTSignature(
  //         investor2,
  //         planManager,
  //         investor2.address,
  //         tokenId,
  //         deadline
  //       );
  //       await expect(
  //         planManager.permit(investor2.address, tokenId, deadline, v + 3, r, s)
  //       ).to.be.revertedWith("Invalid signature");
  //     });

  //     it("fails with signature not from owner", async () => {
  //       const { v, r, s } = await getPermitNFTSignature(
  //         investor2,
  //         planManager,
  //         investor2.address,
  //         tokenId,
  //         deadline
  //       );
  //       await expect(
  //         planManager.permit(investor2.address, tokenId, deadline, v, r, s)
  //       ).to.be.revertedWith("Unauthorized");
  //     });

  //     // it('gas', async () => {
  //     //   const { v, r, s } = await getPermitNFTSignature(other, coverageManager, wallet.address, tokenId, 1)
  //     //   await snapshotGasCost(coverageManager.permit(wallet.address, tokenId, 1, v, r, s))
  //     // })
  //   });
  // });
});
