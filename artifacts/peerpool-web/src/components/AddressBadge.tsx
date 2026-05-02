import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { truncateAddress, copyToClipboard } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AddressBadgeProps {
  address: string;
  className?: string;
  full?: boolean;
}

export function AddressBadge({ address, className, full }: AddressBadgeProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded cursor-pointer hover:text-slate-200 transition-colors",
        className
      )}
      onClick={handleCopy}
      data-testid="address-badge"
      title={address}
    >
      {full ? address : truncateAddress(address)}
      {copied ? (
        <Check className="w-3 h-3 text-green-400" />
      ) : (
        <Copy className="w-3 h-3 opacity-50" />
      )}
    </span>
  );
}
