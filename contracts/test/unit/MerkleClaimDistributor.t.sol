// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MerkleClaimDistributor} from "../../src/settlement/MerkleClaimDistributor.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract MerkleClaimDistributorTest is Test {
    MerkleClaimDistributor public distributor;
    MockERC20 public token;

    address public settlementEngine = makeAddr("settlementEngine");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    bytes32 constant ESCROW_ID = keccak256("test-escrow");

    // Simple two-leaf Merkle tree for testing
    // Leaf0: keccak256(ESCROW_ID, alice, 1 ether)
    // Leaf1: keccak256(ESCROW_ID, bob, 2 ether)
    bytes32 public leaf0;
    bytes32 public leaf1;
    bytes32 public root;

    function setUp() public {
        distributor = new MerkleClaimDistributor(settlementEngine);
        token = new MockERC20("Test USDC", "TUSDC", 6);

        leaf0 = keccak256(abi.encodePacked(ESCROW_ID, alice, uint256(1 ether)));
        leaf1 = keccak256(abi.encodePacked(ESCROW_ID, bob, uint256(2 ether)));

        // Two-leaf tree: root = hash(leaf0, leaf1) with sorted leaves
        if (leaf0 < leaf1) {
            root = keccak256(abi.encodePacked(leaf0, leaf1));
        } else {
            root = keccak256(abi.encodePacked(leaf1, leaf0));
        }

        token.mint(address(distributor), 3 ether);
    }

    function _setDistribution() internal {
        vm.prank(settlementEngine);
        distributor.setDistribution(ESCROW_ID, root, address(token), 3 ether);
    }

    function _proofFor(address claimant) internal view returns (bytes32[] memory) {
        bytes32[] memory proof = new bytes32[](1);
        if (claimant == alice) {
            proof[0] = leaf1;
        } else {
            proof[0] = leaf0;
        }
        return proof;
    }

    function test_setDistribution() public {
        _setDistribution();
        MerkleClaimDistributor.Distribution memory dist = distributor.getDistribution(ESCROW_ID);
        assertEq(dist.merkleRoot, root);
        assertTrue(dist.active);
    }

    function test_setDistribution_reverts_not_engine() public {
        vm.prank(alice);
        vm.expectRevert("MerkleDist: not engine");
        distributor.setDistribution(ESCROW_ID, root, address(token), 3 ether);
    }

    function test_claim_alice() public {
        _setDistribution();
        uint256 balBefore = token.balanceOf(alice);
        bytes32[] memory proof = _proofFor(alice);

        vm.prank(alice);
        distributor.claim(ESCROW_ID, 1 ether, proof);

        assertEq(token.balanceOf(alice), balBefore + 1 ether);
        assertTrue(distributor.hasClaimed(ESCROW_ID, alice));
    }

    function test_claim_reverts_double_claim() public {
        _setDistribution();
        bytes32[] memory proof = _proofFor(alice);

        vm.prank(alice);
        distributor.claim(ESCROW_ID, 1 ether, proof);

        vm.prank(alice);
        vm.expectRevert("MerkleDist: already claimed");
        distributor.claim(ESCROW_ID, 1 ether, proof);
    }

    function test_claim_reverts_invalid_proof() public {
        _setDistribution();
        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = bytes32(uint256(999));

        vm.prank(alice);
        vm.expectRevert("MerkleDist: invalid proof");
        distributor.claim(ESCROW_ID, 1 ether, badProof);
    }

    function test_verifyProof() public {
        _setDistribution();
        bytes32[] memory proof = _proofFor(alice);
        assertTrue(distributor.verifyProof(ESCROW_ID, alice, 1 ether, proof));
        assertFalse(distributor.verifyProof(ESCROW_ID, alice, 2 ether, proof));
    }
}
