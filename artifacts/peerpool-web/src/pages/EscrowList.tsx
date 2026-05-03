import { useState } from "react";
import { useListEscrows, getListEscrowsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LockKeyhole, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATES = ["", "pending", "funded", "active", "disputed", "settled", "closed"] as const;
const CHAINS = ["", "ethereum", "arbitrum", "optimism", "polygon", "base"];
const PAGE_SIZE = 10;

export function EscrowList() {
  const [state, setState] = useState("");
  const [chain, setChain] = useState("");
  const [page, setPage] = useState(0);

  const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  if (state) params.state = state;
  if (chain) params.chain = chain;

  const { data, isLoading } = useListEscrows(params, {
    query: { queryKey: getListEscrowsQueryKey(params) },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Escrows"
        description={`${data?.total ?? 0} escrow${(data?.total ?? 0) !== 1 ? "s" : ""} in the protocol`}
        action={
          <Link href="/escrows/new">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 w-full sm:w-auto" data-testid="create-escrow-btn">
              <Plus className="w-3.5 h-3.5" />
              New Escrow
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select value={state} onValueChange={(v) => { setState(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36 h-8 text-xs bg-slate-900 border-slate-700" data-testid="state-filter">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all" className="text-xs">All states</SelectItem>
            {STATES.slice(1).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={chain} onValueChange={(v) => { setChain(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36 h-8 text-xs bg-slate-900 border-slate-700" data-testid="chain-filter">
            <SelectValue placeholder="All chains" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all" className="text-xs">All chains</SelectItem>
            {CHAINS.slice(1).map((c) => (
              <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-slate-800 overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Title</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Chain</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Creator</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">State</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Participants</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-slate-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={LockKeyhole}
                    title="No escrows found"
                    description="Try changing the filters or create a new escrow"
                    action={
                      <Link href="/escrows/new">
                        <Button size="sm" variant="outline" className="border-slate-700 text-slate-300">
                          Create Escrow
                        </Button>
                      </Link>
                    }
                  />
                </td>
              </tr>
            ) : (
              data?.items?.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer" data-testid="escrow-row">
                  <td className="px-4 py-3">
                    <Link href={`/escrows/${e.id}`} className="font-medium text-slate-200 hover:text-indigo-300 transition-colors block truncate max-w-[200px]">
                      {e.title}
                    </Link>
                    {e.description && (
                      <p className="text-[11px] text-slate-500 truncate max-w-[200px] mt-0.5">{e.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400">{e.chain}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <AddressBadge address={e.creatorAddress} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-500">{formatDate(e.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge state={e.state} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400">{e.participantCount}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded-lg animate-pulse" />)
        ) : !data?.items?.length ? (
          <EmptyState icon={LockKeyhole} title="No escrows found" description="Try changing the filters or create a new escrow" />
        ) : (
          data.items.map((e) => (
            <Link key={e.id} href={`/escrows/${e.id}`} className="block rounded-lg border border-slate-800 bg-slate-900/40 p-4" data-testid="escrow-row-mobile">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{e.title}</p>
                  {e.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{e.description}</p>}
                </div>
                <StateBadge state={e.state} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{e.chain}</span>
                <span>·</span>
                <span>{e.participantCount} participants</span>
                <span>·</span>
                <span>{formatDate(e.createdAt)}</span>
              </div>
              <div className="mt-2">
                <AddressBadge address={e.creatorAddress} />
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-slate-500">
            Page {page + 1} of {totalPages} · {data?.total} total
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-400" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} data-testid="prev-page">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 border-slate-700 text-slate-400" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="next-page">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
