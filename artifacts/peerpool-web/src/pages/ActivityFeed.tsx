import { useListActivity, getListActivityQueryKey } from "@workspace/api-client-react";
import { PageHeader } from "@/components/PageHeader";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { timeAgo } from "@/lib/utils";
import { Link } from "wouter";
import { Activity, LockKeyhole, FileText, Scale, Coins, Vote, AlertTriangle } from "lucide-react";

const EVENT_ICONS: Record<string, React.ElementType> = {
  escrow_created: LockKeyhole,
  escrow_funded: LockKeyhole,
  participant_added: Activity,
  vote_submitted: Vote,
  dispute_opened: AlertTriangle,
  dispute_resolved: Scale,
  claim_created: Coins,
  claim_executed: Coins,
  manifest_registered: FileText,
};

const EVENT_COLORS: Record<string, string> = {
  escrow_created: "text-indigo-400 bg-indigo-900/40 border-indigo-800/60",
  escrow_funded: "text-blue-400 bg-blue-900/40 border-blue-800/60",
  participant_added: "text-slate-400 bg-slate-800/60 border-slate-700",
  vote_submitted: "text-violet-400 bg-violet-900/40 border-violet-800/60",
  dispute_opened: "text-amber-400 bg-amber-900/40 border-amber-800/60",
  dispute_resolved: "text-emerald-400 bg-emerald-900/40 border-emerald-800/60",
  claim_created: "text-cyan-400 bg-cyan-900/40 border-cyan-800/60",
  claim_executed: "text-green-400 bg-green-900/40 border-green-800/60",
  manifest_registered: "text-slate-400 bg-slate-800/60 border-slate-700",
};

export function ActivityFeed() {
  const { data, isLoading } = useListActivity(
    { limit: 50 },
    { query: { queryKey: getListActivityQueryKey({ limit: 50 }) } }
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Activity" description="Protocol-wide event log" />

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
          ))
        ) : !data?.items?.length ? (
          <EmptyState icon={Activity} title="No activity yet" description="Protocol events will appear here as they occur" />
        ) : (
          data?.items?.map((ev) => {
            const Icon = EVENT_ICONS[ev.type] ?? Activity;
            const colorClass = EVENT_COLORS[ev.type] ?? "text-slate-400 bg-slate-800/60 border-slate-700";

            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-slate-700 transition-colors"
                data-testid="activity-item"
              >
                <div className={`w-8 h-8 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">
                        {ev.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {ev.actorAddress && ev.actorAddress !== "system" && (
                          <AddressBadge address={ev.actorAddress} />
                        )}
                        {ev.escrowId && ev.escrowId !== "system" && (
                          <Link href={`/escrows/${ev.escrowId}`} className="text-[11px] font-mono text-indigo-400/70 hover:text-indigo-400 transition-colors">
                            escrow:{ev.escrowId.slice(0, 8)}
                          </Link>
                        )}
                      </div>
                      {ev.data && (
                        <div className="mt-1.5 flex gap-2 flex-wrap">
                          {Object.entries(ev.data as Record<string, unknown>).map(([k, v]) => (
                            <span key={k} className="text-[10px] text-slate-600">
                              <span className="text-slate-500">{k}:</span> {String(v).slice(0, 30)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-600 flex-shrink-0 mt-0.5">
                      {timeAgo(ev.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
