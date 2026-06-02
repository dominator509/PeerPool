# Phase 5: Web3/Blockchain Vulnerability Testing

## Methodology
Analyzed Smart Contracts for Web3 specific vulnerabilities such as Reentrancy, Front-Running, and MEV.

## Findings
- **Reentrancy**: Must utilize the Checks-Effects-Interactions pattern or `ReentrancyGuard` in `PeerPoolEscrow` and `FundingPool` when transferring ERC-20 tokens or Native assets.
- **Front-Running/MEV**: Escrow creation and settlement generation may be subject to front-running. Using Merkle trees for settlement (as mentioned in the README) helps mitigate arbitrary state manipulation, as the root must be verified.
- **Oracle Manipulation**: If dispute resolutions rely on external oracles (e.g., Kleros), the integration must be secured against delays or manipulated data.
