// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AddressLib
/// @notice Address validation and set membership utilities
library AddressLib {
    /// @notice Revert if address is zero
    function requireNonZero(address addr) internal pure {
        require(addr != address(0), "AddressLib: zero address");
    }

    /// @notice Check if an address is in a list (O(n) — only for small sets)
    function contains(address[] storage list, address addr) internal view returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == addr) return true;
        }
        return false;
    }

    /// @notice Check if an address is in a calldata array
    function containsCalldata(address[] calldata list, address addr) internal pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == addr) return true;
        }
        return false;
    }
}
