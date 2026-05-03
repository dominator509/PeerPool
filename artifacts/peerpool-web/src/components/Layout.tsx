import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";
import {
  LayoutDashboard,
  LockKeyhole,
  FileText,
  Scale,
  Coins,
  Activity,
  ChevronRight,
  Wallet,
  LogOut,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/escrows", label: "Escrows", icon: LockKeyhole },
  { href: "/manifests", label: "Manifests", icon: FileText },
  { href: "/disputes", label: "Disputes", icon: Scale },
  { href: "/claims", label: "Claims", icon: Coins },
  { href: "/activity", label: "Activity", icon: Activity },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { address, isConnecting, connect, disconnect } = useWallet();

  return (
    <div className="flex min-h-dvh bg-[#0a0e1a] text-slate-200 flex-col lg:flex-row">
      <aside className="w-full lg:w-56 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0d1121]">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <LockKeyhole className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white tracking-wide">PeerPool</p>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">Protocol Interface</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 sm:px-3 py-3 sm:py-4 flex lg:block gap-1 overflow-x-auto lg:overflow-x-visible whitespace-nowrap lg:whitespace-normal">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer shrink-0 lg:w-auto",
                    active ? "bg-indigo-600/20 text-indigo-300 font-medium" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60 hidden lg:block" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800">
          {address ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-emerald-950/40 border border-emerald-800/40">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-[11px] font-mono text-emerald-300 truncate flex-1">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
                data-testid="disconnect-btn"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-500/60 transition-colors disabled:opacity-50"
              data-testid="connect-wallet-btn"
            >
              <Wallet className="w-3.5 h-3.5" />
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>

        <div className="hidden lg:block px-5 py-3 border-t border-slate-800">
          <p className="text-[10px] text-slate-600">EVM · Multi-chain · Non-custodial</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
