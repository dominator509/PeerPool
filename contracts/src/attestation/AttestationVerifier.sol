// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAttestationVerifier} from "../interfaces/IAttestationVerifier.sol";

/// @title AttestationVerifier
/// @notice EIP-712 typed attestation verification for AI-assisted dispute verdicts.
///         Authorized signers (AI service keys) can produce bounded verdict proposals
///         which are then verified on-chain before any ratification process.
///
/// Security model:
///   - Signers are authorized by protocol admin only
///   - Attestations are non-custodial: a valid attestation does NOT move funds
///   - Attestations are inputs to the ratification process in DisputeController
///   - Confidence is capped at 10000 BPS; proposals outside range are rejected
contract AttestationVerifier is EIP712, IAttestationVerifier {
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // EIP-712 Type Hash
    // -------------------------------------------------------------------------

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 disputeId,uint8 outcomeIndex,uint256 confidence,string summaryIpfsCid,uint64 timestamp,address signer)"
    );

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(address => bool) private _authorizedSigners;
    mapping(bytes32 => bool) private _recordedAttestations; // digest => recorded

    address public owner;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _owner) EIP712("PeerPoolAttestationVerifier", "1") {
        require(_owner != address(0), "AttestationVerifier: zero owner");
        owner = _owner;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "AttestationVerifier: not owner");
        _;
    }

    // -------------------------------------------------------------------------
    // IAttestationVerifier implementation
    // -------------------------------------------------------------------------

    /// @inheritdoc IAttestationVerifier
    function verify(
        Attestation calldata attestation,
        bytes calldata signature
    ) external view override returns (bool valid) {
        if (!_authorizedSigners[attestation.signer]) return false;
        if (attestation.confidence > 10_000) return false;

        bytes32 digest = _hashAttestation(attestation);
        address recovered = digest.recover(signature);
        return recovered == attestation.signer;
    }

    /// @inheritdoc IAttestationVerifier
    function recordAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external override {
        require(_authorizedSigners[attestation.signer], "AttestationVerifier: unauthorized");
        require(attestation.confidence <= 10_000, "AttestationVerifier: confidence overflow");

        bytes32 digest = _hashAttestation(attestation);
        require(!_recordedAttestations[digest], "AttestationVerifier: duplicate");

        address recovered = digest.recover(signature);
        require(recovered == attestation.signer, "AttestationVerifier: invalid sig");

        _recordedAttestations[digest] = true;

        emit AttestationVerified(attestation.disputeId, attestation.signer, attestation.outcomeIndex);
    }

    /// @inheritdoc IAttestationVerifier
    function isAuthorizedSigner(address signer) external view override returns (bool) {
        return _authorizedSigners[signer];
    }

    /// @inheritdoc IAttestationVerifier
    function authorizeSigner(address signer) external override onlyOwner {
        require(signer != address(0), "AttestationVerifier: zero signer");
        _authorizedSigners[signer] = true;
        emit SignerAuthorized(signer);
    }

    /// @inheritdoc IAttestationVerifier
    function revokeSigner(address signer) external override onlyOwner {
        _authorizedSigners[signer] = false;
        emit SignerRevoked(signer);
    }

    /// @inheritdoc IAttestationVerifier
    function domainSeparator() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _hashAttestation(Attestation calldata a) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            a.disputeId,
            a.outcomeIndex,
            a.confidence,
            keccak256(bytes(a.summaryIpfsCid)),
            a.timestamp,
            a.signer
        )));
    }
}
