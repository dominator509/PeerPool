// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ManifestRegistry} from "../src/core/ManifestRegistry.sol";
import {PeerPoolEscrow} from "../src/core/PeerPoolEscrow.sol";
import {DisputeController} from "../src/dispute/DisputeController.sol";
import {SettlementEngine} from "../src/settlement/SettlementEngine.sol";
import {MerkleClaimDistributor} from "../src/settlement/MerkleClaimDistributor.sol";
import {AttestationVerifier} from "../src/attestation/AttestationVerifier.sol";
import {FeeController} from "../src/economics/FeeController.sol";
import {BondManager} from "../src/economics/BondManager.sol";

/// @title Deploy
/// @notice Full PeerPool protocol deployment script
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
///
/// Environment variables (required):
///   PRIVATE_KEY      — Deployer private key
///   RPC_URL          — Chain RPC endpoint
///   FEE_RECIPIENT    — Address to receive protocol fees (default: deployer)
///   KLEROS_ARBITRATOR — Kleros Court address (optional, can be address(0))
///
/// Environment variables (optional):
///   PROTOCOL_FEE_BPS — Protocol fee in BPS (default: 50 = 0.5%)
///   BOND_SLASH_BPS   — Bond slash fraction in BPS on invalid dispute (default: 2000 = 20%)
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 protocolFeeBps = vm.envOr("PROTOCOL_FEE_BPS", uint256(50));
        uint256 bondSlashBps = vm.envOr("BOND_SLASH_BPS", uint256(2000));
        address klerosArbitrator = vm.envOr("KLEROS_ARBITRATOR", address(0));

        console.log("Deploying PeerPool protocol...");
        console.log("  Deployer:", deployer);
        console.log("  Fee recipient:", feeRecipient);
        console.log("  Protocol fee BPS:", protocolFeeBps);
        console.log("  Bond slash BPS:", bondSlashBps);

        vm.startBroadcast(deployerKey);

        // 1. ManifestRegistry
        ManifestRegistry manifestRegistry = new ManifestRegistry(deployer);
        console.log("ManifestRegistry:", address(manifestRegistry));

        // 2. AttestationVerifier
        AttestationVerifier attestationVerifier = new AttestationVerifier(deployer);
        console.log("AttestationVerifier:", address(attestationVerifier));

        // 3. FeeController
        FeeController feeController = new FeeController(feeRecipient, protocolFeeBps, deployer);
        console.log("FeeController:", address(feeController));

        // 4. DisputeController (needs escrow address — use CREATE2 or two-step in prod)
        //    For now: deploy with placeholder, update after escrow deployment
        address escrowPlaceholder = deployer; // will be updated

        DisputeController disputeController = new DisputeController(
            escrowPlaceholder,
            klerosArbitrator == address(0) ? address(0) : klerosArbitrator,
            address(attestationVerifier),
            deployer
        );
        console.log("DisputeController:", address(disputeController));

        // 5. SettlementEngine (needs escrow address)
        SettlementEngine settlementEngine = new SettlementEngine(
            escrowPlaceholder,
            address(manifestRegistry),
            address(disputeController),
            address(feeController),
            deployer
        );
        console.log("SettlementEngine:", address(settlementEngine));

        // 6. PeerPoolEscrow — now we have all addresses
        PeerPoolEscrow escrow = new PeerPoolEscrow(
            address(manifestRegistry),
            address(disputeController),
            address(settlementEngine)
        );
        console.log("PeerPoolEscrow:", address(escrow));

        // 7. MerkleClaimDistributor
        MerkleClaimDistributor merkleDistributor = new MerkleClaimDistributor(
            address(settlementEngine)
        );
        console.log("MerkleClaimDistributor:", address(merkleDistributor));

        // 8. BondManager
        BondManager bondManager = new BondManager(
            address(disputeController),
            address(feeController),
            bondSlashBps
        );
        console.log("BondManager:", address(bondManager));

        // 9. Wire up MerkleDistributor in SettlementEngine
        settlementEngine.setMerkleDistributor(address(merkleDistributor));

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("IMPORTANT: Update DisputeController.escrowContract and");
        console.log("SettlementEngine.escrow to:", address(escrow));
        console.log("(requires admin setter functions or redeployment via factory)");
        console.log("\nContract addresses for .env:");
        console.log("MANIFEST_REGISTRY=", address(manifestRegistry));
        console.log("ESCROW_CONTRACT=", address(escrow));
        console.log("DISPUTE_CONTROLLER=", address(disputeController));
        console.log("SETTLEMENT_ENGINE=", address(settlementEngine));
        console.log("MERKLE_DISTRIBUTOR=", address(merkleDistributor));
        console.log("ATTESTATION_VERIFIER=", address(attestationVerifier));
        console.log("FEE_CONTROLLER=", address(feeController));
        console.log("BOND_MANAGER=", address(bondManager));
    }
}
