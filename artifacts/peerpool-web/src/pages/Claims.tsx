import { useState } from "react";
import { useListEscrows, useListClaims, useCreateClaim, useSubmitClaim, getListClaimsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Plus } from "lucide-react";

export function Claims() {
  const queryClient = useQueryClient();
  const [selectedEscrow, setSelectedEscrow] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [claimantAddress, setClaimantAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [submitClaimId, setSubmitClaimId] = useState("");
  const [merkleProof, setMerkleProof] = useState("");

  const { data: escrows } = useListEscrows({ limit: 50, offset: 0 });
  const { data: claims, isLoading } = useListClaims(selectedEscrow || "skip", {
    query: {
      enabled: !!selectedEscrow,
      queryKey: getListClaimsQueryKey(selectedEscrow),
    },
  });

  const { mutate: createClaim, isPending: creating } = useCreateClaim({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey(selectedEscrow) });
        setShowCreate(false);
        setClaimantAddress("");
        setAmount("");
      },
    },
  });

  const { mutate: submitClaim, isPending: submitting } = useSubmitClaim({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey(selectedEscrow) });
        setSubmitClaimId("");
        setMerkleProof("");
      },
    },
  });

  function handleCreate() {
    if (!claimantAddress || !amount || !selectedEscrow) return;
    createClaim({ id: selectedEscrow, data: { claimantAddress, amount } });
  }

  function handleSubmit() {
    if (!submitClaimId || !merkleProof || !selectedEscrow) return;
    const proofArray = merkleProof.split(",").map((s) => s.trim()).filter(Boolean);
    submitClaim({ id: selectedEscrow, claimId: submitClaimId, data: { merkleProof: proofArray } });
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Claims"
        description="Submit and track settlement claims with Merkle proofs"
        action={
          selectedEscrow ? (
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 w-full sm:w-auto"
              onClick={() => setShowCreate((v) => !v)}
              data-testid="create-claim-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              New Claim
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Label className="text-xs text-slate-400 mb-1.5">Select Escrow</Label>
        <Select value={selectedEscrow} onValueChange={setSelectedEscrow}>
          <SelectTrigger className="w-full sm:w-80 bg-slate-900 border-slate-700 text-slate-200" data-testid="escrow-select">
            <SelectValue placeholder="Choose an escrow..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {escrows?.items?.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-slate-200">
                {e.title} — {e.state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showCreate && selectedEscrow && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-4 mb-4">
          <p className="text-sm font-medium text-slate-300 mb-3">Create Claim</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Claimant Address</Label>
              <Input
                value={claimantAddress}
                onChange={(e) => setClaimantAddress(e.target.value)}
                placeholder="0x..."
                className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs"
                data-testid="claimant-input"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Amount (smallest unit)</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000000000"
                className="bg-slate-900 border-slate-700 text-slate-200"
                data-testid="amount-input"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating} className="bg-indigo-600 hover:bg-indigo-500 text-white" data-testid="submit-create-btn">
              {creating ? "Creating..." : "Create Claim"}
            </Button>
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-400" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {submitClaimId && selectedEscrow && (
        <div className="rounded-lg border border-violet-800/60 bg-violet-950/20 px-4 py-4 mb-4">
          <p className="text-sm font-medium text-violet-300 mb-3">Submit Merkle Proof</p>
          <div className="mb-3">
            <Label className="text-xs text-slate-400 mb-1.5">Merkle Proof (comma-separated leaf hashes)</Label>
            <Input
              value={merkleProof}
              onChange={(e) => setMerkleProof(e.target.value)}
              placeholder="0x..., 0x..."
              className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs"
              data-testid="proof-input"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="bg-violet-600 hover:bg-violet-500 text-white" data-testid="submit-proof-btn">
              {submitting ? "Submitting..." : "Submit Proof"}
            </Button>
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-400" onClick={() => setSubmitClaimId("") }>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!selectedEscrow ? (
        <EmptyState icon={Coins} title="Select an escrow" description="Choose an escrow above to view its claims" />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      ) : !claims?.items?.length ? (
        <EmptyState icon={Coins} title="No claims yet" description="Claims submitted for this escrow will appear here" />
      ) : (
        <div className="rounded-lg border border-slate-800 overflow-hidden hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Claimant</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">State</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Created</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {claims?.items?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors" data-testid="claim-row">
                  <td className="px-4 py-3">
                    <AddressBadge address={c.claimantAddress} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-300">{formatAmount(c.amount)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge state={c.state} type="claim" />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-500">{formatDate(c.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.state === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-violet-700 text-violet-400 h-7 text-xs"
                        onClick={() => setSubmitClaimId(c.id)}
                        data-testid="submit-proof-btn"
                      >
                        Submit Proof
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="md:hidden space-y-3">
        {selectedEscrow && !isLoading && claims?.items?.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <AddressBadge address={c.claimantAddress} />
              <StateBadge state={c.state} type="claim" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{formatAmount(c.amount)}</span>
              <span>·</span>
              <span>{formatDate(c.createdAt)}</span>
            </div>
            {c.state === "pending" && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 border-violet-700 text-violet-400 h-8 text-xs"
                onClick={() => setSubmitClaimId(c.id)}
                data-testid="submit-proof-btn-mobile"
              >
                Submit Proof
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
