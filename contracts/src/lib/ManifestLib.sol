// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ManifestLib
/// @notice Helpers for manifest hash computation and validation
library ManifestLib {
    /// @notice Compute the canonical manifest hash from an IPFS CID
    /// @dev keccak256 of the CID bytes — simple and deterministic
    function computeHash(string calldata ipfsCid) internal pure returns (bytes32) {
        return keccak256(bytes(ipfsCid));
    }

    /// @notice Validate that a manifest hash is non-zero
    function isValid(bytes32 manifestHash) internal pure returns (bool) {
        return manifestHash != bytes32(0);
    }

    /// @notice Validate that outcome count is within bounds
    function isValidOutcomeCount(uint8 outcomeCount) internal pure returns (bool) {
        return outcomeCount >= 2 && outcomeCount <= 32;
    }

    /// @notice Validate that an outcome index is within range for a manifest
    function isValidOutcome(bytes32 manifestHash, uint8 outcomeIndex, uint8 outcomeCount)
        internal
        pure
        returns (bool)
    {
        return manifestHash != bytes32(0) && outcomeIndex < outcomeCount;
    }
}
