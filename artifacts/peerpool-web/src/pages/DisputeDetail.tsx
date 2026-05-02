import { useParams, Link } from "wouter";
import { useGetDispute, useResolveDispute, getGetDisputeQueryKey, getListDisputesQueryKey } from "@workspace/api-client-react";
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
import { ArrowLeft, Scale, Brain, ExternalLink } from "lucide-react";

export function DisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [resolveOutcome, setResolveOutcome] = useState("");
  const [resolvedBy, setResolvedBy] = useState("");

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

        {dispute.klerosDisputeId && (
          <div className="rounded-lg border border-indigo-800/60 bg-indigo-950/20 px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              <p className="text-sm font-medium text-indigo-300">Kleros Arbitration</p>
            </div>
            <p className="text-xs text-slate-400">
              Escalated to Kleros Court · Dispute ID: <span className="font-mono text-indigo-400">{dispute.klerosDisputeId}</span>
            </p>
          </div>
        )}

        {dispute.aiVerdictSummary && (
          <div className="rounded-lg border border-violet-800/60 bg-violet-950/20 px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <p className="text-sm font-medium text-violet-300">AI Verdict Summary</p>
              <span className="text-[10px] text-violet-500 ml-auto">non-custodial · advisory only</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{dispute.aiVerdictSummary}</p>
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
