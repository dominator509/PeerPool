// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementEngine} from "../interfaces/ISettlementEngine.sol";
import {IManifestRegistry} from "../interfaces/IManifestRegistry.sol";
import {OutcomeLib} from "../lib/OutcomeLib.sol";

interface IEscrowForSettlement {
    function executeDistribution(
        bytes32 escrowId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external;

    function getConfig(bytes32 escrowId) external view returns (
        bytes32 manifestHash,
        address token,
        uint256 totalAmount,
        uint64 deadline,
        address creator
    );

    function getParticipants(bytes32 escrowId) external view returns (address[] memory);
}

interface IMerkleDistributor {
    function setDistribution(
        bytes32 escrowId,
        bytes32 merkleRoot,
        address token,
        uint256 totalAmount
    ) external;
}

interface IFeeController {
    function collectFee(bytes32 escrowId, address token, uint256 grossAmount)
        external
        returns (uint256 netAmount, uint256 feeAmount);
}

/// @title SettlementEngine
/// @notice Executes fund distribution based on resolved dispute outcomes.
///         Supports both direct participant distribution and Merkle claim drops.
///
/// Outcome 0xFF (OutcomeLib.REFUND_OUTCOME) triggers full proportional refund.
contract SettlementEngine is ISettlementEngine {
    using OutcomeLib for uint8;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => Settlement) private _settlements;

    IEscrowForSettlement public immutable escrow;
    IManifestRegistry public immutable manifestRegistry;
    IMerkleDistributor public merkleDistributor;
    IFeeController public feeController;
    address public disputeController;
    address public owner;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _escrow,
        address _manifestRegistry,
        address _disputeController,
        address _feeController,
        address _owner
    ) {
        require(_escrow != address(0), "SettlementEngine: zero escrow");
        require(_manifestRegistry != address(0), "SettlementEngine: zero registry");
        require(_owner != address(0), "SettlementEngine: zero owner");
        escrow = IEscrowForSettlement(_escrow);
        manifestRegistry = IManifestRegistry(_manifestRegistry);
        disputeController = _disputeController;
        feeController = IFeeController(_feeController);
        owner = _owner;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAuthorized() {
        require(
            msg.sender == disputeController || msg.sender == owner,
            "SettlementEngine: not authorized"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "SettlementEngine: not owner");
        _;
    }

    // -------------------------------------------------------------------------
    // ISettlementEngine implementation
    // -------------------------------------------------------------------------

    /// @inheritdoc ISettlementEngine
    function executeSettlement(bytes32 escrowId, uint8 outcomeIndex)
        external
        override
        onlyAuthorized
    {
        require(!_settlements[escrowId].executedAt > 0 ? false : true, "SettlementEngine: already settled");

        (
            bytes32 manifestHash,
            address token,
            uint256 totalAmount,,
        ) = escrow.getConfig(escrowId);

        address[] memory participants = escrow.getParticipants(escrowId);

        uint256 netAmount = totalAmount;
        if (address(feeController) != address(0)) {
            (netAmount,) = feeController.collectFee(escrowId, token, totalAmount);
        }

        if (OutcomeLib.isRefundOutcome(outcomeIndex)) {
            // Fail-closed: proportional refund to all participants
            uint256 share = netAmount / participants.length;
            uint256[] memory amounts = new uint256[](participants.length);
            for (uint256 i; i < participants.length; ++i) {
                amounts[i] = (i == participants.length - 1)
                    ? netAmount - (share * (participants.length - 1)) // dust to last
                    : share;
            }
            escrow.executeDistribution(escrowId, participants, amounts);
        } else {
            // Direct distribution: split by manifest BPS (simplified — equal split for now)
            // In production: fetch outcome-specific BPS from manifest and distribute accordingly
            uint256 share = netAmount / participants.length;
            uint256[] memory amounts = new uint256[](participants.length);
            for (uint256 i; i < participants.length; ++i) {
                amounts[i] = (i == participants.length - 1)
                    ? netAmount - (share * (participants.length - 1))
                    : share;
            }
            escrow.executeDistribution(escrowId, participants, amounts);
        }

        _settlements[escrowId] = Settlement({
            escrowId: escrowId,
            outcomeIndex: outcomeIndex,
            settlementRoot: bytes32(0),
            useMerkle: false,
            executedAt: uint64(block.timestamp)
        });

        emit SettlementExecuted(escrowId, outcomeIndex, bytes32(0));
    }

    /// @inheritdoc ISettlementEngine
    function setMerkleRoot(bytes32 escrowId, bytes32 merkleRoot, uint256 totalAmount)
        external
        override
        onlyAuthorized
    {
        require(merkleDistributor != IMerkleDistributor(address(0)), "SettlementEngine: no distributor");

        (,address token,,,) = escrow.getConfig(escrowId);
        merkleDistributor.setDistribution(escrowId, merkleRoot, token, totalAmount);

        _settlements[escrowId].merkleRoot = merkleRoot;
        _settlements[escrowId].useMerkle = true;

        emit MerkleRootSet(escrowId, merkleRoot, totalAmount);
    }

    /// @inheritdoc ISettlementEngine
    function isSettled(bytes32 escrowId) external view override returns (bool) {
        return _settlements[escrowId].executedAt > 0 || _settlements[escrowId].useMerkle;
    }

    /// @inheritdoc ISettlementEngine
    function getSettlement(bytes32 escrowId) external view override returns (Settlement memory) {
        return _settlements[escrowId];
    }

    // -------------------------------------------------------------------------
    // Owner functions
    // -------------------------------------------------------------------------

    function setMerkleDistributor(address _distributor) external onlyOwner {
        merkleDistributor = IMerkleDistributor(_distributor);
    }
}
