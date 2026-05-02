// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ManifestRegistry} from "../../src/core/ManifestRegistry.sol";
import {IManifestRegistry} from "../../src/interfaces/IManifestRegistry.sol";

contract ManifestRegistryTest is Test {
    ManifestRegistry public registry;
    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");

    function setUp() public {
        registry = new ManifestRegistry(owner);
    }

    function test_register_basic() public {
        vm.prank(alice);
        bytes32 hash = registry.register("QmTestCID123", 3);
        assertNotEq(hash, bytes32(0));
        assertTrue(registry.isRegistered(hash));
    }

    function test_register_returns_correct_hash() public {
        string memory cid = "QmSomeCID456";
        vm.prank(alice);
        bytes32 hash = registry.register(cid, 2);
        assertEq(hash, keccak256(bytes(cid)));
    }

    function test_register_emits_event() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit IManifestRegistry.ManifestRegistered(
            keccak256(bytes("QmCID789")),
            alice,
            "QmCID789"
        );
        registry.register("QmCID789", 4);
    }

    function test_register_reverts_empty_cid() public {
        vm.prank(alice);
        vm.expectRevert("ManifestRegistry: empty CID");
        registry.register("", 2);
    }

    function test_register_reverts_invalid_outcome_count() public {
        vm.prank(alice);
        vm.expectRevert("ManifestRegistry: invalid outcome count");
        registry.register("QmTest", 1); // min is 2

        vm.prank(alice);
        vm.expectRevert("ManifestRegistry: invalid outcome count");
        registry.register("QmTest2", 33); // max is 32
    }

    function test_register_reverts_duplicate() public {
        vm.prank(alice);
        registry.register("QmDuplicate", 2);

        vm.prank(alice);
        vm.expectRevert("ManifestRegistry: already registered");
        registry.register("QmDuplicate", 2);
    }

    function test_freeze() public {
        vm.prank(alice);
        bytes32 hash = registry.register("QmFreezable", 2);

        vm.prank(alice);
        registry.freeze(hash);

        IManifestRegistry.Manifest memory m = registry.getManifest(hash);
        assertTrue(m.frozen);
    }

    function test_freeze_reverts_not_registrar() public {
        vm.prank(alice);
        bytes32 hash = registry.register("QmFreezeOther", 2);

        vm.prank(owner);
        vm.expectRevert("ManifestRegistry: not registrar");
        registry.freeze(hash);
    }

    function test_get_outcome_count() public {
        vm.prank(alice);
        bytes32 hash = registry.register("QmThreeOutcomes", 3);
        assertEq(registry.getOutcomeCount(hash), 3);
    }

    function test_is_not_registered() public {
        assertFalse(registry.isRegistered(bytes32(uint256(1))));
    }

    function testFuzz_register(string calldata cid, uint8 count) public {
        vm.assume(bytes(cid).length > 0);
        vm.assume(count >= 2 && count <= 32);
        vm.prank(alice);
        bytes32 hash = registry.register(cid, count);
        assertTrue(registry.isRegistered(hash));
        assertEq(registry.getOutcomeCount(hash), count);
    }
}
