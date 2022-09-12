// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";
import "base64-sol/base64.sol";
import "./HexStrings.sol";
import "./NFTSVG.sol";

// import "hardhat/console.sol";

library NFTDescriptor {
    using Strings for uint256;
    using HexStrings for uint256;
    struct ConstructTokenURIParams {
        uint256 tokenId;
        address stableCoinAddress;
        address tokenAddress;
        string stableCoinSymbol;
        string tokenSymbol;
        uint8 tokenDecimals;
        uint8 frequency;
        address poolAddress;
        uint256 tickAmount;
        uint256 ongoing;
        uint256 invested;
        uint256 claimed;
        uint256 ticks;
        uint256 remainingTicks;
    }

    function constructTokenURI(ConstructTokenURIParams memory params)
        internal
        pure
        returns (string memory)
    {
        string memory namePartOne = generateNamePartOne(params);
        string memory namePartTwo = generateNamePartTwo(params);
        string memory descriptionPartOne = generateDescriptionPartOne(
            escapeQuotes(params.stableCoinSymbol),
            escapeQuotes(params.tokenSymbol),
            addressToString(params.poolAddress)
        );
        string memory descriptionPartTwo = generateDescriptionPartTwo(
            params.tokenId.toString(),
            escapeQuotes(params.stableCoinSymbol),
            addressToString(params.stableCoinAddress),
            addressToString(params.tokenAddress),
            Strings.toString(params.frequency)
        );
        string memory image = Base64.encode(bytes(generateSVGImage(params)));

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(
                        bytes(
                            abi.encodePacked(
                                '{"name":"',
                                namePartOne,
                                namePartTwo,
                                '", "description":"',
                                descriptionPartOne,
                                descriptionPartTwo,
                                '","image": "',
                                "data:image/svg+xml;base64,",
                                image,
                                '"}'
                            )
                        )
                    )
                )
            );
    }

    function escapeQuotes(string memory symbol)
        internal
        pure
        returns (string memory)
    {
        bytes memory symbolBytes = bytes(symbol);
        uint8 quotesCount = 0;
        for (uint8 i = 0; i < symbolBytes.length; i++) {
            if (symbolBytes[i] == '"') {
                quotesCount++;
            }
        }
        if (quotesCount > 0) {
            bytes memory escapedBytes = new bytes(
                symbolBytes.length + (quotesCount)
            );
            uint256 index;
            for (uint8 i = 0; i < symbolBytes.length; i++) {
                if (symbolBytes[i] == '"') {
                    escapedBytes[index++] = "\\";
                }
                escapedBytes[index++] = symbolBytes[i];
            }
            return string(escapedBytes);
        }
        return symbol;
    }

    function decimalString(
        uint256 number,
        uint8 decimals,
        bool isPercent
    ) private pure returns (string memory) {
        uint8 percentBufferOffset = isPercent ? 1 : 0;
        uint256 tenPowDecimals = 10**decimals;

        uint256 temp = number;
        uint8 digits;
        uint8 numSigfigs;
        while (temp != 0) {
            if (numSigfigs > 0) {
                // count all digits preceding least significant figure
                numSigfigs++;
            } else if (temp % 10 != 0) {
                numSigfigs++;
            }
            digits++;
            temp /= 10;
        }
        DecimalStringParams memory params;
        params.isPercent = isPercent;
        if ((digits - numSigfigs) >= decimals) {
            // no decimals, ensure we preserve all trailing zeros
            params.sigfigs = number / tenPowDecimals;
            params.sigfigIndex = digits - decimals;
            params.bufferLength = params.sigfigIndex + percentBufferOffset;
        } else {
            // chop all trailing zeros for numbers with decimals
            params.sigfigs = number / (10**(digits - numSigfigs));
            if (tenPowDecimals > number) {
                // number is less tahn one
                // in this case, there may be leading zeros after the decimal place
                // that need to be added

                // offset leading zeros by two to account for leading '0.'
                params.zerosStartIndex = 2;
                params.zerosEndIndex = decimals - digits + 2;
                params.sigfigIndex = numSigfigs + params.zerosEndIndex;
                params.bufferLength = params.sigfigIndex + percentBufferOffset;
                params.isLessThanOne = true;
            } else {
                // In this case, there are digits before and
                // after the decimal place
                params.sigfigIndex = numSigfigs + 1;
                params.decimalIndex = digits - decimals + 1;
            }
        }
        params.bufferLength = params.sigfigIndex + percentBufferOffset;
        return generateDecimalString(params);
    }

    struct DecimalStringParams {
        // significant figures of decimal
        uint256 sigfigs;
        // length of decimal string
        uint8 bufferLength;
        // ending index for significant figures (funtion works backwards when copying sigfigs)
        uint8 sigfigIndex;
        // index of decimal place (0 if no decimal)
        uint8 decimalIndex;
        // start index for trailing/leading 0's for very small/large numbers
        uint8 zerosStartIndex;
        // end index for trailing/leading 0's for very small/large numbers
        uint8 zerosEndIndex;
        // true if decimal number is less than one
        bool isLessThanOne;
        // true if string should include "%"
        bool isPercent;
    }

    function generateDecimalString(DecimalStringParams memory params)
        private
        pure
        returns (string memory)
    {
        bytes memory buffer = new bytes(params.bufferLength);
        if (params.isPercent) {
            buffer[buffer.length - 1] = "%";
        }
        if (params.isLessThanOne) {
            buffer[0] = "0";
            buffer[1] = ".";
        }

        // add leading/trailing 0's
        for (
            uint256 zerosCursor = params.zerosStartIndex;
            zerosCursor < params.zerosEndIndex + 1;
            zerosCursor++
        ) {
            buffer[zerosCursor] = bytes1(uint8(48));
        }
        // add sigfigs
        while (params.sigfigs > 0) {
            if (
                params.decimalIndex > 0 &&
                params.sigfigIndex == params.decimalIndex
            ) {
                buffer[--params.sigfigIndex] = ".";
            }
            buffer[--params.sigfigIndex] = bytes1(
                uint8(uint256(48) + (params.sigfigs % 10))
            );
            params.sigfigs /= 10;
        }
        return string(buffer);
    }

    function addressToString(address addr)
        internal
        pure
        returns (string memory)
    {
        return (uint256(uint160(addr))).toHexString(20);
    }

    function generateDescriptionPartOne(
        string memory stableCoinSymbol,
        string memory tokenSymbol,
        string memory poolAddress
    ) private pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "This NFT represents an auto investment plan in an AIP ",
                    tokenSymbol,
                    "/",
                    stableCoinSymbol,
                    " pool. ",
                    "The owner of this NFT can end the plan and withdraw all remaining tokens.\\n",
                    "\\nPool Address: ",
                    poolAddress,
                    "\\n",
                    tokenSymbol
                )
            );
    }

    function generateDescriptionPartTwo(
        string memory tokenId,
        string memory stableCoinSymbol,
        string memory stableCoinAddress,
        string memory tokenAddress,
        string memory frequency
    ) private pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    " Address: ",
                    tokenAddress,
                    "\\n",
                    stableCoinSymbol,
                    " Address: ",
                    stableCoinAddress,
                    "\\nFrequency: ",
                    frequency,
                    " days",
                    "\\nToken ID: ",
                    tokenId,
                    "\\n\\n",
                    unicode"⚠️ DISCLAIMER: Due diligence is imperative when assessing this NFT. Make sure token addresses match the expected tokens, as token symbols may be imitated."
                )
            );
    }

    function generateNamePartOne(ConstructTokenURIParams memory params)
        private
        pure
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    "AIP - Invest ",
                    escapeQuotes(params.tokenSymbol),
                    " with ",
                    decimalString(
                        params.tickAmount,
                        params.tokenDecimals,
                        false
                    ),
                    " ",
                    escapeQuotes(params.stableCoinSymbol),
                    " every ",
                    Strings.toString(params.frequency),
                    params.frequency == 1 ? " day and " : " days and ",
                    Strings.toString(params.ticks),
                    params.ticks > 1 ? " periods" : " period"
                )
            );
    }

    function generateNamePartTwo(ConstructTokenURIParams memory params)
        private
        pure
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    " - Invested: ",
                    params.invested == 0
                        ? "0"
                        : decimalString(
                            params.invested,
                            params.tokenDecimals,
                            false
                        ),
                    " ",
                    escapeQuotes(params.tokenSymbol),
                    ". Ongoing: ",
                    params.ongoing == 0
                        ? "0"
                        : decimalString(params.ongoing, 18, false),
                    " ",
                    escapeQuotes(params.stableCoinSymbol)
                )
            );
    }

    function tokenToColorHex(uint256 token, uint256 offset)
        internal
        pure
        returns (string memory str)
    {
        return string((token >> offset).toHexStringNoPrefix(3));
    }

    function generateSVGImage(ConstructTokenURIParams memory params)
        internal
        pure
        returns (string memory svg)
    {
        NFTSVG.SVGParams memory svgParams = NFTSVG.SVGParams({
            tokenId: params.tokenId,
            stableCoin: addressToString(params.stableCoinAddress),
            token: addressToString(params.tokenAddress),
            stableCoinSymbol: params.stableCoinSymbol,
            tokenSymbol: params.tokenSymbol,
            color0: tokenToColorHex(
                uint256(uint160(params.stableCoinAddress)),
                136
            ),
            color1: tokenToColorHex(uint256(uint160(params.tokenAddress)), 136),
            frequency: Strings.toString(params.frequency),
            tickAmount: decimalString(params.tickAmount, 18, false),
            ongoing: params.ongoing == 0
                ? "0"
                : decimalString(params.ongoing, 18, false),
            invested: params.invested == 0
                ? "0"
                : decimalString(params.invested, params.tokenDecimals, false),
            claimed: params.claimed == 0
                ? "0"
                : decimalString(params.claimed, params.tokenDecimals, false),
            ticks: params.ticks,
            currentTicks: params.ticks - params.remainingTicks
        });

        return NFTSVG.generateSVG(svgParams);
    }
}
