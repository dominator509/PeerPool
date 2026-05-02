import { useParams, Link } from "wouter";
import {
  useGetEscrow,
  useListParticipants,
  useListVotes,
  useListClaims,
  getGetEscrowQueryKey,
  getListParticipantsQueryKey,
  getListVotesQueryKey,
  getListClaimsQueryKey,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Vote, Coins, AlertTriangle } from "lucide-react";

export function EscrowDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: escrow, isLoading } = useGetEscrow(id!, {
    query: { enabled: !!id, queryKey: getGetEscrowQueryKey(id!) },
  });
  const { data: participants } = useListParticipants(id!, {
    query: { enabled: !!id, queryKey: getListParticipantsQueryKey(id!) },
  });
  const { data: votes } = useListVotes(id!, {
    query: { enabled: !!id, queryKey: getListVotesQueryKey(id!) },
  });
  const { data: claims } = useListClaims(id!, {
    query: { enabled: !!id, queryKey: getListClaimsQueryKey(id!) },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-64" />
        <div className="h-32 bg-slate-800 rounded animate-pulse w-full" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="p-6">
        <EmptyState title="Escrow not found" description="This escrow does not exist or has been removed." />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <Link href="/escrows" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3" data-testid="back-btn">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Escrows
        </Link>
        <PageHeader title={escrow.title} description={escrow.description ?? undefined} action={<StateBadge state={escrow.state} />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Chain</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{escrow.chain}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Token</p>
          <AddressBadge address={escrow.token} className="mt-1" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total Amount</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{formatAmount(escrow.totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Funded</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{formatAmount(escrow.fundedAmount ?? "0")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Creator</p>
          <AddressBadge address={escrow.creatorAddress} className="mt-1" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Created</p>
          <p className="text-sm text-slate-200 mt-1">{formatDate(escrow.createdAt)}</p>
        </div>
        {escrow.deadline && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Deadline</p>
            <p className="text-sm text-slate-200 mt-1">{formatDate(escrow.deadline)}</p>
          </div>
        )}
      </div>

      {escrow.contractAddress && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 mb-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Contract Address</p>
          <AddressBadge address={escrow.contractAddress} full className="mt-1" />
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {escrow.state === "funded" && (
          <Link href={`/disputes?escrow=${id}`}>
            <Button size="sm" variant="outline" className="border-amber-700 text-amber-400 hover:bg-amber-900/20 gap-1.5" data-testid="open-dispute-btn">
              <AlertTriangle className="w-3.5 h-3.5" />
              Open Dispute
            </Button>
          </Link>
        )}
        {(escrow.state === "active" || escrow.state === "settled") && (
          <Link href={`/claims?escrow=${id}`}>
            <Button size="sm" variant="outline" className="border-violet-700 text-violet-400 hover:bg-violet-900/20 gap-1.5" data-testid="claim-btn">
              <Coins className="w-3.5 h-3.5" />
              Submit Claim
            </Button>
          </Link>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Participants ({participants?.items?.length ?? 0})</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {!participants?.items?.length ? (
              <EmptyState icon={Users} title="No participants yet" />
            ) : (
              participants?.items?.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3" data-testid="participant-row">
                  <AddressBadge address={p.address} />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{p.role}</span>
                    {p.fundedAmount && p.fundedAmount !== "0" && (
                      <span className="text-xs text-slate-400">{formatAmount(p.fundedAmount)}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Vote className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Votes & Tally</span>
          </div>
          {votes?.tally && votes.tally.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/60">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Outcome Tally</p>
              <div className="flex gap-3 flex-wrap">
                {votes.tally.map((t) => (
                  <div key={t.outcomeIndex} className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400">{t.outcomeLabel ?? `Outcome ${t.outcomeIndex}`}</span>
                    <span className="font-semibold text-indigo-300">{t.voteCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-800/60">
            {!votes?.items?.length ? (
              <EmptyState icon={Vote} title="No votes yet" />
            ) : (
              votes?.items?.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-4 py-3" data-testid="vote-row">
                  <AddressBadge address={v.voterAddress} />
                  <span className="text-xs text-slate-400">{v.outcomeLabel ?? `Outcome ${v.outcomeIndex}`}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Coins className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Claims ({claims?.items?.length ?? 0})</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {!claims?.items?.length ? (
              <EmptyState icon={Coins} title="No claims yet" />
            ) : (
              claims?.items?.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3" data-testid="claim-row">
                  <AddressBadge address={c.claimantAddress} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatAmount(c.amount)}</span>
                    <StateBadge state={c.state} type="claim" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
