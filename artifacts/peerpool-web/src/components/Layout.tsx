import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  LockKeyhole,
  FileText,
  Scale,
  Coins,
  Activity,
  ChevronRight,
} from "lucide-react";

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

  return (
    <div className="flex h-screen bg-[#0a0e1a] text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-slate-800 bg-[#0d1121]">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800">
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? location === "/"
                : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-indigo-600/20 text-indigo-300 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-600">EVM · Multi-chain · Non-custodial</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
