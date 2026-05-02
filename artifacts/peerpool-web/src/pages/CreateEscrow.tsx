import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEscrow, useListManifests } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { getListEscrowsQueryKey } from "@workspace/api-client-react";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  chain: z.string().min(1, "Chain is required"),
  token: z.string().min(42, "Valid token address required"),
  totalAmount: z.string().min(1, "Amount is required"),
  creatorAddress: z.string().min(42, "Valid address required"),
  manifestId: z.string().min(1, "Manifest is required"),
});

type FormData = z.infer<typeof schema>;

const CHAINS = ["ethereum", "arbitrum", "optimism", "polygon", "base"];

export function CreateEscrow() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: manifests } = useListManifests({ limit: 50, offset: 0 });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { mutate, isPending, error } = useCreateEscrow({
    mutation: {
      onSuccess: (escrow) => {
        queryClient.invalidateQueries({ queryKey: getListEscrowsQueryKey() });
        setLocation(`/escrows/${escrow.id}`);
      },
    },
  });

  function onSubmit(data: FormData) {
    mutate({ data });
  }

  const selectedChain = watch("chain");
  const selectedManifest = watch("manifestId");

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/escrows">
        <a className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Escrows
        </a>
      </Link>
      <PageHeader title="Create Escrow" description="Initialize a new multi-party escrow" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="create-escrow-form">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div>
            <Label className="text-xs text-slate-400 mb-1.5">Title *</Label>
            <Input
              {...register("title")}
              placeholder="Smart Contract Audit"
              className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
              data-testid="title-input"
            />
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <Label className="text-xs text-slate-400 mb-1.5">Description</Label>
            <Input
              {...register("description")}
              placeholder="Optional description..."
              className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
              data-testid="description-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Chain *</Label>
              <Select value={selectedChain} onValueChange={(v) => setValue("chain", v)}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200" data-testid="chain-select">
                  <SelectValue placeholder="Select chain" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {CHAINS.map((c) => (
                    <SelectItem key={c} value={c} className="text-slate-200">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.chain && <p className="text-xs text-red-400 mt-1">{errors.chain.message}</p>}
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Token Address *</Label>
              <Input
                {...register("token")}
                placeholder="0x..."
                className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                data-testid="token-input"
              />
              {errors.token && <p className="text-xs text-red-400 mt-1">{errors.token.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Total Amount (smallest unit) *</Label>
              <Input
                {...register("totalAmount")}
                placeholder="1000000000"
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
                data-testid="amount-input"
              />
              {errors.totalAmount && <p className="text-xs text-red-400 mt-1">{errors.totalAmount.message}</p>}
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Creator Address *</Label>
              <Input
                {...register("creatorAddress")}
                placeholder="0x..."
                className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                data-testid="creator-input"
              />
              {errors.creatorAddress && <p className="text-xs text-red-400 mt-1">{errors.creatorAddress.message}</p>}
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-400 mb-1.5">Manifest *</Label>
            <Select value={selectedManifest} onValueChange={(v) => setValue("manifestId", v)}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200" data-testid="manifest-select">
                <SelectValue placeholder="Select outcome manifest" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {manifests?.items?.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-slate-200">
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.manifestId && <p className="text-xs text-red-400 mt-1">{errors.manifestId.message}</p>}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2">
            Failed to create escrow. Please check your inputs and try again.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/escrows">
            <Button type="button" variant="outline" className="border-slate-700 text-slate-400">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
            data-testid="submit-btn"
          >
            {isPending ? "Creating..." : "Create Escrow"}
          </Button>
        </div>
      </form>
    </div>
  );
}
