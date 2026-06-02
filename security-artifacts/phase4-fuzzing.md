# Phase 4: Fuzzing

## Methodology
In an EVM context, the most critical fuzzing targets the Smart Contracts to uncover edge cases in state manipulation.

## Findings
The contracts reside in `contracts/`. Fuzzing can be executed via Foundry.

```bash
cd contracts && forge test --fuzz-runs 1000
```
*Note: Depending on the complexity of the contracts, stateless fuzzing is executed automatically by `forge test` for properties defined with fuzz parameters.*
