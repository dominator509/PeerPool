// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IArbitrationProvider} from "../interfaces/IArbitrationProvider.sol";

/// @title KlerosAdapterV1
/// @notice Adapter that connects PeerPool DisputeController to Kleros Court v1.
///         Implements IArbitrationProvider for modular replaceability.
///
/// Integration notes:
///   - Kleros Court v1 uses IArbitrator interface (arbitrate, appeal, rule)
///   - Each dispute requires an arbitration fee in ETH
///   - Rulings are delivered via the IArbitrable.rule() callback
///   - This adapter translates Kleros rulings to PeerPool outcome indices
///   - Outcome 0 in Kleros = "refused to arbitrate" → PeerPool fail-close
///   - Outcome N+1 in Kleros maps to PeerPool outcome N (1-indexed externally)
interface IKlerosArbitrator {
    function arbitrationCost(bytes calldata extraData) external view returns (uint256);
    function createDispute(uint256 choices, bytes calldata extraData) external payable returns (uint256 disputeId);
    function currentRuling(uint256 disputeId) external view returns (uint256 ruling);
}

contract KlerosAdapterV1 is IArbitrationProvider {
    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    IKlerosArbitrator public immutable klerosArbitrator;
    address public immutable disputeController;
    bytes public extraData; // Kleros court + min jurors config

    struct ExternalDispute {
        bytes32 internalDisputeId;
        uint256 klerosId;
        uint8 outcomeCount;
        bool ruled;
        uint8 ruling; // 0 = not yet ruled
    }

    mapping(bytes32 => ExternalDispute) private _disputes;     // externalRef => ExternalDispute
    mapping(uint256 => bytes32) private _klerosToRef;          // klerosId => externalRef

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    // (Inherited from IArbitrationProvider)

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _klerosArbitrator, address _disputeController, bytes memory _extraData) {
        require(_klerosArbitrator != address(0), "KlerosAdapter: zero arbitrator");
        require(_disputeController != address(0), "KlerosAdapter: zero controller");
        klerosArbitrator = IKlerosArbitrator(_klerosArbitrator);
        disputeController = _disputeController;
        extraData = _extraData;
    }

    // -------------------------------------------------------------------------
    // IArbitrationProvider
    // -------------------------------------------------------------------------

    /// @inheritdoc IArbitrationProvider
    function getArbitrationFee() external view override returns (uint256) {
        return klerosArbitrator.arbitrationCost(extraData);
    }

    /// @inheritdoc IArbitrationProvider
    function requestArbitration(ArbitrationRequest calldata request)
        external
        payable
        override
        returns (bytes32 externalRef)
    {
        require(msg.sender == disputeController, "KlerosAdapter: not controller");
        uint256 fee = klerosArbitrator.arbitrationCost(extraData);
        require(msg.value >= fee, "KlerosAdapter: insufficient fee");

        // Kleros outcomes are 1-indexed; 0 = refused. Map outcomeCount choices.
        uint256 klerosId = klerosArbitrator.createDispute{value: fee}(
            request.timeout, // using timeout as choices count — override in production
            extraData
        );

        externalRef = keccak256(abi.encodePacked(address(this), klerosId));
        _disputes[externalRef] = ExternalDispute({
            internalDisputeId: request.disputeId,
            klerosId: klerosId,
            outcomeCount: 2, // default; override based on manifest
            ruled: false,
            ruling: 0
        });
        _klerosToRef[klerosId] = externalRef;

        emit ArbitrationRequested(request.disputeId, externalRef, fee);

        // Refund overpay
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "KlerosAdapter: refund failed");
        }
    }

    /// @notice Called by Kleros Court when ruling is delivered (IArbitrable.rule)
    function rule(uint256 klerosDisputeId, uint256 ruling) external {
        require(msg.sender == address(klerosArbitrator), "KlerosAdapter: not arbitrator");
        bytes32 externalRef = _klerosToRef[klerosDisputeId];
        require(externalRef != bytes32(0), "KlerosAdapter: unknown dispute");

        ExternalDispute storage d = _disputes[externalRef];
        require(!d.ruled, "KlerosAdapter: already ruled");
        d.ruled = true;

        // Kleros ruling 0 = refused → fail close; ruling N = outcome N-1
        uint8 outcomeIndex = ruling == 0 ? type(uint8).max : uint8(ruling - 1);
        d.ruling = outcomeIndex;

        emit ArbitrationRuled(d.internalDisputeId, outcomeIndex);
    }

    /// @inheritdoc IArbitrationProvider
    function hasResult(bytes32 externalRef) external view override returns (bool) {
        return _disputes[externalRef].ruled;
    }

    /// @inheritdoc IArbitrationProvider
    function getResult(bytes32 externalRef) external view override returns (uint8 outcomeIndex) {
        require(_disputes[externalRef].ruled, "KlerosAdapter: not ruled");
        return _disputes[externalRef].ruling;
    }

    /// @inheritdoc IArbitrationProvider
    function providerName() external pure override returns (string memory) {
        return "KlerosV1";
    }
}
