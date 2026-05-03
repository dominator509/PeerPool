import { useParams, Link } from "wouter";
import {
  useGetDispute,
  useResolveDispute,
  useRunAiDisputeReview,
  useEscalateDisputeToKleros,
  getGetDisputeQueryKey,
  getListDisputesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Scale, Brain, ExternalLink, Loader2, ArrowUpRight } from "lucide-react";

export function DisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [resolveOutcome, setResolveOutcome] = useState("");
  const [resolvedBy, setResolvedBy] = useState("");
  const [escalateChain, setEscalateChain] = useState("ethereum");

  const { data: dispute, isLoading } = useGetDispute(id!, {
    query: { enabled: !!id, queryKey: getGetDisputeQueryKey(id!) },
  });

  const { mutate: resolve, isPending: resolving } = useResolveDispute({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDisputeQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getListDisputesQueryKey() });
      },
    },
  });

  const { mutate: runAiReview, isPending: aiReviewing, data: aiResult } = useRunAiDisputeReview({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDisputeQueryKey(id!) });
      },
    },
  });

  const { mutate: escalate, isPending: escalating } = useEscalateDisputeToKleros({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDisputeQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getListDisputesQueryKey() });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-48" />
        <div className="h-40 bg-slate-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="p-6">
        <EmptyState title="Dispute not found" />
      </div>
    );
  }

  function handleResolve() {
    if (!resolveOutcome || !resolvedBy || !id) return;
    resolve({ id, data: { resolvedOutcomeIndex: parseInt(resolveOutcome), resolvedBy } });
  }

  function handleAiReview() {
    if (!id) return;
    runAiReview({ id });
  }

  function handleEscalate() {
    if (!id) return;
    escalate({ id, data: { chain: escalateChain } });
  }

  const verdictText = aiResult?.aiVerdictSummary ?? dispute.aiVerdictSummary;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/disputes" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-3" data-testid="back-btn">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Disputes
      </Link>
      <PageHeader
        title="Dispute"
        description={`For escrow ${dispute.escrowId.slice(0, 12)}...`}
        action={<StateBadge state={dispute.state} type="dispute" />}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Disputer</p>
            <AddressBadge address={dispute.disputerAddress} className="mt-1" />
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Bond Amount</p>
            <p className="text-sm font-mono text-slate-200 mt-1">{formatAmount(dispute.bondAmount, 18)} ETH</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Opened</p>
            <p className="text-sm text-slate-200 mt-1">{formatDate(dispute.createdAt)}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Reason</p>
          <p className="text-sm text-slate-300 leading-relaxed">{dispute.reason}</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Escrow</p>
          <Link href={`/escrows/${dispute.escrowId}`} className="inline-flex items-center gap-1.5 text-xs font-mono text-indigo-400 hover:text-indigo-300">
            {dispute.escrowId}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* AI Review Panel */}
        <div className="rounded-lg border border-violet-800/50 bg-violet-950/10 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <p className="text-sm font-medium text-violet-300">AI Dispute Review</p>
              <span className="text-[10px] text-violet-600 bg-violet-950/50 border border-violet-800/40 px-1.5 py-0.5 rounded">advisory only · non-custodial</span>
            </div>
            <Button
              size="sm"
              onClick={handleAiReview}
              disabled={aiReviewing}
              className="bg-violet-700/80 hover:bg-violet-600 text-white h-7 text-xs px-3"
              data-testid="ai-review-btn"
            >
              {aiReviewing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Brain className="w-3 h-3 mr-1.5" />
                  {verdictText ? "Re-run Review" : "Run AI Review"}
                </>
              )}
            </Button>
          </div>
          {verdictText ? (
            <div className="bg-slate-900/60 rounded-md px-3 py-3 border border-violet-800/20">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{verdictText}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">
              Click "Run AI Review" to generate an impartial AI analysis of this dispute based on the escrow data, manifest conditions, and claim history.
            </p>
          )}
        </div>

        {/* Kleros Panel */}
        {dispute.klerosDisputeId ? (
          <div className="rounded-lg border border-indigo-800/60 bg-indigo-950/20 px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              <p className="text-sm font-medium text-indigo-300">Kleros Arbitration</p>
              <span className="ml-auto text-[10px] text-slate-500">{dispute.state}</span>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Escalated to Kleros Court · Dispute ID: <span className="font-mono text-indigo-400">{dispute.klerosDisputeId}</span>
            </p>
            <a
              href={`https://court.kleros.io/cases/${dispute.klerosDisputeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              View on Kleros Court <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        ) : dispute.state === "open" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">Escalate to Kleros</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              If on-chain mediation is required, escalate this dispute to Kleros decentralized arbitration court.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={escalateChain}
                onChange={(e) => setEscalateChain(e.target.value)}
                className="h-8 rounded-md border border-slate-700 bg-slate-900 text-slate-300 text-xs px-2 focus:border-indigo-500 focus:outline-none"
                data-testid="escalate-chain-select"
              >
                <option value="ethereum">Ethereum</option>
                <option value="arbitrum">Arbitrum</option>
                <option value="sepolia">Sepolia (testnet)</option>
                <option value="arbitrum-sepolia">Arbitrum Sepolia</option>
              </select>
              <Button
                size="sm"
                onClick={handleEscalate}
                disabled={escalating}
                variant="outline"
                className="border-indigo-700/60 text-indigo-400 hover:bg-indigo-950/40 h-8 text-xs"
                data-testid="escalate-btn"
              >
                {escalating ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Escalating…
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 mr-1.5" />
                    Escalate to Kleros
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {dispute.resolvedOutcomeIndex !== null && dispute.resolvedOutcomeIndex !== undefined && (
          <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-4 py-4">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Resolution</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-emerald-300">Outcome {dispute.resolvedOutcomeIndex} selected</p>
              {dispute.resolvedBy && (
                <>
                  <span className="text-slate-500 text-xs">by</span>
                  <AddressBadge address={dispute.resolvedBy} />
                </>
              )}
            </div>
            {dispute.resolvedAt && (
              <p className="text-xs text-slate-500 mt-1">Resolved {formatDate(dispute.resolvedAt)}</p>
            )}
          </div>
        )}

        {dispute.state === "open" && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-4">
            <p className="text-sm font-medium text-slate-300 mb-3">Resolve Dispute</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Outcome Index</Label>
                <Input type="number" value={resolveOutcome} onChange={(e) => setResolveOutcome(e.target.value)} placeholder="0" className="bg-slate-900 border-slate-700 text-slate-200" data-testid="resolve-outcome-input" />
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Resolved By (address)</Label>
                <Input value={resolvedBy} onChange={(e) => setResolvedBy(e.target.value)} placeholder="0x..." className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs" data-testid="resolved-by-input" />
              </div>
            </div>
            <Button onClick={handleResolve} disabled={resolving || !resolveOutcome || !resolvedBy} size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white" data-testid="resolve-btn">
              {resolving ? "Resolving..." : "Submit Resolution"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
