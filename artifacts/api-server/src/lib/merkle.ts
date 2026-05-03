import { MerkleTree } from "merkletreejs";
import { createHash } from "crypto";
import { encodeAbiParameters, parseAbiParameters, keccak256, toHex, hexToBytes } from "viem";

export interface ClaimLeaf {
  claimantAddress: string;
  amount: string;
  escrowId: string;
}

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function keccak256Buffer(data: Buffer): Buffer {
  const hex = keccak256(toHex(data));
  return Buffer.from(hexToBytes(hex));
}

export function buildLeaf(leaf: ClaimLeaf): Buffer {
  const encoded = encodeAbiParameters(
    parseAbiParameters("address claimant, uint256 amount, bytes32 escrowId"),
    [
      leaf.claimantAddress as `0x${string}`,
      BigInt(leaf.amount),
      keccak256(`0x${Buffer.from(leaf.escrowId).toString("hex")}` as `0x${string}`),
    ]
  );
  const hex = keccak256(encoded);
  return Buffer.from(hexToBytes(hex));
}

export interface SettlementTree {
  root: string;
  leaves: Array<{
    claimantAddress: string;
    amount: string;
    leaf: string;
    proof: string[];
  }>;
}

export function buildSettlementTree(claims: ClaimLeaf[]): SettlementTree {
  if (claims.length === 0) {
    throw new Error("Cannot build Merkle tree from empty claims list");
  }

  const leafBuffers = claims.map(buildLeaf);

  const tree = new MerkleTree(leafBuffers, keccak256Buffer, {
    sortPairs: true,
    hashLeaves: false,
  });

  const root = `0x${tree.getRoot().toString("hex")}`;

  const leaves = claims.map((claim, i) => {
    const proof = tree
      .getProof(leafBuffers[i])
      .map((p) => `0x${p.data.toString("hex")}`);

    return {
      claimantAddress: claim.claimantAddress,
      amount: claim.amount,
      leaf: `0x${leafBuffers[i].toString("hex")}`,
      proof,
    };
  });

  return { root, leaves };
}

export function verifyProof(
  root: string,
  claimant: string,
  amount: string,
  escrowId: string,
  proof: string[],
): boolean {
  const leafBuf = buildLeaf({ claimantAddress: claimant, amount, escrowId });
  const proofBufs = proof.map((p) =>
    Buffer.from(p.replace("0x", ""), "hex")
  );
  const rootBuf = Buffer.from(root.replace("0x", ""), "hex");

  const tree = new MerkleTree([], keccak256Buffer, {
    sortPairs: true,
    hashLeaves: false,
  });

  return tree.verify(proofBufs, leafBuf, rootBuf);
}
