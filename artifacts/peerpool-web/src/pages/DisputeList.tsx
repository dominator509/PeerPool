import { useState } from "react";
import { useListDisputes, useGetDisputeSummary, getListDisputesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatAmount } from "@/lib/utils";
import { Scale, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DISPUTE_STATES = ["", "open", "escalated", "resolved", "closed"] as const;
const PAGE_SIZE = 10;

export function DisputeList() {
  const [state, setState] = useState("");
  const [page, setPage] = useState(0);

  const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  if (state) params.state = state;

  const { data, isLoading } = useListDisputes(params, {
    query: { queryKey: getListDisputesQueryKey(params) },
  });
  const { data: summary } = useGetDisputeSummary();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Disputes" description="Active and historical dispute cases" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Disputes" value={summary?.total ?? 0} />
        <StatCard label="Open" value={summary?.byState?.open ?? 0} accent />
        <StatCard label="Escalated to Kleros" value={summary?.byState?.escalated ?? 0} />
        <StatCard label="Resolved" value={summary?.byState?.resolved ?? 0} />
      </div>

      <div className="mb-4">
        <Select value={state} onValueChange={(v) => { setState(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-xs bg-slate-900 border-slate-700" data-testid="state-filter">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all" className="text-xs">All states</SelectItem>
            {DISPUTE_STATES.slice(1).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Escrow</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Disputer</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">State</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Bond</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Kleros ID</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Opened</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-slate-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={Scale} title="No disputes found" description="Active disputes will appear here" />
                </td>
              </tr>
            ) : (
              data?.items?.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/30 transition-colors" data-testid="dispute-row">
                  <td className="px-4 py-3">
                    <Link href={`/disputes/${d.id}`} className="text-xs font-mono text-slate-400 hover:text-indigo-300 transition-colors">
                      {d.escrowId.slice(0, 12)}...
                    </Link>
                    {d.reason && (
                      <p className="text-[11px] text-slate-600 truncate max-w-[160px] mt-0.5">{d.reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <AddressBadge address={d.disputerAddress} />
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge state={d.state} type="dispute" />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs font-mono text-slate-400">{formatAmount(d.bondAmount, 18)} ETH</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {d.klerosDisputeId ? (
                      <span className="text-xs font-mono text-indigo-400">{d.klerosDisputeId}</span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-500">{formatDate(d.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/disputes/${d.id}`} className="text-slate-600 hover:text-indigo-400 transition-colors inline-flex">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
