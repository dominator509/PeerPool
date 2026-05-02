// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IManifestRegistry} from "../interfaces/IManifestRegistry.sol";
import {ManifestLib} from "../lib/ManifestLib.sol";

/// @title ManifestRegistry
/// @notice On-chain registry for outcome manifests referenced by escrows.
///         Manifests are stored off-chain (IPFS) and referenced by their hash.
contract ManifestRegistry is IManifestRegistry {
    using ManifestLib for bytes32;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => Manifest) private _manifests;

    address public immutable owner;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _owner) {
        require(_owner != address(0), "ManifestRegistry: zero owner");
        owner = _owner;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "ManifestRegistry: not owner");
        _;
    }

    modifier onlyRegistrar(bytes32 manifestHash) {
        require(
            _manifests[manifestHash].registrar == msg.sender,
            "ManifestRegistry: not registrar"
        );
        _;
    }

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IManifestRegistry
    function register(string calldata ipfsCid, uint8 outcomeCount)
        external
        override
        returns (bytes32 manifestHash)
    {
        require(bytes(ipfsCid).length > 0, "ManifestRegistry: empty CID");
        require(ManifestLib.isValidOutcomeCount(outcomeCount), "ManifestRegistry: invalid outcome count");

        manifestHash = ManifestLib.computeHash(ipfsCid);
        require(!_manifests[manifestHash].frozen, "ManifestRegistry: already frozen");
        require(_manifests[manifestHash].registrar == address(0), "ManifestRegistry: already registered");

        _manifests[manifestHash] = Manifest({
            hash: manifestHash,
            ipfsCid: ipfsCid,
            registrar: msg.sender,
            registeredAt: uint64(block.timestamp),
            outcomeCount: outcomeCount,
            frozen: false
        });

        emit ManifestRegistered(manifestHash, msg.sender, ipfsCid);
    }

    /// @inheritdoc IManifestRegistry
    function freeze(bytes32 manifestHash) external override onlyRegistrar(manifestHash) {
        require(_manifests[manifestHash].registrar != address(0), "ManifestRegistry: not registered");
        require(!_manifests[manifestHash].frozen, "ManifestRegistry: already frozen");
        _manifests[manifestHash].frozen = true;
        emit ManifestFrozen(manifestHash);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IManifestRegistry
    function isRegistered(bytes32 manifestHash) external view override returns (bool) {
        return _manifests[manifestHash].registrar != address(0);
    }

    /// @inheritdoc IManifestRegistry
    function getManifest(bytes32 manifestHash) external view override returns (Manifest memory) {
        require(_manifests[manifestHash].registrar != address(0), "ManifestRegistry: not found");
        return _manifests[manifestHash];
    }

    /// @inheritdoc IManifestRegistry
    function getOutcomeCount(bytes32 manifestHash) external view override returns (uint8) {
        return _manifests[manifestHash].outcomeCount;
    }
}
