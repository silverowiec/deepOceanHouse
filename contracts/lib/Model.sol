// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


// @dev Roles
    bytes32 constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");


// @dev Errors
    error NotAllowed();
    error ArraysDifferentLengthError();