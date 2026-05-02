// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IManifestRegistry
/// @notice Registry for outcome manifests referenced by escrows
interface IManifestRegistry {
    struct Manifest {
        bytes32 hash;           // keccak256 of the canonical JSON
        string ipfsCid;         // IPFS CID of the manifest JSON
        address registrar;      // Who registered the manifest
        uint64 registeredAt;    // Block timestamp
        uint8 outcomeCount;     // Number of defined outcomes
        bool frozen;            // Frozen manifests cannot be updated
    }

    event ManifestRegistered(bytes32 indexed manifestHash, address indexed registrar, string ipfsCid);
    event ManifestFrozen(bytes32 indexed manifestHash);

    /// @notice Register a new manifest
    function register(string calldata ipfsCid, uint8 outcomeCount) external returns (bytes32 manifestHash);

    /// @notice Freeze a manifest so it cannot be re-registered
    function freeze(bytes32 manifestHash) external;

    /// @notice Check if a manifest hash is registered
    function isRegistered(bytes32 manifestHash) external view returns (bool);

    /// @notice Get manifest details
    function getManifest(bytes32 manifestHash) external view returns (Manifest memory);

    /// @notice Get outcome count for a manifest
    function getOutcomeCount(bytes32 manifestHash) external view returns (uint8);
}
