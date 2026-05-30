# Phase 5: Web3 Advanced (Formal Verification)

## Methodology
Analyzed the repository for Formal Verification and Invariant Testing setups.

## Findings
Advanced analysis requires specialized tools (like Certora or Halmos) or extensive stateful invariant tests via Foundry. Given the current `contracts` workspace, stateful fuzzing (invariant testing) can be defined in Foundry `invariant_*.sol` tests to prove assertions like "Total funds in pool must equal total outstanding claims."

```bash
cd contracts && forge test --match-contract Invariant
```
