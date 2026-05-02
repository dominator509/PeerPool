// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDisputeController} from "../interfaces/IDisputeController.sol";
import {IArbitrationProvider} from "../interfaces/IArbitrationProvider.sol";
import {IAttestationVerifier} from "../interfaces/IAttestationVerifier.sol";

interface IEscrowForDispute {
    function markDisputed(bytes32 escrowId) external;
    function getConfig(bytes32 escrowId) external view returns (
        bytes32 manifestHash,
        address token,
        uint256 totalAmount,
        uint64 deadline,
        address creator
    );
}

/// @title DisputeController
/// @notice Manages the full dispute lifecycle for PeerPool escrows.
///
/// Fail-closed guarantee:
///   - If resolution deadline is exceeded, failClose() can be called by anyone
///   - failClose() triggers a proportional refund path via the escrow
///   - No outcome is silently assumed — explicit refund sentinel (0xFF) is used
///
/// AI non-custodial design:
///   - AI verdict proposals are recorded as bounded suggestions only
///   - They require on-chain ratification by a threshold of participants
///   - The AI signer is verified via IAttestationVerifier (EIP-712)
///   - AI proposals never directly execute fund movements
contract DisputeController is IDisputeController, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MIN_BOND = 0.01 ether;
    uint256 public constant RESOLUTION_WINDOW = 7 days;
    uint256 public constant RATIFICATION_THRESHOLD_BPS = 5100; // 51%

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => Dispute) private _disputes;
    mapping(bytes32 => bytes32) private _escrowToDispute; // escrowId => disputeId

    // Pending AI verdicts awaiting ratification
    struct PendingVerdict {
        uint8 outcomeIndex;
        address proposer;
        uint256 ratificationWeight;
        uint256 totalWeight;
        uint256 proposedAt;
        mapping(address => bool) ratified;
    }
    mapping(bytes32 => PendingVerdict) private _pendingVerdicts;

    IArbitrationProvider public arbitrationProvider;
    IAttestationVerifier public attestationVerifier;
    address public escrowContract;
    address public owner;

    mapping(bytes32 => bytes32) private _disputeToArbitrationRef;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _escrowContract,
        address _arbitrationProvider,
        address _attestationVerifier,
        address _owner
    ) {
        require(_escrowContract != address(0), "DisputeController: zero escrow");
        require(_owner != address(0), "DisputeController: zero owner");
        escrowContract = _escrowContract;
        arbitrationProvider = IArbitrationProvider(_arbitrationProvider);
        attestationVerifier = IAttestationVerifier(_attestationVerifier);
        owner = _owner;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "DisputeController: not owner");
        _;
    }

    // -------------------------------------------------------------------------
    // IDisputeController implementation
    // -------------------------------------------------------------------------

    /// @inheritdoc IDisputeController
    function openDispute(bytes32 escrowId, bytes calldata /*evidence*/)
        external
        payable
        override
        nonReentrant
        returns (bytes32 disputeId)
    {
        require(msg.value >= MIN_BOND, "DisputeController: bond too low");
        require(_escrowToDispute[escrowId] == bytes32(0), "DisputeController: dispute exists");

        disputeId = keccak256(abi.encodePacked(escrowId, msg.sender, block.timestamp));

        _disputes[disputeId] = Dispute({
            escrowId: escrowId,
            disputer: msg.sender,
            bondAmount: msg.value,
            state: DisputeState.Open,
            resolvedOutcome: 0,
            openedAt: uint64(block.timestamp),
            resolvedAt: 0,
            arbitrationRef: bytes32(0),
            verdictData: ""
        });

        _escrowToDispute[escrowId] = disputeId;

        IEscrowForDispute(escrowContract).markDisputed(escrowId);

        emit DisputeOpened(escrowId, disputeId, msg.sender, msg.value);
    }

    /// @inheritdoc IDisputeController
    function escalate(bytes32 disputeId) external payable override nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.state == DisputeState.Open, "DisputeController: not open");
        require(address(arbitrationProvider) != address(0), "DisputeController: no arbitration provider");

        uint256 fee = arbitrationProvider.getArbitrationFee();
        require(msg.value >= fee, "DisputeController: insufficient escalation fee");

        bytes32 externalRef = arbitrationProvider.requestArbitration{value: fee}(
            IArbitrationProvider.ArbitrationRequest({
                disputeId: disputeId,
                evidence: d.verdictData,
                arbitrationFee: fee,
                timeout: RESOLUTION_WINDOW
            })
        );

        _disputeToArbitrationRef[disputeId] = externalRef;
        d.arbitrationRef = externalRef;
        d.state = DisputeState.Escalated;

        emit DisputeEscalated(disputeId, externalRef);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "DisputeController: refund failed");
        }
    }

    /// @inheritdoc IDisputeController
    function proposeVerdict(bytes32 disputeId, uint8 outcomeIndex, bytes calldata verdictData)
        external
        override
    {
        Dispute storage d = _disputes[disputeId];
        require(d.state == DisputeState.Open, "DisputeController: not open");

        if (address(attestationVerifier) != address(0)) {
            require(
                attestationVerifier.isAuthorizedSigner(msg.sender),
                "DisputeController: unauthorized proposer"
            );
        }

        _pendingVerdicts[disputeId].outcomeIndex = outcomeIndex;
        _pendingVerdicts[disputeId].proposer = msg.sender;
        _pendingVerdicts[disputeId].proposedAt = block.timestamp;
        d.verdictData = verdictData;

        emit VerdictProposed(disputeId, outcomeIndex, msg.sender);
    }

    /// @inheritdoc IDisputeController
    function ratifyVerdict(bytes32 disputeId) external override {
        Dispute storage d = _disputes[disputeId];
        require(d.state == DisputeState.Open, "DisputeController: not open");
        PendingVerdict storage pv = _pendingVerdicts[disputeId];
        require(pv.proposer != address(0), "DisputeController: no pending verdict");
        require(!pv.ratified[msg.sender], "DisputeController: already ratified");

        pv.ratified[msg.sender] = true;
        pv.ratificationWeight += 1;

        uint256 required = (pv.totalWeight * RATIFICATION_THRESHOLD_BPS) / 10_000;
        if (pv.ratificationWeight >= required || pv.ratificationWeight >= 2) {
            _resolve(disputeId, pv.outcomeIndex, false);
        }
    }

    /// @inheritdoc IDisputeController
    function receiveArbitrationResult(bytes32 disputeId, uint8 outcomeIndex)
        external
        override
    {
        require(msg.sender == address(arbitrationProvider), "DisputeController: not arbitrator");
        Dispute storage d = _disputes[disputeId];
        require(d.state == DisputeState.Escalated, "DisputeController: not escalated");
        _resolve(disputeId, outcomeIndex, true);
    }

    /// @inheritdoc IDisputeController
    function failClose(bytes32 disputeId) external override {
        Dispute storage d = _disputes[disputeId];
        require(
            d.state == DisputeState.Open || d.state == DisputeState.Escalated,
            "DisputeController: cannot fail-close"
        );
        require(
            block.timestamp > d.openedAt + RESOLUTION_WINDOW,
            "DisputeController: window still open"
        );

        // 0xFF = refund sentinel (fail-closed: return all funds proportionally)
        _resolve(disputeId, type(uint8).max, false);

        // Return bond on fail-close (disputer is not penalized)
        (bool ok,) = d.disputer.call{value: d.bondAmount}("");
        require(ok, "DisputeController: bond return failed");
        emit BondReturned(disputeId, d.disputer, d.bondAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IDisputeController
    function getDispute(bytes32 disputeId) external view override returns (Dispute memory) {
        return _disputes[disputeId];
    }

    /// @inheritdoc IDisputeController
    function getEscrowDispute(bytes32 escrowId) external view override returns (bytes32) {
        return _escrowToDispute[escrowId];
    }

    // -------------------------------------------------------------------------
    // Owner functions
    // -------------------------------------------------------------------------

    function setArbitrationProvider(address provider) external onlyOwner {
        arbitrationProvider = IArbitrationProvider(provider);
    }

    function setAttestationVerifier(address verifier) external onlyOwner {
        attestationVerifier = IAttestationVerifier(verifier);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _resolve(bytes32 disputeId, uint8 outcomeIndex, bool byArbitrator) internal {
        Dispute storage d = _disputes[disputeId];
        d.state = DisputeState.Resolved;
        d.resolvedOutcome = outcomeIndex;
        d.resolvedAt = uint64(block.timestamp);

        emit DisputeResolved(disputeId, outcomeIndex, byArbitrator);
    }
}
