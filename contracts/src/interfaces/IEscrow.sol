// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEscrow
/// @notice Interface for the PeerPool escrow contract
interface IEscrow {
    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum EscrowState {
        Pending,   // Created, not yet fully funded
        Funded,    // All participants have deposited
        Active,    // Outcome voting is open
        Disputed,  // A dispute has been raised
        Settled,   // Outcome has been executed
        Closed     // Funds distributed, escrow archived
    }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct EscrowConfig {
        bytes32 manifestHash;   // Keccak256 of the manifest JSON / IPFS CID
        address token;          // ERC-20 token address (address(0) = native ETH)
        uint256 totalAmount;    // Total expected funded amount
        uint64 deadline;        // Unix timestamp — fail-closed deadline
        address creator;        // Escrow creator / initiator
    }

    struct ParticipantInfo {
        address addr;
        uint256 depositedAmount;
        ParticipantRole role;
    }

    enum ParticipantRole { Depositor, Beneficiary, Arbitrator, Observer }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EscrowCreated(bytes32 indexed escrowId, address indexed creator, bytes32 manifestHash);
    event ParticipantAdded(bytes32 indexed escrowId, address indexed participant, ParticipantRole role);
    event Deposited(bytes32 indexed escrowId, address indexed depositor, uint256 amount);
    event EscrowFunded(bytes32 indexed escrowId, uint256 totalAmount);
    event OutcomeProposed(bytes32 indexed escrowId, uint8 outcomeIndex, address proposer);
    event EscrowSettled(bytes32 indexed escrowId, uint8 outcomeIndex);
    event EscrowClosed(bytes32 indexed escrowId);
    event DeadlineTriggered(bytes32 indexed escrowId);

    // -------------------------------------------------------------------------
    // Core functions
    // -------------------------------------------------------------------------

    /// @notice Create a new escrow with a manifest and participants
    function createEscrow(
        EscrowConfig calldata config,
        ParticipantInfo[] calldata participants
    ) external returns (bytes32 escrowId);

    /// @notice Deposit funds into an escrow
    function deposit(bytes32 escrowId, uint256 amount) external payable;

    /// @notice Propose an outcome for the escrow (requires quorum vote)
    function proposeOutcome(bytes32 escrowId, uint8 outcomeIndex) external;

    /// @notice Trigger the deadline — moves escrow to refund path if not settled
    function triggerDeadline(bytes32 escrowId) external;

    /// @notice Get escrow state
    function getState(bytes32 escrowId) external view returns (EscrowState);

    /// @notice Get escrow config
    function getConfig(bytes32 escrowId) external view returns (EscrowConfig memory);
}
