import { useState } from "react";
import { useListManifests, getListManifestsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";

const PAGE_SIZE = 20;

function formatOutcomePercent(bps?: number): string | null {
  if (typeof bps !== "number") return null;
  const percent = bps / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function ManifestList() {
  const [page, setPage] = useState(0);

  const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const { data, isLoading } = useListManifests(params, {
    query: { queryKey: getListManifestsQueryKey(params) },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Manifests"
        description={`${data?.total ?? 0} registered outcome manifest${(data?.total ?? 0) !== 1 ? "s" : ""}`}
        action={
          <Link href="/manifests/new">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5" data-testid="create-manifest-btn">
              <Plus className="w-3.5 h-3.5" />
              Build Manifest
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-lg animate-pulse" />
          ))
        ) : !data?.items?.length ? (
          <div className="md:col-span-2">
            <EmptyState
              icon={FileText}
              title="No manifests registered"
              description="Build a payout rulebook first, then attach it to an escrow."
              action={
                <Link href="/manifests/new">
                  <Button size="sm" variant="outline" className="border-slate-700 text-slate-300">
                    Build Manifest
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          data?.items?.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition-colors"
              data-testid="manifest-card"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{m.title}</p>
                  {m.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{m.description}</p>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 flex-shrink-0 mt-0.5">{m.escrowCount} escrows</span>
              </div>

              {/* Outcomes */}
              {Array.isArray(m.outcomes) && m.outcomes.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Payout results</p>
                  <div className="flex gap-1 flex-wrap">
                    {(m.outcomes as Array<{ index: number; label: string; distributionBps?: number }>).map((o) => {
                      const payout = formatOutcomePercent(o.distributionBps);
                      return (
                      <span
                        key={o.index}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700"
                      >
                        {o.label}{payout ? ` - ${payout}` : ""}
                      </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <AddressBadge address={m.createdBy} />
                <div className="flex items-center gap-2">
                  {m.ipfsHash && (
                    <span className="text-[10px] font-mono text-slate-600 truncate max-w-[80px]">
                      {m.ipfsHash.slice(0, 12)}...
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">{formatDate(m.createdAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {(data?.total ?? 0) > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-400"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-400"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= (data?.total ?? 0)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
