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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

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
  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
