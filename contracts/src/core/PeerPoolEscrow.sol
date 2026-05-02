// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FundingPool} from "./FundingPool.sol";
import {IEscrow} from "../interfaces/IEscrow.sol";
import {IManifestRegistry} from "../interfaces/IManifestRegistry.sol";
import {ManifestLib} from "../lib/ManifestLib.sol";
import {AddressLib} from "../lib/AddressLib.sol";

/// @title PeerPoolEscrow
/// @notice Main escrow contract. Holds funds on-chain and manages the escrow
///         lifecycle from creation through settlement or fail-closed refund.
///
/// Key invariants:
///   - Funds are always held by this contract — never by a bridge or custodian
///   - Disputed escrows that exceed resolution deadline default to full refund
///   - Only authorized DisputeController can transition to Disputed state
///   - Only authorized SettlementEngine can execute distributions
contract PeerPoolEscrow is FundingPool, IEscrow {
    using ManifestLib for bytes32;
    using AddressLib for address[];

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct EscrowData {
        EscrowConfig config;
        EscrowState state;
        address[] participants;
        mapping(address => ParticipantInfo) participantInfo;
        uint8 proposedOutcome;
        address proposer;
        uint256 proposalTimestamp;
    }

    mapping(bytes32 => EscrowData) private _escrows;

    IManifestRegistry public immutable manifestRegistry;
    address public immutable disputeController;
    address public immutable settlementEngine;

    uint256 public escrowCount;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _manifestRegistry,
        address _disputeController,
        address _settlementEngine
    ) {
        AddressLib.requireNonZero(_manifestRegistry);
        AddressLib.requireNonZero(_disputeController);
        AddressLib.requireNonZero(_settlementEngine);
        manifestRegistry = IManifestRegistry(_manifestRegistry);
        disputeController = _disputeController;
        settlementEngine = _settlementEngine;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyDisputeController() {
        require(msg.sender == disputeController, "PeerPoolEscrow: not dispute controller");
        _;
    }

    modifier onlySettlementEngine() {
        require(msg.sender == settlementEngine, "PeerPoolEscrow: not settlement engine");
        _;
    }

    modifier inState(bytes32 escrowId, EscrowState expected) {
        require(_escrows[escrowId].state == expected, "PeerPoolEscrow: wrong state");
        _;
    }

    // -------------------------------------------------------------------------
    // IEscrow implementation
    // -------------------------------------------------------------------------

    /// @inheritdoc IEscrow
    function createEscrow(
        EscrowConfig calldata config,
        ParticipantInfo[] calldata participants
    ) external override returns (bytes32 escrowId) {
        require(manifestRegistry.isRegistered(config.manifestHash), "PeerPoolEscrow: manifest not found");
        require(config.totalAmount > 0, "PeerPoolEscrow: zero amount");
        require(config.deadline > block.timestamp, "PeerPoolEscrow: deadline in past");
        require(participants.length >= 2, "PeerPoolEscrow: need at least 2 participants");
        AddressLib.requireNonZero(config.creator);

        escrowId = keccak256(abi.encodePacked(
            config.manifestHash,
            config.creator,
            block.timestamp,
            escrowCount++
        ));

        EscrowData storage e = _escrows[escrowId];
        e.config = config;
        e.state = EscrowState.Pending;

        for (uint256 i; i < participants.length; ++i) {
            AddressLib.requireNonZero(participants[i].addr);
            e.participants.push(participants[i].addr);
            e.participantInfo[participants[i].addr] = participants[i];
        }

        _createPool(escrowId, config.token, config.totalAmount);

        emit EscrowCreated(escrowId, config.creator, config.manifestHash);

        for (uint256 i; i < participants.length; ++i) {
            emit ParticipantAdded(escrowId, participants[i].addr, participants[i].role);
        }
    }

    /// @inheritdoc IEscrow
    function deposit(bytes32 escrowId, uint256 amount)
        external
        payable
        override
        inState(escrowId, EscrowState.Pending)
    {
        require(
            _escrows[escrowId].participantInfo[msg.sender].addr == msg.sender,
            "PeerPoolEscrow: not a participant"
        );

        _deposit(escrowId, msg.sender, amount);
        _escrows[escrowId].participantInfo[msg.sender].depositedAmount += amount;

        emit Deposited(escrowId, msg.sender, amount);

        if (_pools[escrowId].locked) {
            _escrows[escrowId].state = EscrowState.Funded;
            emit EscrowFunded(escrowId, _pools[escrowId].depositedAmount);
        }
    }

    /// @inheritdoc IEscrow
    function proposeOutcome(bytes32 escrowId, uint8 outcomeIndex)
        external
        override
        inState(escrowId, EscrowState.Funded)
    {
        EscrowData storage e = _escrows[escrowId];
        require(
            e.participantInfo[msg.sender].addr == msg.sender,
            "PeerPoolEscrow: not a participant"
        );

        uint8 outcomeCount = manifestRegistry.getOutcomeCount(e.config.manifestHash);
        require(outcomeIndex < outcomeCount, "PeerPoolEscrow: invalid outcome");

        e.proposedOutcome = outcomeIndex;
        e.proposer = msg.sender;
        e.proposalTimestamp = block.timestamp;
        e.state = EscrowState.Active;

        emit OutcomeProposed(escrowId, outcomeIndex, msg.sender);
    }

    /// @inheritdoc IEscrow
    function triggerDeadline(bytes32 escrowId) external override {
        EscrowData storage e = _escrows[escrowId];
        require(block.timestamp > e.config.deadline, "PeerPoolEscrow: deadline not reached");
        require(
            e.state == EscrowState.Pending ||
            e.state == EscrowState.Funded ||
            e.state == EscrowState.Active ||
            e.state == EscrowState.Disputed,
            "PeerPoolEscrow: invalid state for deadline"
        );

        _refundAll(escrowId, e.participants);
        e.state = EscrowState.Closed;

        emit DeadlineTriggered(escrowId);
        emit EscrowClosed(escrowId);
    }

    // -------------------------------------------------------------------------
    // Privileged functions (called by DisputeController / SettlementEngine)
    // -------------------------------------------------------------------------

    /// @notice Mark escrow as disputed (called by DisputeController)
    function markDisputed(bytes32 escrowId) external onlyDisputeController {
        require(
            _escrows[escrowId].state == EscrowState.Funded ||
            _escrows[escrowId].state == EscrowState.Active,
            "PeerPoolEscrow: cannot dispute"
        );
        _escrows[escrowId].state = EscrowState.Disputed;
    }

    /// @notice Execute settlement distribution (called by SettlementEngine)
    function executeDistribution(
        bytes32 escrowId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlySettlementEngine {
        require(
            _escrows[escrowId].state == EscrowState.Active ||
            _escrows[escrowId].state == EscrowState.Disputed,
            "PeerPoolEscrow: wrong state for settlement"
        );
        require(recipients.length == amounts.length, "PeerPoolEscrow: length mismatch");

        for (uint256 i; i < recipients.length; ++i) {
            if (amounts[i] > 0) {
                _release(escrowId, recipients[i], amounts[i]);
                emit DirectDistribution(escrowId, recipients[i], amounts[i]);
            }
        }

        _escrows[escrowId].state = EscrowState.Settled;
        emit EscrowSettled(escrowId, _escrows[escrowId].proposedOutcome);
    }

    // -------------------------------------------------------------------------
    // View helpers (not in interface)
    // -------------------------------------------------------------------------

    event DirectDistribution(bytes32 indexed escrowId, address indexed recipient, uint256 amount);

    /// @inheritdoc IEscrow
    function getState(bytes32 escrowId) external view override returns (EscrowState) {
        return _escrows[escrowId].state;
    }

    /// @inheritdoc IEscrow
    function getConfig(bytes32 escrowId) external view override returns (EscrowConfig memory) {
        return _escrows[escrowId].config;
    }

    function getParticipants(bytes32 escrowId) external view returns (address[] memory) {
        return _escrows[escrowId].participants;
    }
}
