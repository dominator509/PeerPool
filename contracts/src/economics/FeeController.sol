// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeController
/// @notice Protocol fee accounting and routing.
///         Fees are deducted at settlement time and routed to the fee recipient.
///         Bond slashing fees are also routed through this contract.
contract FeeController {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MAX_FEE_BPS = 500; // 5% maximum protocol fee

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    address public feeRecipient;
    uint256 public protocolFeeBps; // Default fee in BPS
    address public owner;

    mapping(address => uint256) public accruedFees; // token => amount

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FeeCollected(bytes32 indexed escrowId, address token, uint256 amount);
    event FeeWithdrawn(address indexed recipient, address token, uint256 amount);
    event ProtocolFeeUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _feeRecipient, uint256 _protocolFeeBps, address _owner) {
        require(_feeRecipient != address(0), "FeeController: zero recipient");
        require(_owner != address(0), "FeeController: zero owner");
        require(_protocolFeeBps <= MAX_FEE_BPS, "FeeController: fee too high");
        feeRecipient = _feeRecipient;
        protocolFeeBps = _protocolFeeBps;
        owner = _owner;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "FeeController: not owner");
        _;
    }

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @notice Compute and collect the protocol fee from a settlement amount
    /// @return netAmount The amount after fee deduction
    /// @return feeAmount The collected fee amount
    function collectFee(
        bytes32 escrowId,
        address token,
        uint256 grossAmount
    ) external returns (uint256 netAmount, uint256 feeAmount) {
        feeAmount = (grossAmount * protocolFeeBps) / 10_000;
        netAmount = grossAmount - feeAmount;

        if (feeAmount > 0) {
            accruedFees[token] += feeAmount;
            emit FeeCollected(escrowId, token, feeAmount);
        }
    }

    /// @notice Withdraw accrued fees to the fee recipient
    function withdrawFees(address token, uint256 amount) external {
        require(msg.sender == feeRecipient || msg.sender == owner, "FeeController: not authorized");
        uint256 available = accruedFees[token];
        require(amount <= available, "FeeController: insufficient fees");

        accruedFees[token] -= amount;

        if (token == address(0)) {
            (bool ok,) = feeRecipient.call{value: amount}("");
            require(ok, "FeeController: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(feeRecipient, amount);
        }

        emit FeeWithdrawn(feeRecipient, token, amount);
    }

    /// @notice Update the protocol fee (bounded by MAX_FEE_BPS)
    function setProtocolFee(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_FEE_BPS, "FeeController: fee too high");
        emit ProtocolFeeUpdated(protocolFeeBps, newBps);
        protocolFeeBps = newBps;
    }

    /// @notice Update the fee recipient
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "FeeController: zero recipient");
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    receive() external payable {
        accruedFees[address(0)] += msg.value;
    }
}
