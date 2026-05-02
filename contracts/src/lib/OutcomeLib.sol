// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OutcomeLib
/// @notice Outcome validation and distribution BPS helpers
library OutcomeLib {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint8 internal constant REFUND_OUTCOME = 0xFF; // Sentinel for fail-closed refund

    struct OutcomeDistribution {
        address recipient;
        uint16 bps; // Basis points of total amount
    }

    /// @notice Validate that distributions sum to exactly BPS_DENOMINATOR
    function validateDistributions(OutcomeDistribution[] calldata distributions)
        internal
        pure
        returns (bool)
    {
        uint256 total;
        for (uint256 i; i < distributions.length; ++i) {
            total += distributions[i].bps;
        }
        return total == BPS_DENOMINATOR;
    }

    /// @notice Compute an individual share given total amount and BPS
    function computeShare(uint256 totalAmount, uint16 bps) internal pure returns (uint256) {
        return (totalAmount * bps) / BPS_DENOMINATOR;
    }

    /// @notice True if outcome is the fail-closed refund sentinel
    function isRefundOutcome(uint8 outcomeIndex) internal pure returns (bool) {
        return outcomeIndex == REFUND_OUTCOME;
    }
}
