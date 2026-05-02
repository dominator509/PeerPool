import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  className?: string;
}

export function StatCard({ label, value, sub, accent, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-4",
        accent && "border-indigo-800/60 bg-indigo-950/30",
        className
      )}
    >
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-semibold mt-1.5", accent ? "text-indigo-300" : "text-slate-100")}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
