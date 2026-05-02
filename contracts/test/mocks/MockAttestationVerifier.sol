// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAttestationVerifier} from "../../src/interfaces/IAttestationVerifier.sol";

/// @title MockAttestationVerifier
/// @notice Mock attestation verifier — always approves authorized signers
contract MockAttestationVerifier is IAttestationVerifier {
    mapping(address => bool) private _authorized;

    function verify(Attestation calldata, bytes calldata) external pure override returns (bool) {
        return true;
    }

    function recordAttestation(Attestation calldata, bytes calldata) external override {}

    function isAuthorizedSigner(address signer) external view override returns (bool) {
        return _authorized[signer];
    }

    function authorizeSigner(address signer) external override {
        _authorized[signer] = true;
        emit SignerAuthorized(signer);
    }

    function revokeSigner(address signer) external override {
        _authorized[signer] = false;
        emit SignerRevoked(signer);
    }

    function domainSeparator() external pure override returns (bytes32) {
        return bytes32(0);
    }
}
