import { cn } from "@/lib/utils";

const ESCROW_STATE_STYLES: Record<string, string> = {
  pending: "bg-slate-700/60 text-slate-300 border-slate-600",
  funded: "bg-blue-900/60 text-blue-300 border-blue-700",
  active: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  disputed: "bg-amber-900/60 text-amber-300 border-amber-700",
  settled: "bg-violet-900/60 text-violet-300 border-violet-700",
  closed: "bg-slate-800/60 text-slate-400 border-slate-700",
};

const DISPUTE_STATE_STYLES: Record<string, string> = {
  open: "bg-amber-900/60 text-amber-300 border-amber-700",
  escalated: "bg-red-900/60 text-red-300 border-red-700",
  resolved: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  closed: "bg-slate-800/60 text-slate-400 border-slate-700",
};

const CLAIM_STATE_STYLES: Record<string, string> = {
  pending: "bg-slate-700/60 text-slate-300 border-slate-600",
  submitted: "bg-blue-900/60 text-blue-300 border-blue-700",
  executed: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  rejected: "bg-red-900/60 text-red-300 border-red-700",
};

interface StateBadgeProps {
  state: string;
  type?: "escrow" | "dispute" | "claim";
  className?: string;
}

export function StateBadge({ state, type = "escrow", className }: StateBadgeProps) {
  const styles =
    type === "dispute"
      ? DISPUTE_STATE_STYLES
      : type === "claim"
      ? CLAIM_STATE_STYLES
      : ESCROW_STATE_STYLES;

  const style = styles[state] ?? "bg-slate-700/60 text-slate-300 border-slate-600";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border",
        style,
        className
      )}
      data-testid="state-badge"
    >
      {state}
    </span>
  );
}
