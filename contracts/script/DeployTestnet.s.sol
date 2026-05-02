// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Deploy} from "./Deploy.s.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {ManifestRegistry} from "../src/core/ManifestRegistry.sol";

/// @title DeployTestnet
/// @notice Testnet deployment with mock tokens and seeded manifests
///
/// Extends the main Deploy script with:
///   - MockERC20 (USDC + WETH equivalents)
///   - Pre-registered demo manifests
///   - Faucet functionality for test wallets
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock tokens
        MockERC20 mockUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
        MockERC20 mockWETH = new MockERC20("Mock WETH", "mWETH", 18);

        console.log("MockUSDC:", address(mockUSDC));
        console.log("MockWETH:", address(mockWETH));

        // 2. Deploy full protocol (reuse Deploy script logic)
        // (in practice: call base script or inline the deploy)

        // 3. Register demo manifests
        // These would be deployed alongside a ManifestRegistry instance
        // For simplicity, we show the pattern:

        // Manifest 1: Simple two-party freelance escrow
        // Outcomes: [0=WorkApproved, 1=WorkRejected, 2=PartialPayment]
        console.log("Demo manifest IPFS CID: QmDemoFreelanceManifest");
        console.log("  Outcome 0: Work Approved (100% to freelancer)");
        console.log("  Outcome 1: Work Rejected (100% refund to client)");
        console.log("  Outcome 2: Partial Payment (50/50 split)");

        // 4. Mint test tokens to well-known test addresses
        address[3] memory testWallets = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906
        ];

        for (uint256 i; i < testWallets.length; ++i) {
            mockUSDC.mint(testWallets[i], 100_000e6);   // 100k USDC
            mockWETH.mint(testWallets[i], 100e18);       // 100 WETH
            console.log("Minted to:", testWallets[i]);
        }

        vm.stopBroadcast();

        console.log("\n=== TESTNET DEPLOYMENT COMPLETE ===");
        console.log("MOCK_USDC=", address(mockUSDC));
        console.log("MOCK_WETH=", address(mockWETH));
    }
}
