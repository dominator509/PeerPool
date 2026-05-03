import {
  useGetProtocolStats,
  useListEscrows,
  useListActivity,
  useGetEscrowSummary,
  useGetDisputeSummary,
  useListChains,
  useGetIndexerStatus,
  useTriggerSync,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { timeAgo, formatAmount } from "@/lib/utils";
import { Activity, LockKeyhole, Plus, ArrowRight, RefreshCw, Link2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetProtocolStats();
  const { data: escrows } = useListEscrows({ limit: 5, offset: 0 });
  const { data: activity } = useListActivity({ limit: 8 });
  const { data: escrowSummary } = useGetEscrowSummary();
  const { data: disputeSummary } = useGetDisputeSummary();
  const { data: chains } = useListChains();
  const { data: indexerStatus } = useGetIndexerStatus();
  const { mutate: triggerSync, isPending: syncing } = useTriggerSync();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        description="Protocol overview and recent activity"
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerSync()}
              disabled={syncing || indexerStatus?.running}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
              data-testid="sync-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing || indexerStatus?.running ? "animate-spin" : ""}`} />
              {syncing || indexerStatus?.running ? "Syncing…" : "Sync Chains"}
            </Button>
            <Link href="/escrows/new">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 w-full sm:w-auto" data-testid="create-escrow-btn">
                <Plus className="w-3.5 h-3.5" />
                New Escrow
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Escrows" value={statsLoading ? "—" : (stats?.totalEscrows ?? 0)} sub={`${escrowSummary?.byState?.active ?? 0} active`} accent />
        <StatCard label="Total Value Locked" value={statsLoading ? "—" : `$${formatAmount(stats?.totalValueLocked ?? "0", 0)}`} sub="across all chains" />
        <StatCard label="Disputes" value={statsLoading ? "—" : (stats?.totalDisputes ?? 0)} sub={`${Math.round((disputeSummary?.klerosEscalationRate ?? 0) * 100)}% escalated`} />
        <StatCard label="Manifests" value={statsLoading ? "—" : (stats?.totalManifests ?? 0)} sub={`${(chains?.count ?? 0)} supported chains`} />
      </div>

      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 overflow-x-auto">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Supported Chains</span>
          </div>
          {indexerStatus && (
            <span className="text-[10px] text-slate-600 whitespace-nowrap">
              {indexerStatus.running ? (
                <span className="text-amber-400">Indexer running…</span>
              ) : indexerStatus.lastRun ? (
                `Last sync: ${new Date(indexerStatus.lastRun).toLocaleTimeString()} · ${indexerStatus.eventsProcessed} events`
              ) : (
                "Never synced"
              )}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap min-w-max sm:min-w-0">
          {(chains?.chains ?? stats?.activeChains ?? []).map((chain) => {
            const isActive = (stats?.activeChains ?? []).includes(chain);
            return (
              <span
                key={chain}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${
                  isActive
                    ? "bg-indigo-950/40 text-indigo-300 border-indigo-800/50"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                <Circle className={`w-1.5 h-1.5 ${isActive ? "fill-indigo-400 text-indigo-400" : "fill-slate-600 text-slate-600"}`} />
                {chain}
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
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
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors gap-2"
                  data-testid="escrow-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{e.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-slate-500">{e.chain}</span>
                      <span className="text-[11px] text-slate-600">·</span>
                      <span className="text-[11px] text-slate-500">{e.participantCount} participants</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StateBadge state={e.state} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
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
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 overflow-x-auto">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">Escrow State Distribution</p>
          <div className="flex gap-3 flex-wrap min-w-max sm:min-w-0">
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
