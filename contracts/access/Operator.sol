// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Ownable.sol";

abstract contract Operator is Ownable {
    mapping(address => bool) private _operators;

    constructor() {
        _setOperator(msg.sender, true);
    }

    modifier onlyOperator() {
        require(_operators[msg.sender], "Forbidden");
        _;
    }

    function _setOperator(address operatorAddress, bool value) private {
        _operators[operatorAddress] = value;
        emit OperatorSetted(operatorAddress, value);
    }

    function setOperator(address operatorAddress, bool value)
        external
        onlyOwner
    {
        _setOperator(operatorAddress, value);
    }

    function isOperator(address operatorAddress) external view returns (bool) {
        return _operators[operatorAddress];
    }

    event OperatorSetted(address operatorAddress, bool value);
}
