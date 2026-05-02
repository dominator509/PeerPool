# PeerPool Smart Contracts

Privacy-conscious decentralized multi-party escrow and dispute-resolution protocol on EVM chains.

## Architecture

```
contracts/
├── src/
│   ├── core/
│   │   ├── PeerPoolEscrow.sol         # Main escrow contract — holds funds on-chain
│   │   ├── ManifestRegistry.sol       # Registry of outcome manifests (IPFS-referenced)
│   │   └── FundingPool.sol            # Multi-party funding accumulation
│   ├── voting/
│   │   └── VoteModule.sol             # Participant outcome voting with weight
│   ├── dispute/
│   │   ├── DisputeController.sol      # Dispute lifecycle manager (fail-closed)
│   │   └── KlerosAdapterV1.sol        # Kleros arbitration provider adapter (v1)
│   ├── settlement/
│   │   ├── SettlementEngine.sol       # Outcome execution and fund distribution
│   │   ├── MerkleClaimDistributor.sol # Large-scale Merkle tree claim distribution
│   │   └── ClaimVerifier.sol          # Merkle proof verification for claims
│   ├── attestation/
│   │   └── AttestationVerifier.sol    # EIP-712 typed attestation verification
│   ├── economics/
│   │   ├── FeeController.sol          # Protocol fee accounting and routing
│   │   └── BondManager.sol            # Challenge bond lifecycle
│   ├── lib/
│   │   ├── ManifestLib.sol            # Manifest hash and validation helpers
│   │   ├── OutcomeLib.sol             # Outcome validation and distribution BPS
│   │   └── AddressLib.sol             # Address validation utilities
│   └── interfaces/
│       ├── IEscrow.sol
│       ├── IManifestRegistry.sol
│       ├── IDisputeController.sol
│       ├── IArbitrationProvider.sol
│       ├── ISettlementEngine.sol
│       └── IAttestationVerifier.sol
├── test/
│   ├── unit/
│   │   ├── PeerPoolEscrow.t.sol
│   │   ├── ManifestRegistry.t.sol
│   │   ├── VoteModule.t.sol
│   │   ├── DisputeController.t.sol
│   │   ├── MerkleClaimDistributor.t.sol
│   │   └── AttestationVerifier.t.sol
│   ├── integration/
│   │   └── EscrowLifecycle.t.sol
│   └── mocks/
│       ├── MockERC20.sol
│       ├── MockKleros.sol
│       └── MockAttestationVerifier.sol
├── script/
│   ├── Deploy.s.sol                   # Full protocol deployment
│   ├── DeployTestnet.s.sol            # Testnet deployment with mock tokens
│   └── Seed.s.sol                     # Seed test data on local/testnet
└── foundry.toml
```

## Key Design Principles

- **On-chain custody**: Smart contracts hold all funds — no custodial bridge or proxy
- **AI non-custodial**: AI only prepares bounded verdict proposals; never moves funds
- **Fail-closed**: Unresolved disputes default to refund, never to protocol seizure
- **Manifest-driven**: Outcomes are predefined in verifiable manifests registered on-chain
- **Kleros adapter**: v1 external appeal layer through a replaceable provider adapter
- **Settlement roots**: Large distributions use Merkle settlement roots + claim proofs
- **Modular**: Arbitration provider, fee controller, and claim distributor are replaceable

## Quick Start

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install dependencies
forge install

# Compile
forge build

# Run tests
forge test -vvv

# Run with gas report
forge test --gas-report

# Deploy to local anvil
anvil &
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

## Environment Variables

```bash
# Required for deployment
PRIVATE_KEY=0x...          # Deployer private key
RPC_URL=https://...        # RPC endpoint
ETHERSCAN_API_KEY=...      # For contract verification

# Optional
KLEROS_ARBITRATOR=0x...    # Kleros Court contract address
FEE_RECIPIENT=0x...        # Protocol fee recipient
PROTOCOL_FEE_BPS=50        # 0.5% protocol fee in basis points
```

## Contract Addresses

### Sepolia Testnet

| Contract | Address |
|----------|---------|
| ManifestRegistry | TBD |
| PeerPoolEscrow | TBD |
| DisputeController | TBD |
| KlerosAdapterV1 | TBD |
| SettlementEngine | TBD |
| MerkleClaimDistributor | TBD |

## Security

- All contracts are fail-closed: disputed escrows default to proportional refund
- Bond slashing is bounded: max slash = bond amount, never exceeds deposited funds
- Kleros adapter is audited separately; protocol remains functional if Kleros is unavailable
- AI verdicts are capped proposals only — they require on-chain ratification via voting
