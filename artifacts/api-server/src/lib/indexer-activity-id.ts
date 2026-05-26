import { createHash } from "crypto";

export interface IndexerLogLike {
  transactionHash?: string;
  logIndex?: number | bigint;
  blockHash?: string;
  blockNumber?: bigint;
  eventName?: string;
}

export function buildIndexerActivityId(params: {
  chain: string;
  contractAddress: string;
  escrowId: string;
  log: IndexerLogLike;
}): string {
  const { chain, contractAddress, escrowId, log } = params;
  const txHash = log.transactionHash ?? "";
  const logIndex =
    typeof log.logIndex === "bigint"
      ? log.logIndex.toString()
      : log.logIndex !== undefined
        ? String(log.logIndex)
        : "";
  const blockHash = log.blockHash ?? "";
  const blockNumber =
    typeof log.blockNumber === "bigint" ? log.blockNumber.toString() : "";
  const eventName = log.eventName ?? "Unknown";

  if (txHash && logIndex) {
    return `idx:${chain}:${txHash}:${logIndex}`;
  }

  const fallback = `${chain}|${contractAddress}|${escrowId}|${eventName}|${blockHash}|${blockNumber}|${logIndex}`;
  const hash = createHash("sha256").update(fallback).digest("hex");
  return `idx:${hash}`;
}
