import { getChainClient, SUPPORTED_CHAINS } from "./chain.js";
import { db } from "@workspace/db";
import { escrowsTable, activityTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { PEERPOOL_ESCROW_ABI } from "./abis.js";
import { logger } from "./logger.js";
import { buildIndexerActivityId } from "./indexer-activity-id.js";

export interface ContractAddress {
  chain: string;
  address: `0x${string}`;
  escrowId: string;
}

interface IndexerStatus {
  running: boolean;
  lastRun: Date | null;
  lastError: string | null;
  syncedContracts: number;
  eventsProcessed: number;
}

const status: IndexerStatus = {
  running: false,
  lastRun: null,
  lastError: null,
  syncedContracts: 0,
  eventsProcessed: 0,
};

export function getIndexerStatus(): IndexerStatus {
  return { ...status };
}

async function indexEscrowContract(
  chain: string,
  contractAddress: `0x${string}`,
  escrowId: string,
  fromBlock: bigint,
): Promise<number> {
  const client = getChainClient(chain);
  if (!client) {
    logger.warn({ chain }, "No client available for chain");
    return 0;
  }

  let processed = 0;

  try {
    const logs = await client.getLogs({
      address: contractAddress,
      events: PEERPOOL_ESCROW_ABI.filter((x): x is (typeof PEERPOOL_ESCROW_ABI[number] & { type: "event" }) => x.type === "event"),
      fromBlock,
      toBlock: "latest",
    });

    for (const log of logs) {
      const eventName = (log as { eventName?: string }).eventName ?? "Unknown";
      const args = (log as { args?: Record<string, unknown> }).args ?? {};
      const activityId = buildIndexerActivityId({
        chain,
        contractAddress,
        escrowId,
        log,
      });

      logger.info({ chain, contractAddress, escrowId, eventName }, "Indexer: event detected");

      let activityType: string | null = null;
      let actorAddress = "0x0000000000000000000000000000000000000000";
      let data: Record<string, unknown> = {};
      let nextEscrowState: "funded" | "disputed" | "settled" | null = null;
      let nextFundedAmount: string | undefined;

      if (eventName === "EscrowFunded") {
        activityType = "escrow_funded";
        actorAddress = String(args.funder ?? actorAddress);
        nextFundedAmount = String(args.amount ?? "0");
        data = { amount: nextFundedAmount };
        nextEscrowState = "funded";
      } else if (eventName === "VoteSubmitted") {
        activityType = "vote_submitted";
        actorAddress = String(args.voter ?? actorAddress);
        data = { outcomeIndex: String(args.outcomeIndex), weight: String(args.weight) };
      } else if (eventName === "DisputeOpened") {
        activityType = "dispute_opened";
        actorAddress = String(args.disputer ?? actorAddress);
        data = { bondAmount: String(args.bondAmount) };
        nextEscrowState = "disputed";
      } else if (eventName === "Settled") {
        activityType = "escrow_settled";
        data = {
          outcomeIndex: String(args.outcomeIndex),
          merkleRoot: String(args.merkleRoot),
        };
        nextEscrowState = "settled";
      } else if (eventName === "ClaimExecuted") {
        activityType = "claim_executed";
        actorAddress = String(args.claimant ?? actorAddress);
        data = { amount: String(args.amount) };
      }

      if (activityType) {
        const inserted = await db.transaction(async (tx) => {
          const rows = await tx.insert(activityTable).values({
            id: activityId,
            type: activityType as never,
            escrowId,
            actorAddress,
            data,
            timestamp: new Date(),
          }).onConflictDoNothing().returning({ id: activityTable.id });

          if (!rows.length) {
            return false;
          }

          if (nextEscrowState) {
            const updates: {
              state: "funded" | "disputed" | "settled";
              fundedAmount?: string;
            } = { state: nextEscrowState };
            if (nextEscrowState === "funded" && nextFundedAmount !== undefined) {
              updates.fundedAmount = nextFundedAmount;
            }
            await tx
              .update(escrowsTable)
              .set(updates)
              .where(eq(escrowsTable.id, escrowId));
          }

          return true;
        });

        if (inserted) {
          processed++;
        }
      }
    }
  } catch (err) {
    logger.warn({ chain, contractAddress, err }, "Failed to index contract");
  }

  return processed;
}

export async function runIndexer(): Promise<{ syncedContracts: number; eventsProcessed: number }> {
  if (status.running) {
    logger.info("Indexer already running, skipping");
    return { syncedContracts: status.syncedContracts, eventsProcessed: status.eventsProcessed };
  }

  status.running = true;
  status.lastError = null;
  let totalEvents = 0;
  let syncedContracts = 0;

  try {
    const escrows = await db
      .select()
      .from(escrowsTable)
      .where(isNotNull(escrowsTable.contractAddress));

    const withContracts = escrows.filter((e) => e.contractAddress);

    for (const escrow of withContracts) {
      if (!escrow.contractAddress) continue;
      const client = getChainClient(escrow.chain);
      const latestBlock = client ? await client.getBlockNumber() : 0n;
      const fromBlock = latestBlock > 10_000n ? latestBlock - 10_000n : 0n;
      const events = await indexEscrowContract(
        escrow.chain,
        escrow.contractAddress as `0x${string}`,
        escrow.id,
        fromBlock,
      );
      totalEvents += events;
      syncedContracts++;
    }

    status.syncedContracts = syncedContracts;
    status.eventsProcessed = totalEvents;
    status.lastRun = new Date();
    logger.info({ syncedContracts, totalEvents }, "Indexer run complete");
  } catch (err) {
    status.lastError = String(err);
    logger.error({ err }, "Indexer run failed");
  } finally {
    status.running = false;
  }

  return { syncedContracts, eventsProcessed: totalEvents };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startIndexerSchedule(intervalMs = 60_000): void {
  if (intervalHandle) return;
  logger.info({ intervalMs }, "Starting indexer schedule");
  intervalHandle = setInterval(() => {
    runIndexer().catch((err) => logger.error({ err }, "Scheduled indexer error"));
  }, intervalMs);
}

export function stopIndexerSchedule(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
