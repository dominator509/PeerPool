import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { makeZodResolver } from "@/lib/zodResolver";
import { useCreateEscrow, useListManifests } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/lib/wallet";
import {
  ESCROW_CREATION_CHAINS,
  decimalToBaseUnits,
  getChainConfig,
  getDefaultTokenForChain,
  isAddressLike,
  type ProtocolChainName,
} from "@workspace/protocol-config";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Coins,
  FileText,
  Link2,
  Network,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { getListEscrowsQueryKey } from "@workspace/api-client-react";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  chain: z.string().min(1, "Network is required"),
  token: z.string().min(42, "Valid token address required"),
  totalAmount: z.string().min(1, "Amount is required"),
  creatorAddress: z.string().min(42, "Valid address required"),
  manifestId: z.string().min(1, "Payout rulebook is required"),
  deadline: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type ChainId = ProtocolChainName;
type TokenMode = "usdc" | "custom";

const DEFAULT_CHAIN = "base" satisfies ChainId;

function formatOutcomePercent(bps?: number): string | null {
  if (typeof bps !== "number") return null;
  const percent = bps / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function CreateEscrow() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const { data: manifests } = useListManifests({ limit: 50, offset: 0 });
  const [selectedChain, setSelectedChain] = useState<ChainId>(DEFAULT_CHAIN);
  const [tokenMode, setTokenMode] = useState<TokenMode>("usdc");
  const [customTokenAddress, setCustomTokenAddress] = useState("");
  const [customTokenSymbol, setCustomTokenSymbol] = useState("TOKEN");
  const [customTokenDecimals, setCustomTokenDecimals] = useState(18);
  const [displayAmount, setDisplayAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: makeZodResolver(schema),
    defaultValues: {
      title: "Contest escrow",
      description: "",
      chain: DEFAULT_CHAIN,
      token: getDefaultTokenForChain(DEFAULT_CHAIN)?.address ?? "",
      totalAmount: "",
      creatorAddress: "",
      manifestId: "",
      deadline: "",
    },
  });

  const selectedManifest = watch("manifestId");
  const title = watch("title");
  const description = watch("description");
  const deadline = watch("deadline");
  const creatorAddress = watch("creatorAddress");
  const selectedManifestDetails = manifests?.items?.find((manifest) => manifest.id === selectedManifest);
  const selectedChainInfo = getChainConfig(selectedChain) ?? getChainConfig(DEFAULT_CHAIN)!;
  const defaultToken = getDefaultTokenForChain(selectedChain) ?? getDefaultTokenForChain(DEFAULT_CHAIN)!;
  const selectedToken = tokenMode === "usdc"
    ? defaultToken
    : {
        symbol: customTokenSymbol.trim() || "TOKEN",
        name: "Custom ERC-20",
        address: customTokenAddress.trim(),
        decimals: customTokenDecimals,
      };
  const convertedAmount = useMemo(
    () => decimalToBaseUnits(displayAmount, selectedToken.decimals),
    [displayAmount, selectedToken.decimals],
  );
  const tokenAddressInvalid = tokenMode === "custom" && customTokenAddress.length > 0 && !isAddressLike(selectedToken.address);
  const canCreate =
    !!selectedManifest &&
    !!creatorAddress &&
    isAddressLike(selectedToken.address) &&
    !!convertedAmount.value &&
    !convertedAmount.error;

  const { mutate, isPending, error } = useCreateEscrow({
    mutation: {
      onSuccess: (escrow) => {
        queryClient.invalidateQueries({ queryKey: getListEscrowsQueryKey() });
        setLocation(`/escrows/${escrow.id}`);
      },
    },
  });

  useEffect(() => {
    if (address) {
      setValue("creatorAddress", address, { shouldValidate: true });
    }
  }, [address, setValue]);

  useEffect(() => {
    setValue("chain", selectedChain, { shouldValidate: true });
    setValue("token", selectedToken.address, { shouldValidate: true });
    if (convertedAmount.value) {
      setValue("totalAmount", convertedAmount.value, { shouldValidate: true });
    } else {
      setValue("totalAmount", "", { shouldValidate: true });
    }
  }, [convertedAmount.value, selectedChain, selectedToken.address, setValue]);

  function chooseChain(chainId: ChainId) {
    setSelectedChain(chainId);
    setFormError(null);
  }

  function onSubmit(data: FormData) {
    if (convertedAmount.error || !convertedAmount.value) {
      setFormError(convertedAmount.error ?? "Enter the escrow amount.");
      return;
    }
    if (!isAddressLike(selectedToken.address)) {
      setFormError("Enter a valid ERC-20 token contract address.");
      return;
    }

    setFormError(null);
    mutate({
      data: {
        title: data.title,
        description: data.description?.trim() || undefined,
        chain: selectedChain,
        token: selectedToken.address,
        totalAmount: convertedAmount.value,
        creatorAddress: data.creatorAddress,
        manifestId: data.manifestId,
        deadline: data.deadline || undefined,
      },
    });
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <Link href="/escrows">
        <a className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Escrows
        </a>
      </Link>
      <PageHeader title="Create Escrow" description="Set the pool, funding token, rulebook, and owner wallet." />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5" data-testid="create-escrow-form">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-100">Escrow basics</h2>
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Escrow name *</Label>
              <Input
                {...register("title")}
                placeholder="Fantasy league prize pool"
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
                data-testid="title-input"
              />
              {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Plain-English purpose</Label>
              <Textarea
                {...register("description")}
                placeholder="Funds for the season prize pool. Winners are paid after final standings are confirmed."
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 min-h-[84px]"
                data-testid="description-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Owner wallet *</Label>
                <Input
                  {...register("creatorAddress")}
                  placeholder="0x..."
                  className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                  data-testid="creator-input"
                />
                {errors.creatorAddress && <p className="text-xs text-red-400 mt-1">{errors.creatorAddress.message}</p>}
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Settlement deadline</Label>
                <Input
                  {...register("deadline")}
                  type="datetime-local"
                  className="bg-slate-900 border-slate-700 text-slate-200 text-xs"
                  data-testid="deadline-input"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-100">Payout rulebook</h2>
              </div>
              <Link href="/manifests/new">
                <Button type="button" size="sm" variant="outline" className="border-slate-700 text-slate-400 h-8 text-xs">
                  Build new
                </Button>
              </Link>
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Saved manifest *</Label>
              <Select value={selectedManifest} onValueChange={(value) => setValue("manifestId", value, { shouldValidate: true })}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200" data-testid="manifest-select">
                  <SelectValue placeholder="Choose the rulebook this escrow follows" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {manifests?.items?.map((manifest) => (
                    <SelectItem key={manifest.id} value={manifest.id} className="text-slate-200">
                      {manifest.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.manifestId && <p className="text-xs text-red-400 mt-1">{errors.manifestId.message}</p>}
              {!manifests?.items?.length && (
                <p className="text-xs text-slate-500 mt-2">
                  Build a payout rulebook first, then return here to attach it to the escrow.
                </p>
              )}
            </div>

            {selectedManifestDetails && Array.isArray(selectedManifestDetails.outcomes) && selectedManifestDetails.outcomes.length > 0 && (
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-2">Payout results</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(selectedManifestDetails.outcomes as Array<{ index: number; label: string; distributionBps?: number }>).map((outcome) => {
                    const payout = formatOutcomePercent(outcome.distributionBps);
                    return (
                      <span key={outcome.index} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {outcome.label}{payout ? ` - ${payout}` : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-100">Network</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
              {ESCROW_CREATION_CHAINS.map((chain) => {
                const isActive = selectedChain === chain.name;
                return (
                  <button
                    key={chain.name}
                    type="button"
                    onClick={() => chooseChain(chain.name)}
                    className={`text-left rounded-lg border p-3 min-h-[92px] transition-colors ${
                      isActive
                        ? "border-indigo-500/80 bg-indigo-500/10 text-slate-100"
                        : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700"
                    }`}
                    data-testid={`chain-${chain.name}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium">{chain.label}</span>
                      {isActive && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{chain.uiNote}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-100">Funding token and amount</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTokenMode("usdc")}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  tokenMode === "usdc"
                    ? "border-indigo-500/80 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                }`}
                data-testid="token-usdc"
              >
                <p className="text-sm font-medium text-slate-100">USDC</p>
                <p className="text-xs text-slate-500 mt-1">{defaultToken.name} on {selectedChainInfo.label}</p>
                <p className="text-[11px] font-mono text-slate-600 mt-2">{formatAddress(defaultToken.address)}</p>
              </button>
              <button
                type="button"
                onClick={() => setTokenMode("custom")}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  tokenMode === "custom"
                    ? "border-indigo-500/80 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                }`}
                data-testid="token-custom"
              >
                <p className="text-sm font-medium text-slate-100">Custom ERC-20</p>
                <p className="text-xs text-slate-500 mt-1">Use another token contract on the selected network.</p>
                <p className="text-[11px] text-slate-600 mt-2">{tokenMode === "custom" && customTokenAddress ? formatAddress(customTokenAddress) : "Contract address required"}</p>
              </button>
            </div>

            {tokenMode === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px_120px] gap-3">
                <div>
                  <Label className="text-xs text-slate-400 mb-1.5">Token contract address *</Label>
                  <Input
                    value={customTokenAddress}
                    onChange={(event) => setCustomTokenAddress(event.target.value)}
                    placeholder="0x..."
                    className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                    data-testid="token-input"
                  />
                  {tokenAddressInvalid && <p className="text-xs text-red-400 mt-1">Enter a valid ERC-20 address.</p>}
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-1.5">Symbol</Label>
                  <Input
                    value={customTokenSymbol}
                    onChange={(event) => setCustomTokenSymbol(event.target.value)}
                    className="bg-slate-900 border-slate-700 text-slate-200 text-xs"
                    data-testid="token-symbol-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-1.5">Decimals</Label>
                  <Input
                    type="number"
                    min={0}
                    max={36}
                    value={customTokenDecimals}
                    onChange={(event) => setCustomTokenDecimals(Math.max(0, Math.min(36, Number.parseInt(event.target.value, 10) || 0)))}
                    className="bg-slate-900 border-slate-700 text-slate-200 text-xs"
                    data-testid="token-decimals-input"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)] gap-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Total pool amount *</Label>
                <Input
                  value={displayAmount}
                  onChange={(event) => setDisplayAmount(event.target.value)}
                  placeholder="1200"
                  inputMode="decimal"
                  className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
                  data-testid="amount-input"
                />
                {displayAmount && convertedAmount.error && <p className="text-xs text-red-400 mt-1">{convertedAmount.error}</p>}
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
                <p className="text-[11px] text-slate-600 uppercase tracking-wider">Stored amount</p>
                <p className="text-xs text-slate-300 font-mono break-all mt-1">{convertedAmount.value ?? "Waiting for amount"}</p>
              </div>
            </div>

            <input type="hidden" {...register("chain")} />
            <input type="hidden" {...register("token")} />
            <input type="hidden" {...register("totalAmount")} />
            {errors.chain && <p className="text-xs text-red-400">{errors.chain.message}</p>}
            {errors.token && <p className="text-xs text-red-400">{errors.token.message}</p>}
            {errors.totalAmount && <p className="text-xs text-red-400">{errors.totalAmount.message}</p>}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 h-fit rounded-lg border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">Escrow preview</p>
              <p className="text-xs text-slate-500 mt-1">Review the setup before creating it.</p>
            </div>
            <span className={`text-[11px] rounded-full px-2 py-1 border ${canCreate ? "border-emerald-800 text-emerald-300 bg-emerald-950/30" : "border-slate-800 text-slate-500 bg-slate-950/50"}`}>
              {canCreate ? "Ready" : "Draft"}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Name</p>
              <p className="text-sm text-slate-200">{title || "Untitled escrow"}</p>
              {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Network className="w-3.5 h-3.5" />
                  <p className="text-[11px] uppercase tracking-wider">Network</p>
                </div>
                <p className="text-sm font-medium text-slate-100 mt-1">{selectedChainInfo.label}</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Coins className="w-3.5 h-3.5" />
                  <p className="text-[11px] uppercase tracking-wider">Token</p>
                </div>
                <p className="text-sm font-medium text-slate-100 mt-1">{selectedToken.symbol}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-[11px] text-slate-600 uppercase tracking-wider">Total pool</p>
              <p className="text-lg font-semibold text-slate-100 mt-1">
                {displayAmount || "0"} {selectedToken.symbol}
              </p>
              <p className="text-[11px] font-mono text-slate-600 mt-1 break-all">{selectedToken.address || "No token selected"}</p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <p className="text-[11px] uppercase tracking-wider">Rulebook</p>
              </div>
              {selectedManifestDetails ? (
                <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-sm font-medium text-slate-200">{selectedManifestDetails.title}</p>
                  {selectedManifestDetails.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{selectedManifestDetails.description}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No payout rulebook selected.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <WalletCards className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
                <span>{creatorAddress ? formatAddress(creatorAddress) : "Owner wallet needed"}</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <CalendarClock className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
                <span>{deadline || "No deadline set"}</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <Link2 className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
                <span>{convertedAmount.value ? `${convertedAmount.value} base units` : "Amount conversion pending"}</span>
              </div>
            </div>
          </div>

          {(formError || error) && (
            <p className="text-sm text-red-400 rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 mt-4">
              {formError ?? "Failed to create escrow. Connect your wallet and check the fields."}
            </p>
          )}

          <div className="flex flex-col gap-2 mt-5">
            <Button type="submit" disabled={isPending || !canCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white w-full" data-testid="submit-btn">
              {isPending ? "Creating..." : "Create Escrow"}
            </Button>
            <Link href="/escrows">
              <Button type="button" variant="outline" className="border-slate-700 text-slate-400 w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
