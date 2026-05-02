// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VoteModule} from "../../src/voting/VoteModule.sol";

contract VoteModuleTest is Test {
    VoteModule public voteModule;

    bytes32 constant ESCROW_ID = keccak256("test-escrow");
    bytes32 constant MANIFEST_HASH = keccak256("test-manifest");

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    function setUp() public {
        voteModule = new VoteModule();
    }

    function _initVote(uint256 quorumBps) internal {
        address[] memory voters = new address[](3);
        voters[0] = alice;
        voters[1] = bob;
        voters[2] = carol;

        uint256[] memory weights = new uint256[](3);
        weights[0] = 100;
        weights[1] = 100;
        weights[2] = 100;

        voteModule.initVote(ESCROW_ID, MANIFEST_HASH, 3, quorumBps, voters, weights);
    }

    function test_initVote() public {
        _initVote(5100);
        VoteModule.VoteConfig memory cfg = voteModule.getConfig(ESCROW_ID);
        assertEq(cfg.totalWeight, 300);
        assertEq(cfg.quorumBps, 5100);
        assertEq(cfg.outcomeCount, 3);
    }

    function test_castVote() public {
        _initVote(5100);
        voteModule.castVote(ESCROW_ID, alice, 0);
        assertTrue(voteModule.hasVoted(ESCROW_ID, alice));
        assertEq(voteModule.getOutcomeTally(ESCROW_ID, 0), 100);
    }

    function test_castVote_reverts_double_vote() public {
        _initVote(5100);
        voteModule.castVote(ESCROW_ID, alice, 0);
        vm.expectRevert("VoteModule: already voted");
        voteModule.castVote(ESCROW_ID, alice, 1);
    }

    function test_castVote_reverts_invalid_outcome() public {
        _initVote(5100);
        vm.expectRevert("VoteModule: invalid outcome");
        voteModule.castVote(ESCROW_ID, alice, 5);
    }

    function test_finalizeVote_quorum_not_reached() public {
        _initVote(5100);
        voteModule.castVote(ESCROW_ID, alice, 0); // only 1/3 voted

        (bool reached,) = voteModule.finalizeVote(ESCROW_ID);
        assertFalse(reached);
    }

    function test_finalizeVote_majority_wins() public {
        _initVote(5100);
        voteModule.castVote(ESCROW_ID, alice, 1);
        voteModule.castVote(ESCROW_ID, bob, 1);
        voteModule.castVote(ESCROW_ID, carol, 0);

        (bool reached, uint8 winner) = voteModule.finalizeVote(ESCROW_ID);
        assertTrue(reached);
        assertEq(winner, 1);
    }

    function test_finalizeVote_reverts_double_finalize() public {
        _initVote(5100);
        voteModule.castVote(ESCROW_ID, alice, 0);
        voteModule.castVote(ESCROW_ID, bob, 0);
        voteModule.finalizeVote(ESCROW_ID);

        vm.expectRevert("VoteModule: already finalized");
        voteModule.finalizeVote(ESCROW_ID);
    }

    function test_getWinner_reverts_not_finalized() public {
        _initVote(5100);
        vm.expectRevert("VoteModule: not finalized");
        voteModule.getWinner(ESCROW_ID);
    }
}
