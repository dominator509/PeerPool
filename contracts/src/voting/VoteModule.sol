// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IManifestRegistry} from "../interfaces/IManifestRegistry.sol";

/// @title VoteModule
/// @notice Participant outcome voting with configurable quorum and weight.
///         Votes are weighted by deposit amounts. Quorum is expressed as BPS
///         of total voting weight (e.g. 5100 = 51%).
contract VoteModule {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct VoteConfig {
        bytes32 escrowId;
        bytes32 manifestHash;
        uint8 outcomeCount;
        uint256 quorumBps;   // Required weight fraction in BPS (e.g. 5100 = 51%)
        uint256 totalWeight; // Sum of all participant weights
    }

    struct Ballot {
        mapping(address => uint8) choices;        // voter => outcomeIndex
        mapping(address => bool) hasVoted;
        mapping(uint8 => uint256) outcomeTally;   // outcomeIndex => weight
        uint256 totalCast;
        bool finalized;
        uint8 winningOutcome;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => VoteConfig) private _configs;
    mapping(bytes32 => Ballot) private _ballots;
    mapping(bytes32 => mapping(address => uint256)) private _voterWeights;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event VoteOpened(bytes32 indexed escrowId);
    event VoteCast(bytes32 indexed escrowId, address indexed voter, uint8 outcomeIndex, uint256 weight);
    event VoteFinalized(bytes32 indexed escrowId, uint8 winningOutcome, uint256 winningWeight);
    event QuorumNotReached(bytes32 indexed escrowId);

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @notice Initialize vote tracking for an escrow
    function initVote(
        bytes32 escrowId,
        bytes32 manifestHash,
        uint8 outcomeCount,
        uint256 quorumBps,
        address[] calldata voters,
        uint256[] calldata weights
    ) external {
        require(_configs[escrowId].escrowId == bytes32(0), "VoteModule: already initialized");
        require(quorumBps > 0 && quorumBps <= 10_000, "VoteModule: invalid quorum");
        require(voters.length == weights.length, "VoteModule: length mismatch");
        require(outcomeCount >= 2, "VoteModule: need at least 2 outcomes");

        uint256 totalWeight;
        for (uint256 i; i < voters.length; ++i) {
            _voterWeights[escrowId][voters[i]] = weights[i];
            totalWeight += weights[i];
        }

        _configs[escrowId] = VoteConfig({
            escrowId: escrowId,
            manifestHash: manifestHash,
            outcomeCount: outcomeCount,
            quorumBps: quorumBps,
            totalWeight: totalWeight
        });

        emit VoteOpened(escrowId);
    }

    /// @notice Cast a vote on behalf of a participant
    function castVote(bytes32 escrowId, address voter, uint8 outcomeIndex) external {
        VoteConfig storage config = _configs[escrowId];
        require(config.escrowId != bytes32(0), "VoteModule: not initialized");
        Ballot storage ballot = _ballots[escrowId];
        require(!ballot.finalized, "VoteModule: finalized");
        require(!ballot.hasVoted[voter], "VoteModule: already voted");
        require(outcomeIndex < config.outcomeCount, "VoteModule: invalid outcome");

        uint256 weight = _voterWeights[escrowId][voter];
        require(weight > 0, "VoteModule: not a voter");

        ballot.choices[voter] = outcomeIndex;
        ballot.hasVoted[voter] = true;
        ballot.outcomeTally[outcomeIndex] += weight;
        ballot.totalCast += weight;

        emit VoteCast(escrowId, voter, outcomeIndex, weight);
    }

    /// @notice Finalize the vote — determine winner if quorum reached
    function finalizeVote(bytes32 escrowId) external returns (bool quorumReached, uint8 winner) {
        VoteConfig storage config = _configs[escrowId];
        Ballot storage ballot = _ballots[escrowId];
        require(!ballot.finalized, "VoteModule: already finalized");

        uint256 required = (config.totalWeight * config.quorumBps) / 10_000;
        if (ballot.totalCast < required) {
            emit QuorumNotReached(escrowId);
            return (false, 0);
        }

        uint256 maxWeight;
        uint8 winning;
        for (uint8 i; i < config.outcomeCount; ++i) {
            if (ballot.outcomeTally[i] > maxWeight) {
                maxWeight = ballot.outcomeTally[i];
                winning = i;
            }
        }

        ballot.finalized = true;
        ballot.winningOutcome = winning;

        emit VoteFinalized(escrowId, winning, maxWeight);
        return (true, winning);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function getConfig(bytes32 escrowId) external view returns (VoteConfig memory) {
        return _configs[escrowId];
    }

    function hasVoted(bytes32 escrowId, address voter) external view returns (bool) {
        return _ballots[escrowId].hasVoted[voter];
    }

    function getOutcomeTally(bytes32 escrowId, uint8 outcomeIndex) external view returns (uint256) {
        return _ballots[escrowId].outcomeTally[outcomeIndex];
    }

    function isFinalized(bytes32 escrowId) external view returns (bool) {
        return _ballots[escrowId].finalized;
    }

    function getWinner(bytes32 escrowId) external view returns (uint8) {
        require(_ballots[escrowId].finalized, "VoteModule: not finalized");
        return _ballots[escrowId].winningOutcome;
    }
}
