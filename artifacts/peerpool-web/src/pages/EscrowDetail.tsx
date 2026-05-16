import { useState } from "react";
import type { FormEvent } from "react";
import { useParams, Link } from "wouter";
import {
  useAddParticipant,
  useGetEscrow,
  useListParticipants,
  useListVotes,
  useListClaims,
  getGetEscrowQueryKey,
  getListParticipantsQueryKey,
  getListVotesQueryKey,
  getListClaimsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { StateBadge } from "@/components/StateBadge";
import { AddressBadge } from "@/components/AddressBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/lib/wallet";
import { ArrowLeft, Users, Vote, Coins, AlertTriangle, GitBranch, Loader2, Plus } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/\//g, "/");
type ParticipantRoleValue = "depositor" | "beneficiary" | "arbitrator" | "observer";

const PARTICIPANT_ROLES: Array<{ value: ParticipantRoleValue; label: string }> = [
  { value: "beneficiary", label: "Can receive payout" },
  { value: "depositor", label: "Depositor" },
  { value: "arbitrator", label: "Arbitrator" },
  { value: "observer", label: "Observer" },
];

function parseParticipantAddresses(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function EscrowDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { sessionToken } = useWallet();
  const [participantAddresses, setParticipantAddresses] = useState("");
  const [participantRole, setParticipantRole] = useState<ParticipantRoleValue>("beneficiary");
  const [participantFundedAmount, setParticipantFundedAmount] = useState("");
  const [participantFormError, setParticipantFormError] = useState<string | null>(null);

  const { data: escrow, isLoading } = useGetEscrow(id!, {
    query: { enabled: !!id, queryKey: getGetEscrowQueryKey(id!) },
  });
  const { data: participants } = useListParticipants(id!, {
    query: { enabled: !!id, queryKey: getListParticipantsQueryKey(id!) },
  });
  const { data: votes } = useListVotes(id!, {
    query: { enabled: !!id, queryKey: getListVotesQueryKey(id!) },
  });
  const { data: claims } = useListClaims(id!, {
    query: { enabled: !!id, queryKey: getListClaimsQueryKey(id!) },
  });

  const { mutate: generateSettlement, isPending: settling, data: settlementResult } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/escrows/${id}/settlement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
      queryClient.invalidateQueries({ queryKey: getListClaimsQueryKey(id!) });
    },
  });
  const { mutateAsync: addParticipant, isPending: addingParticipant, error: addParticipantError } = useAddParticipant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
      },
    },
  });

  async function submitParticipants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;

    const addresses = parseParticipantAddresses(participantAddresses);
    const invalid = addresses.find((address) => !/^0x[a-fA-F0-9]{40}$/.test(address));

    if (!sessionToken) {
      setParticipantFormError("Connect your wallet before adding participants.");
      return;
    }
    if (!addresses.length) {
      setParticipantFormError("Paste at least one participant wallet address.");
      return;
    }
    if (invalid) {
      setParticipantFormError(`This address does not look valid: ${invalid}`);
      return;
    }

    setParticipantFormError(null);
    for (const address of addresses) {
      await addParticipant({
        id,
        data: {
          address,
          role: participantRole,
          fundedAmount: participantFundedAmount.trim() || undefined,
        },
      });
    }
    setParticipantAddresses("");
    setParticipantFundedAmount("");
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-64" />
        <div className="h-32 bg-slate-800 rounded animate-pulse w-full" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="p-6">
        <EmptyState title="Escrow not found" description="This escrow does not exist or has been removed." />
      </div>
    );
  }

  const canSettle = (escrow.state === "active" || escrow.state === "disputed") && (claims?.items?.length ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <Link href="/escrows" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3" data-testid="back-btn">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Escrows
        </Link>
        <PageHeader title={escrow.title} description={escrow.description ?? undefined} action={<StateBadge state={escrow.state} />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Chain</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{escrow.chain}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Token</p>
          <AddressBadge address={escrow.token} className="mt-1" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total Amount</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{formatAmount(escrow.totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Funded</p>
          <p className="text-sm font-medium text-slate-200 mt-1">{formatAmount(escrow.fundedAmount ?? "0")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Creator</p>
          <AddressBadge address={escrow.creatorAddress} className="mt-1" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Created</p>
          <p className="text-sm text-slate-200 mt-1">{formatDate(escrow.createdAt)}</p>
        </div>
        {escrow.deadline && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Deadline</p>
            <p className="text-sm text-slate-200 mt-1">{formatDate(escrow.deadline)}</p>
          </div>
        )}
      </div>

      {escrow.contractAddress && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 mb-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Contract Address</p>
          <AddressBadge address={escrow.contractAddress} full className="mt-1" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {escrow.state === "funded" && (
          <Link href={`/disputes?escrow=${id}`}>
            <Button size="sm" variant="outline" className="border-amber-700 text-amber-400 hover:bg-amber-900/20 gap-1.5" data-testid="open-dispute-btn">
              <AlertTriangle className="w-3.5 h-3.5" />
              Open Dispute
            </Button>
          </Link>
        )}
        {(escrow.state === "active" || escrow.state === "settled") && (
          <Link href={`/claims?escrow=${id}`}>
            <Button size="sm" variant="outline" className="border-violet-700 text-violet-400 hover:bg-violet-900/20 gap-1.5" data-testid="claim-btn">
              <Coins className="w-3.5 h-3.5" />
              Submit Claim
            </Button>
          </Link>
        )}
        {canSettle && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateSettlement()}
            disabled={settling}
            className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/20 gap-1.5"
            data-testid="generate-settlement-btn"
          >
            {settling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Computing…
              </>
            ) : (
              <>
                <GitBranch className="w-3.5 h-3.5" />
                Generate Settlement
              </>
            )}
          </Button>
        )}
      </div>

      {settlementResult && (
        <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-4 py-4 mb-4" data-testid="settlement-result">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Settlement Root Generated</p>
          <p className="text-xs font-mono text-emerald-300 break-all">{settlementResult.merkleRoot}</p>
          <p className="text-xs text-slate-500 mt-1">{settlementResult.claimCount} claim{settlementResult.claimCount !== 1 ? "s" : ""} included · Escrow marked as settled</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">Participants ({participants?.items?.length ?? 0})</span>
            </div>
          </div>

          <form onSubmit={submitParticipants} className="border-b border-slate-800/60 p-4 space-y-3" data-testid="add-participants-form">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_180px] gap-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Participant wallets</Label>
                <Textarea
                  value={participantAddresses}
                  onChange={(event) => setParticipantAddresses(event.target.value)}
                  placeholder="Paste one or many 0x wallet addresses"
                  className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600 min-h-[74px]"
                  data-testid="participant-addresses-input"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Role</Label>
                <Select value={participantRole} onValueChange={(value) => setParticipantRole(value as ParticipantRoleValue)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200" data-testid="participant-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {PARTICIPANT_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value} className="text-slate-200">
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Recorded contribution</Label>
                <Input
                  value={participantFundedAmount}
                  onChange={(event) => setParticipantFundedAmount(event.target.value)}
                  placeholder="Optional"
                  className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                  data-testid="participant-funded-amount-input"
                />
              </div>
            </div>
            {(participantFormError || addParticipantError) && (
              <p className="text-xs text-red-400 rounded-md border border-red-800/60 bg-red-900/20 px-3 py-2">
                {participantFormError ?? "Could not add participants. Check your wallet connection and try again."}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={addingParticipant}
                className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                data-testid="add-participants-btn"
              >
                {addingParticipant ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {addingParticipant ? "Adding..." : "Add Participants"}
              </Button>
            </div>
          </form>

          <div className="divide-y divide-slate-800/60">
            {!participants?.items?.length ? (
              <EmptyState icon={Users} title="No participants yet" description="Paste wallet addresses above to build the escrow roster." />
            ) : (
              participants?.items?.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3" data-testid="participant-row">
                  <AddressBadge address={p.address} />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{p.role}</span>
                    {p.fundedAmount && p.fundedAmount !== "0" && (
                      <span className="text-xs text-slate-400">{formatAmount(p.fundedAmount)}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Vote className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Votes & Tally</span>
          </div>
          {votes?.tally && votes.tally.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/60">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Outcome Tally</p>
              <div className="flex gap-3 flex-wrap">
                {votes.tally.map((t) => (
                  <div key={t.outcomeIndex} className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400">{t.outcomeLabel ?? `Outcome ${t.outcomeIndex}`}</span>
                    <span className="font-semibold text-indigo-300">{t.voteCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-800/60">
            {!votes?.items?.length ? (
              <EmptyState icon={Vote} title="No votes yet" />
            ) : (
              votes?.items?.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-4 py-3" data-testid="vote-row">
                  <AddressBadge address={v.voterAddress} />
                  <span className="text-xs text-slate-400">{v.outcomeLabel ?? `Outcome ${v.outcomeIndex}`}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Coins className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Claims ({claims?.items?.length ?? 0})</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {!claims?.items?.length ? (
              <EmptyState icon={Coins} title="No claims yet" />
            ) : (
              claims?.items?.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3" data-testid="claim-row">
                  <AddressBadge address={c.claimantAddress} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatAmount(c.amount)}</span>
                    <StateBadge state={c.state} type="claim" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
