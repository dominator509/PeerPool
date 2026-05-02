// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MerkleClaimDistributor
/// @notice Enables large-scale settlement distributions via Merkle tree claims.
///         The settlement engine sets a Merkle root; each claimant provides
///         a proof to withdraw their share. This avoids gas-intensive on-chain
///         iteration over large participant sets.
///
/// Leaf encoding: keccak256(abi.encodePacked(escrowId, claimant, amount))
contract MerkleClaimDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Distribution {
        bytes32 merkleRoot;
        address token;          // ERC-20 token (address(0) = native ETH)
        uint256 totalAmount;    // Total claimable amount
        uint256 claimedAmount;  // Running total of claimed amounts
        uint64 setAt;
        bool active;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(bytes32 => Distribution) private _distributions;
    mapping(bytes32 => mapping(address => bool)) private _claimed;

    address public immutable settlementEngine;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event DistributionSet(bytes32 indexed escrowId, bytes32 merkleRoot, uint256 totalAmount);
    event Claimed(bytes32 indexed escrowId, address indexed claimant, uint256 amount);
    event DistributionClosed(bytes32 indexed escrowId, uint256 unclaimedAmount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _settlementEngine) {
        require(_settlementEngine != address(0), "MerkleDist: zero engine");
        settlementEngine = _settlementEngine;
    }

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @notice Set the Merkle root for a distribution (called by SettlementEngine)
    function setDistribution(
        bytes32 escrowId,
        bytes32 merkleRoot,
        address token,
        uint256 totalAmount
    ) external {
        require(msg.sender == settlementEngine, "MerkleDist: not engine");
        require(merkleRoot != bytes32(0), "MerkleDist: zero root");
        require(!_distributions[escrowId].active, "MerkleDist: already set");

        _distributions[escrowId] = Distribution({
            merkleRoot: merkleRoot,
            token: token,
            totalAmount: totalAmount,
            claimedAmount: 0,
            setAt: uint64(block.timestamp),
            active: true
        });

        emit DistributionSet(escrowId, merkleRoot, totalAmount);
    }

    /// @notice Claim settlement funds with a Merkle proof
    /// @param escrowId The escrow to claim from
    /// @param amount The claimant's allocated amount
    /// @param proof Merkle proof of inclusion
    function claim(
        bytes32 escrowId,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant {
        Distribution storage dist = _distributions[escrowId];
        require(dist.active, "MerkleDist: not active");
        require(!_claimed[escrowId][msg.sender], "MerkleDist: already claimed");
        require(amount > 0, "MerkleDist: zero amount");

        bytes32 leaf = keccak256(abi.encodePacked(escrowId, msg.sender, amount));
        require(
            MerkleProof.verify(proof, dist.merkleRoot, leaf),
            "MerkleDist: invalid proof"
        );

        _claimed[escrowId][msg.sender] = true;
        dist.claimedAmount += amount;

        if (dist.token == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "MerkleDist: ETH transfer failed");
        } else {
            IERC20(dist.token).safeTransfer(msg.sender, amount);
        }

        emit Claimed(escrowId, msg.sender, amount);
    }

    /// @notice Check if an address has claimed
    function hasClaimed(bytes32 escrowId, address claimant) external view returns (bool) {
        return _claimed[escrowId][claimant];
    }

    /// @notice Get distribution details
    function getDistribution(bytes32 escrowId) external view returns (Distribution memory) {
        return _distributions[escrowId];
    }

    /// @notice Verify a proof without claiming (preview)
    function verifyProof(
        bytes32 escrowId,
        address claimant,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(escrowId, claimant, amount));
        return MerkleProof.verify(proof, _distributions[escrowId].merkleRoot, leaf);
    }

    receive() external payable {}
}
