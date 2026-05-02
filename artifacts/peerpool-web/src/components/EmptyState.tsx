import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-slate-500" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {description && <p className="text-xs text-slate-600 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
