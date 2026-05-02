// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FundingPool
/// @notice Manages multi-party deposits for an escrow.
///         Tracks individual contributions and enforces total amount targets.
///         Funds are locked until the escrow is settled or refunded.
abstract contract FundingPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct PoolState {
        address token;          // ERC-20 token or address(0) for native ETH
        uint256 targetAmount;   // Total amount required to be fully funded
        uint256 depositedAmount;// Total deposited so far
        bool locked;            // True once fully funded — no more deposits
        bool released;          // True once settlement executed
    }

    struct Contribution {
        uint256 amount;
        uint64 timestamp;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => PoolState) internal _pools;
    mapping(bytes32 => mapping(address => Contribution)) internal _contributions;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PoolCreated(bytes32 indexed poolId, address token, uint256 targetAmount);
    event Deposited(bytes32 indexed poolId, address indexed depositor, uint256 amount);
    event PoolFunded(bytes32 indexed poolId, uint256 totalAmount);
    event PoolReleased(bytes32 indexed poolId);
    event Refunded(bytes32 indexed poolId, address indexed depositor, uint256 amount);

    // -------------------------------------------------------------------------
    // Internal functions
    // -------------------------------------------------------------------------

    function _createPool(bytes32 poolId, address token, uint256 targetAmount) internal {
        require(_pools[poolId].targetAmount == 0, "FundingPool: pool exists");
        require(targetAmount > 0, "FundingPool: zero target");
        _pools[poolId] = PoolState({
            token: token,
            targetAmount: targetAmount,
            depositedAmount: 0,
            locked: false,
            released: false
        });
        emit PoolCreated(poolId, token, targetAmount);
    }

    function _deposit(bytes32 poolId, address depositor, uint256 amount) internal nonReentrant {
        PoolState storage pool = _pools[poolId];
        require(!pool.locked, "FundingPool: pool locked");
        require(!pool.released, "FundingPool: pool released");
        require(pool.targetAmount > 0, "FundingPool: pool not found");
        require(amount > 0, "FundingPool: zero amount");

        if (pool.token == address(0)) {
            require(msg.value == amount, "FundingPool: ETH amount mismatch");
        } else {
            IERC20(pool.token).safeTransferFrom(depositor, address(this), amount);
        }

        _contributions[poolId][depositor].amount += amount;
        _contributions[poolId][depositor].timestamp = uint64(block.timestamp);
        pool.depositedAmount += amount;

        emit Deposited(poolId, depositor, amount);

        if (pool.depositedAmount >= pool.targetAmount) {
            pool.locked = true;
            emit PoolFunded(poolId, pool.depositedAmount);
        }
    }

    function _release(bytes32 poolId, address recipient, uint256 amount) internal nonReentrant {
        PoolState storage pool = _pools[poolId];
        require(!pool.released, "FundingPool: already released");
        require(amount <= pool.depositedAmount, "FundingPool: insufficient funds");

        _transfer(pool.token, recipient, amount);
    }

    function _refundAll(bytes32 poolId, address[] memory depositors) internal nonReentrant {
        PoolState storage pool = _pools[poolId];
        require(!pool.released, "FundingPool: already released");
        pool.released = true;

        for (uint256 i; i < depositors.length; ++i) {
            uint256 amount = _contributions[poolId][depositors[i]].amount;
            if (amount > 0) {
                _contributions[poolId][depositors[i]].amount = 0;
                _transfer(pool.token, depositors[i], amount);
                emit Refunded(poolId, depositors[i], amount);
            }
        }

        emit PoolReleased(poolId);
    }

    function _transfer(address token, address recipient, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = recipient.call{value: amount}("");
            require(ok, "FundingPool: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function getPoolState(bytes32 poolId) external view returns (PoolState memory) {
        return _pools[poolId];
    }

    function getContribution(bytes32 poolId, address depositor) external view returns (Contribution memory) {
        return _contributions[poolId][depositor];
    }
}
