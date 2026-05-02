// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDisputeController
/// @notice Manages the dispute lifecycle — fail-closed behavior required
interface IDisputeController {
    enum DisputeState {
        Open,       // Dispute raised, awaiting review
        Escalated,  // Escalated to external arbitration (Kleros)
        Resolved,   // Outcome determined
        Closed      // Settlement executed
    }

    struct Dispute {
        bytes32 escrowId;
        address disputer;
        uint256 bondAmount;     // Challenge bond posted by disputer
        DisputeState state;
        uint8 resolvedOutcome;  // 0xFF = no outcome (refund path)
        uint64 openedAt;
        uint64 resolvedAt;
        bytes32 arbitrationRef; // External arbitration ID (e.g. Kleros dispute ID)
        bytes verdictData;      // Encoded verdict payload (AI summary + signatures)
    }

    event DisputeOpened(bytes32 indexed escrowId, bytes32 indexed disputeId, address disputer, uint256 bond);
    event DisputeEscalated(bytes32 indexed disputeId, bytes32 arbitrationRef);
    event VerdictProposed(bytes32 indexed disputeId, uint8 outcomeIndex, address proposer);
    event DisputeResolved(bytes32 indexed disputeId, uint8 outcomeIndex, bool byArbitrator);
    event BondSlashed(bytes32 indexed disputeId, address disputer, uint256 slashedAmount);
    event BondReturned(bytes32 indexed disputeId, address disputer, uint256 amount);

    /// @notice Open a dispute for an escrow — requires bond payment
    function openDispute(bytes32 escrowId, bytes calldata evidence) external payable returns (bytes32 disputeId);

    /// @notice Escalate an open dispute to external arbitration
    function escalate(bytes32 disputeId) external;

    /// @notice Propose a bounded AI-assisted verdict (non-custodial, requires ratification)
    function proposeVerdict(bytes32 disputeId, uint8 outcomeIndex, bytes calldata verdictData) external;

    /// @notice Ratify a proposed verdict (requires threshold of participants)
    function ratifyVerdict(bytes32 disputeId) external;

    /// @notice Receive external arbitration callback (Kleros etc.)
    function receiveArbitrationResult(bytes32 disputeId, uint8 outcomeIndex) external;

    /// @notice Fail-closed: resolve with refund if deadline exceeded
    function failClose(bytes32 disputeId) external;

    /// @notice Get dispute details
    function getDispute(bytes32 disputeId) external view returns (Dispute memory);

    /// @notice Get active dispute for an escrow
    function getEscrowDispute(bytes32 escrowId) external view returns (bytes32 disputeId);
}
