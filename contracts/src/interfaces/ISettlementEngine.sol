// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISettlementEngine
/// @notice Executes fund distribution based on resolved outcomes
interface ISettlementEngine {
    struct Settlement {
        bytes32 escrowId;
        uint8 outcomeIndex;
        bytes32 settlementRoot;  // Merkle root for large distributions (0 if direct)
        bool useMerkle;          // True if using Merkle claim distributor
        uint64 executedAt;
    }

    event SettlementExecuted(bytes32 indexed escrowId, uint8 outcomeIndex, bytes32 settlementRoot);
    event DirectDistribution(bytes32 indexed escrowId, address indexed recipient, uint256 amount);
    event MerkleRootSet(bytes32 indexed escrowId, bytes32 merkleRoot, uint256 totalAmount);

    /// @notice Execute a settlement for the given escrow and outcome
    function executeSettlement(bytes32 escrowId, uint8 outcomeIndex) external;

    /// @notice Set a Merkle root for a large-scale claim distribution
    function setMerkleRoot(bytes32 escrowId, bytes32 merkleRoot, uint256 totalAmount) external;

    /// @notice Check if an escrow has been settled
    function isSettled(bytes32 escrowId) external view returns (bool);

    /// @notice Get settlement details
    function getSettlement(bytes32 escrowId) external view returns (Settlement memory);
}
