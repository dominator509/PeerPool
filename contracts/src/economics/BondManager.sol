// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BondManager
/// @notice Manages challenge bond lifecycle for disputes.
///         Bonds are held in escrow by this contract and either:
///           - Returned to the disputer on fail-close or valid dispute
///           - Partially slashed to the fee controller on invalid disputes
///           - Used to pay Kleros escalation fee on escalation
contract BondManager is ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    enum BondState { Held, Released, Slashed }

    struct Bond {
        address disputer;
        uint256 amount;
        BondState state;
        uint64 lockedAt;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => Bond) private _bonds; // disputeId => Bond

    address public disputeController;
    address public feeController;
    uint256 public slashBps; // BPS slashed on invalid dispute

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BondLocked(bytes32 indexed disputeId, address disputer, uint256 amount);
    event BondReleased(bytes32 indexed disputeId, address disputer, uint256 amount);
    event BondSlashed(bytes32 indexed disputeId, address disputer, uint256 slashedAmount, uint256 returnedAmount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _disputeController, address _feeController, uint256 _slashBps) {
        require(_disputeController != address(0), "BondManager: zero controller");
        require(_slashBps <= 10_000, "BondManager: slash overflow");
        disputeController = _disputeController;
        feeController = _feeController;
        slashBps = _slashBps;
    }

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @notice Lock a bond for a dispute (called by DisputeController)
    function lockBond(bytes32 disputeId, address disputer) external payable {
        require(msg.sender == disputeController, "BondManager: not controller");
        require(msg.value > 0, "BondManager: zero bond");
        require(_bonds[disputeId].disputer == address(0), "BondManager: already locked");

        _bonds[disputeId] = Bond({
            disputer: disputer,
            amount: msg.value,
            state: BondState.Held,
            lockedAt: uint64(block.timestamp)
        });

        emit BondLocked(disputeId, disputer, msg.value);
    }

    /// @notice Release the full bond back to the disputer
    function releaseBond(bytes32 disputeId) external nonReentrant {
        require(msg.sender == disputeController, "BondManager: not controller");
        Bond storage bond = _bonds[disputeId];
        require(bond.state == BondState.Held, "BondManager: not held");

        bond.state = BondState.Released;
        (bool ok,) = bond.disputer.call{value: bond.amount}("");
        require(ok, "BondManager: ETH transfer failed");

        emit BondReleased(disputeId, bond.disputer, bond.amount);
    }

    /// @notice Slash the bond and return remainder to disputer
    function slashBond(bytes32 disputeId) external nonReentrant {
        require(msg.sender == disputeController, "BondManager: not controller");
        Bond storage bond = _bonds[disputeId];
        require(bond.state == BondState.Held, "BondManager: not held");

        bond.state = BondState.Slashed;
        uint256 slashAmount = (bond.amount * slashBps) / 10_000;
        uint256 returnAmount = bond.amount - slashAmount;

        if (slashAmount > 0 && feeController != address(0)) {
            (bool feeOk,) = feeController.call{value: slashAmount}("");
            require(feeOk, "BondManager: fee transfer failed");
        }

        if (returnAmount > 0) {
            (bool ok,) = bond.disputer.call{value: returnAmount}("");
            require(ok, "BondManager: return transfer failed");
        }

        emit BondSlashed(disputeId, bond.disputer, slashAmount, returnAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function getBond(bytes32 disputeId) external view returns (Bond memory) {
        return _bonds[disputeId];
    }

    receive() external payable {}
}
