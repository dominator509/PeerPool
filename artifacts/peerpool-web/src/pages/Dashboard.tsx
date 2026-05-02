import { useGetProtocolStats, useListEscrows, useListActivity, useGetEscrowSummary, useGetDisputeSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { timeAgo, formatAmount } from "@/lib/utils";
import { Activity, LockKeyhole, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetProtocolStats();
  const { data: escrows } = useListEscrows({ limit: 5, offset: 0 });
  const { data: activity } = useListActivity({ limit: 8 });
  const { data: escrowSummary } = useGetEscrowSummary();
  const { data: disputeSummary } = useGetDisputeSummary();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        description="Protocol overview and recent activity"
        action={
          <Link href="/escrows/new">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5" data-testid="create-escrow-btn">
              <Plus className="w-3.5 h-3.5" />
              New Escrow
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Escrows" value={statsLoading ? "—" : (stats?.totalEscrows ?? 0)} sub={`${escrowSummary?.byState?.active ?? 0} active`} accent />
        <StatCard label="Total Value Locked" value={statsLoading ? "—" : `$${formatAmount(stats?.totalValueLocked ?? "0", 0)}`} sub="across all chains" />
        <StatCard label="Disputes" value={statsLoading ? "—" : (stats?.totalDisputes ?? 0)} sub={`${Math.round((disputeSummary?.klerosEscalationRate ?? 0) * 100)}% escalated`} />
        <StatCard label="Manifests" value={statsLoading ? "—" : (stats?.totalManifests ?? 0)} sub={`${(stats?.activeChains ?? []).length} active chains`} />
      </div>

      {(stats?.activeChains?.length ?? 0) > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">Active chains</span>
          <div className="flex gap-1.5">
            {stats?.activeChains?.map((chain) => (
              <span key={chain} className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {chain}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <LockKeyhole className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">Recent Escrows</span>
            </div>
            <Link href="/escrows" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-800/60">
            {!escrows?.items?.length ? (
              <EmptyState icon={LockKeyhole} title="No escrows yet" description="Create your first escrow to get started" />
            ) : (
              escrows?.items?.map((e) => (
                <Link
                  key={e.id}
                  href={`/escrows/${e.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
                  data-testid="escrow-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{e.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-500">{e.chain}</span>
                      <span className="text-[11px] text-slate-600">·</span>
                      <span className="text-[11px] text-slate-500">{e.participantCount} participants</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <StateBadge state={e.state} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">Activity</span>
            </div>
            <Link href="/activity" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-800/60">
            {!activity?.items?.length ? (
              <EmptyState icon={Activity} title="No activity yet" />
            ) : (
              activity?.items?.map((ev) => (
                <div key={ev.id} className="px-4 py-3" data-testid="activity-row">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">
                        {ev.type.replace(/_/g, " ")}
                      </p>
                      <AddressBadge address={ev.actorAddress} className="mt-0.5" />
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0 mt-0.5">
                      {timeAgo(ev.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {escrowSummary && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">Escrow State Distribution</p>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(escrowSummary.byState ?? {}).map(([state, count]) => (
              <div key={state} className="flex items-center gap-1.5">
                <StateBadge state={state} />
                <span className="text-sm font-semibold text-slate-300">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
