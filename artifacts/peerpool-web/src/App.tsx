import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { EscrowList } from "@/pages/EscrowList";
import { EscrowDetail } from "@/pages/EscrowDetail";
import { CreateEscrow } from "@/pages/CreateEscrow";
import { ManifestList } from "@/pages/ManifestList";
import { CreateManifest } from "@/pages/CreateManifest";
import { DisputeList } from "@/pages/DisputeList";
import { DisputeDetail } from "@/pages/DisputeDetail";
import { Claims } from "@/pages/Claims";
import { ActivityFeed } from "@/pages/ActivityFeed";
import NotFound from "@/pages/not-found";
import { WalletContext, useWalletState } from "@/lib/wallet";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("PeerPool UI Error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen bg-[#0a0e1a] text-slate-200 items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="text-red-400 text-5xl mb-4">⚠</div>
            <h1 className="text-xl font-semibold text-slate-100 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/escrows/new" component={CreateEscrow} />
        <Route path="/escrows/:id" component={EscrowDetail} />
        <Route path="/escrows" component={EscrowList} />
        <Route path="/manifests/new" component={CreateManifest} />
        <Route path="/manifests" component={ManifestList} />
        <Route path="/disputes/:id" component={DisputeDetail} />
        <Route path="/disputes" component={DisputeList} />
        <Route path="/claims" component={Claims} />
        <Route path="/activity" component={ActivityFeed} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWalletState();

  useEffect(() => {
    setAuthTokenGetter(() => wallet.sessionToken);
  }, [wallet.sessionToken]);

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
