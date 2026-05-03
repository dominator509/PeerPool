export const PEERPOOL_ESCROW_ABI = [
  {
    type: "event",
    name: "EscrowFunded",
    inputs: [
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteSubmitted",
    inputs: [
      { name: "voter", type: "address", indexed: true },
      { name: "outcomeIndex", type: "uint256", indexed: false },
      { name: "weight", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeOpened",
    inputs: [
      { name: "disputer", type: "address", indexed: true },
      { name: "bondAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "outcomeIndex", type: "uint256", indexed: false },
      { name: "merkleRoot", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ClaimExecuted",
    inputs: [
      { name: "claimant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "totalDeposited",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "merkleRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "outcomeIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const MANIFEST_REGISTRY_ABI = [
  {
    type: "event",
    name: "ManifestRegistered",
    inputs: [
      { name: "manifestId", type: "bytes32", indexed: true },
      { name: "registrant", type: "address", indexed: true },
      { name: "ipfsHash", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "getManifest",
    stateMutability: "view",
    inputs: [{ name: "manifestId", type: "bytes32" }],
    outputs: [
      { name: "ipfsHash", type: "string" },
      { name: "registrant", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export const KLEROS_ADAPTER_ABI = [
  {
    type: "function",
    name: "createDispute",
    stateMutability: "payable",
    inputs: [
      { name: "escrowId", type: "bytes32" },
      { name: "_choices", type: "uint256" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [{ name: "disputeID", type: "uint256" }],
  },
  {
    type: "function",
    name: "disputes",
    stateMutability: "view",
    inputs: [{ name: "disputeID", type: "uint256" }],
    outputs: [
      { name: "escrowId", type: "bytes32" },
      { name: "ruled", type: "bool" },
      { name: "ruling", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "DisputeCreated",
    inputs: [
      { name: "disputeID", type: "uint256", indexed: true },
      { name: "escrowId", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Ruling",
    inputs: [
      { name: "arbitrator", type: "address", indexed: true },
      { name: "disputeID", type: "uint256", indexed: true },
      { name: "ruling", type: "uint256", indexed: false },
    ],
  },
] as const;

export const MERKLE_CLAIM_DISTRIBUTOR_ABI = [
  {
    type: "function",
    name: "postSettlementRoot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "outcomeIndex", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "bytes32" },
      { name: "claimant", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "SettlementRootPosted",
    inputs: [
      { name: "escrowId", type: "bytes32", indexed: true },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "outcomeIndex", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "escrowId", type: "bytes32", indexed: true },
      { name: "claimant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
