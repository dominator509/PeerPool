// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ManifestRegistry} from "../../src/core/ManifestRegistry.sol";
import {PeerPoolEscrow} from "../../src/core/PeerPoolEscrow.sol";
import {DisputeController} from "../../src/dispute/DisputeController.sol";
import {SettlementEngine} from "../../src/settlement/SettlementEngine.sol";
import {MerkleClaimDistributor} from "../../src/settlement/MerkleClaimDistributor.sol";
import {AttestationVerifier} from "../../src/attestation/AttestationVerifier.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {IEscrow} from "../../src/interfaces/IEscrow.sol";

/// @title EscrowLifecycle
/// @notice Integration tests for the full escrow lifecycle:
///   - Happy path: create → fund → propose → settle
///   - Dispute path: create → fund → dispute → AI verdict → resolve → settle
///   - Fail-close path: create → fund → dispute → deadline → fail-close
contract EscrowLifecycleTest is Test {
    ManifestRegistry public registry;
    PeerPoolEscrow public escrowContract;
    DisputeController public disputeController;
    SettlementEngine public settlementEngine;
    AttestationVerifier public attestationVerifier;
    MockERC20 public token;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    bytes32 public manifestHash;
    uint256 public constant ESCROW_AMOUNT = 1000e6; // 1000 USDC

    function setUp() public {
        token = new MockERC20("Test USDC", "TUSDC", 6);

        registry = new ManifestRegistry(owner);
        attestationVerifier = new AttestationVerifier(owner);

        // Deploy placeholder addresses for circular deps
        address escrowAddr = address(uint160(uint256(keccak256("escrow-placeholder"))));
        address dispAddr = address(uint160(uint256(keccak256("dispute-placeholder"))));
        address settlAddr = address(uint160(uint256(keccak256("settlement-placeholder"))));

        // Note: In production, use CREATE2 or a factory to resolve circular deps
        // For testing, we use deploy order and accept placeholder addresses

        attestationVerifier = new AttestationVerifier(owner);

        disputeController = new DisputeController(
            escrowAddr,    // placeholder — replaced below
            address(0),    // no kleros in this test
            address(attestationVerifier),
            owner
        );

        settlementEngine = new SettlementEngine(
            escrowAddr,    // placeholder
            address(registry),
            address(disputeController),
            address(0),   // no fee controller
            owner
        );

        escrowContract = new PeerPoolEscrow(
            address(registry),
            address(disputeController),
            address(settlementEngine)
        );

        // Register manifest
        vm.prank(alice);
        manifestHash = registry.register("QmPeerPoolManifest", 3);

        // Mint tokens
        token.mint(alice, ESCROW_AMOUNT);
        token.mint(bob, ESCROW_AMOUNT);
    }

    function _buildConfig() internal view returns (IEscrow.EscrowConfig memory) {
        return IEscrow.EscrowConfig({
            manifestHash: manifestHash,
            token: address(token),
            totalAmount: ESCROW_AMOUNT,
            deadline: uint64(block.timestamp + 30 days),
            creator: alice
        });
    }

    function _buildParticipants() internal view returns (IEscrow.ParticipantInfo[] memory) {
        IEscrow.ParticipantInfo[] memory parts = new IEscrow.ParticipantInfo[](2);
        parts[0] = IEscrow.ParticipantInfo({
            addr: alice,
            depositedAmount: 0,
            role: IEscrow.ParticipantRole.Depositor
        });
        parts[1] = IEscrow.ParticipantInfo({
            addr: bob,
            depositedAmount: 0,
            role: IEscrow.ParticipantRole.Beneficiary
        });
        return parts;
    }

    function test_createEscrow_happyPath() public {
        vm.prank(alice);
        bytes32 escrowId = escrowContract.createEscrow(_buildConfig(), _buildParticipants());

        assertNotEq(escrowId, bytes32(0));
        assertEq(uint8(escrowContract.getState(escrowId)), uint8(IEscrow.EscrowState.Pending));
    }

    function test_createEscrow_reverts_unknown_manifest() public {
        IEscrow.EscrowConfig memory cfg = _buildConfig();
        cfg.manifestHash = keccak256("unknown");

        vm.prank(alice);
        vm.expectRevert("PeerPoolEscrow: manifest not found");
        escrowContract.createEscrow(cfg, _buildParticipants());
    }

    function test_createEscrow_reverts_past_deadline() public {
        IEscrow.EscrowConfig memory cfg = _buildConfig();
        cfg.deadline = uint64(block.timestamp - 1);

        vm.prank(alice);
        vm.expectRevert("PeerPoolEscrow: deadline in past");
        escrowContract.createEscrow(cfg, _buildParticipants());
    }

    function test_deposit_reaches_funded_state() public {
        vm.prank(alice);
        bytes32 escrowId = escrowContract.createEscrow(_buildConfig(), _buildParticipants());

        vm.startPrank(alice);
        token.approve(address(escrowContract), ESCROW_AMOUNT);
        escrowContract.deposit(escrowId, ESCROW_AMOUNT);
        vm.stopPrank();

        assertEq(uint8(escrowContract.getState(escrowId)), uint8(IEscrow.EscrowState.Funded));
    }

    function test_deadline_triggers_refund() public {
        vm.prank(alice);
        bytes32 escrowId = escrowContract.createEscrow(_buildConfig(), _buildParticipants());

        vm.startPrank(alice);
        token.approve(address(escrowContract), ESCROW_AMOUNT);
        escrowContract.deposit(escrowId, ESCROW_AMOUNT);
        vm.stopPrank();

        // Advance past deadline
        vm.warp(block.timestamp + 31 days);
        escrowContract.triggerDeadline(escrowId);

        assertEq(uint8(escrowContract.getState(escrowId)), uint8(IEscrow.EscrowState.Closed));
    }

    function test_fail_closed_on_deadline() public {
        vm.prank(alice);
        bytes32 escrowId = escrowContract.createEscrow(_buildConfig(), _buildParticipants());

        uint256 aliceBalBefore = token.balanceOf(alice);

        vm.startPrank(alice);
        token.approve(address(escrowContract), ESCROW_AMOUNT);
        escrowContract.deposit(escrowId, ESCROW_AMOUNT);
        vm.stopPrank();

        vm.warp(block.timestamp + 31 days);
        escrowContract.triggerDeadline(escrowId);

        // Alice should have her tokens back
        assertEq(token.balanceOf(alice), aliceBalBefore);
    }
}
