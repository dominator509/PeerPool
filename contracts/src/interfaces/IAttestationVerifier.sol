// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAttestationVerifier
/// @notice EIP-712 typed attestation verification for AI-assisted verdicts
interface IAttestationVerifier {
    struct Attestation {
        bytes32 disputeId;
        uint8 outcomeIndex;
        uint256 confidence;     // 0-10000 (basis points)
        string summaryIpfsCid;  // IPFS CID of AI reasoning summary
        uint64 timestamp;
        address signer;
    }

    event AttestationVerified(bytes32 indexed disputeId, address indexed signer, uint8 outcomeIndex);
    event SignerAuthorized(address indexed signer);
    event SignerRevoked(address indexed signer);

    /// @notice Verify an EIP-712 signed attestation
    function verify(
        Attestation calldata attestation,
        bytes calldata signature
    ) external view returns (bool valid);

    /// @notice Verify and record an attestation on-chain
    function recordAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external;

    /// @notice Check if a signer is authorized
    function isAuthorizedSigner(address signer) external view returns (bool);

    /// @notice Add an authorized signer (admin only)
    function authorizeSigner(address signer) external;

    /// @notice Revoke a signer
    function revokeSigner(address signer) external;

    /// @notice Get the EIP-712 domain separator
    function domainSeparator() external view returns (bytes32);
}
