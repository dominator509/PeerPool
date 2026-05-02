// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AttestationVerifier} from "../../src/attestation/AttestationVerifier.sol";
import {IAttestationVerifier} from "../../src/interfaces/IAttestationVerifier.sol";

contract AttestationVerifierTest is Test {
    AttestationVerifier public verifier;

    address public owner = makeAddr("owner");
    uint256 public signerKey = 0xA11CE;
    address public signer;

    function setUp() public {
        verifier = new AttestationVerifier(owner);
        signer = vm.addr(signerKey);

        vm.prank(owner);
        verifier.authorizeSigner(signer);
    }

    function _makeAttestation() internal view returns (IAttestationVerifier.Attestation memory) {
        return IAttestationVerifier.Attestation({
            disputeId: keccak256("dispute-1"),
            outcomeIndex: 1,
            confidence: 8500,
            summaryIpfsCid: "QmAISummary",
            timestamp: uint64(block.timestamp),
            signer: signer
        });
    }

    function _signAttestation(IAttestationVerifier.Attestation memory attest)
        internal
        view
        returns (bytes memory)
    {
        bytes32 typeHash = verifier.ATTESTATION_TYPEHASH();
        bytes32 domainSep = verifier.domainSeparator();

        bytes32 structHash = keccak256(abi.encode(
            typeHash,
            attest.disputeId,
            attest.outcomeIndex,
            attest.confidence,
            keccak256(bytes(attest.summaryIpfsCid)),
            attest.timestamp,
            attest.signer
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_verify_valid_signature() public view {
        IAttestationVerifier.Attestation memory attest = _makeAttestation();
        bytes memory sig = _signAttestation(attest);
        assertTrue(verifier.verify(attest, sig));
    }

    function test_verify_invalid_signer() public {
        IAttestationVerifier.Attestation memory attest = _makeAttestation();
        attest.signer = makeAddr("unauthorized");
        bytes memory sig = _signAttestation(attest);
        assertFalse(verifier.verify(attest, sig));
    }

    function test_verify_confidence_overflow() public {
        IAttestationVerifier.Attestation memory attest = _makeAttestation();
        attest.confidence = 10_001;
        bytes memory sig = _signAttestation(attest);
        assertFalse(verifier.verify(attest, sig));
    }

    function test_recordAttestation() public {
        IAttestationVerifier.Attestation memory attest = _makeAttestation();
        bytes memory sig = _signAttestation(attest);
        verifier.recordAttestation(attest, sig);
    }

    function test_recordAttestation_reverts_duplicate() public {
        IAttestationVerifier.Attestation memory attest = _makeAttestation();
        bytes memory sig = _signAttestation(attest);
        verifier.recordAttestation(attest, sig);

        vm.expectRevert("AttestationVerifier: duplicate");
        verifier.recordAttestation(attest, sig);
    }

    function test_authorize_revoke_signer() public {
        address newSigner = makeAddr("newSigner");
        assertFalse(verifier.isAuthorizedSigner(newSigner));

        vm.prank(owner);
        verifier.authorizeSigner(newSigner);
        assertTrue(verifier.isAuthorizedSigner(newSigner));

        vm.prank(owner);
        verifier.revokeSigner(newSigner);
        assertFalse(verifier.isAuthorizedSigner(newSigner));
    }
}
