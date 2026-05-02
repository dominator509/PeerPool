// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IArbitrationProvider
/// @notice Interface for external arbitration adapters (e.g. Kleros v1)
/// @dev Implement this interface to plug in any arbitration provider
interface IArbitrationProvider {
    struct ArbitrationRequest {
        bytes32 disputeId;      // Internal PeerPool dispute ID
        bytes evidence;         // Encoded evidence package
        uint256 arbitrationFee; // Fee required by arbitrator
        uint256 timeout;        // Seconds before timeout
    }

    event ArbitrationRequested(bytes32 indexed disputeId, bytes32 indexed externalRef, uint256 fee);
    event ArbitrationRuled(bytes32 indexed disputeId, uint8 outcomeIndex);
    event ArbitrationTimedOut(bytes32 indexed disputeId);

    /// @notice Get current arbitration fee
    function getArbitrationFee() external view returns (uint256);

    /// @notice Submit a dispute for external arbitration
    function requestArbitration(ArbitrationRequest calldata request) external payable returns (bytes32 externalRef);

    /// @notice Check if arbitration result is available
    function hasResult(bytes32 externalRef) external view returns (bool);

    /// @notice Get the arbitration outcome
    function getResult(bytes32 externalRef) external view returns (uint8 outcomeIndex);

    /// @notice Provider-specific identifier
    function providerName() external view returns (string memory);
}
