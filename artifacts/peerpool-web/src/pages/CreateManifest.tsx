import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateManifest } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { getListManifestsQueryKey } from "@workspace/api-client-react";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  createdBy: z.string().min(42, "Valid address required"),
  ipfsHash: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Outcome {
  index: number;
  label: string;
  description: string;
  distributionBps: number;
}

export function CreateManifest() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [conditions, setConditions] = useState<string[]>([""]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([
    { index: 0, label: "", description: "", distributionBps: 10000 },
    { index: 1, label: "", description: "", distributionBps: 0 },
  ]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { mutate, isPending, error } = useCreateManifest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManifestsQueryKey() });
        setLocation("/manifests");
      },
    },
  });

  function onSubmit(data: FormData) {
    mutate({
      data: {
        ...data,
        conditions: conditions.filter(Boolean),
        outcomes,
      },
    });
  }

  function addCondition() {
    setConditions((c) => [...c, ""]);
  }

  function removeCondition(i: number) {
    setConditions((c) => c.filter((_, idx) => idx !== i));
  }

  function updateCondition(i: number, value: string) {
    setConditions((c) => c.map((cond, idx) => (idx === i ? value : cond)));
  }

  function addOutcome() {
    setOutcomes((o) => [
      ...o,
      { index: o.length, label: "", description: "", distributionBps: 0 },
    ]);
  }

  function removeOutcome(i: number) {
    setOutcomes((o) => o.filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, index: idx })));
  }

  function updateOutcome(i: number, field: keyof Outcome, value: string | number) {
    setOutcomes((o) => o.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/manifests">
        <a className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Manifests
        </a>
      </Link>
      <PageHeader title="Register Manifest" description="Define outcome conditions for escrows" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="create-manifest-form">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div>
            <Label className="text-xs text-slate-400 mb-1.5">Title *</Label>
            <Input
              {...register("title")}
              placeholder="Freelance Development Escrow"
              className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
              data-testid="title-input"
            />
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <Label className="text-xs text-slate-400 mb-1.5">Description</Label>
            <Input
              {...register("description")}
              placeholder="What does this manifest govern?"
              className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
              data-testid="description-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Created By Address *</Label>
              <Input
                {...register("createdBy")}
                placeholder="0x..."
                className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                data-testid="creator-input"
              />
              {errors.createdBy && <p className="text-xs text-red-400 mt-1">{errors.createdBy.message}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5">IPFS Hash (optional)</Label>
              <Input
                {...register("ipfsHash")}
                placeholder="QmHash..."
                className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                data-testid="ipfs-input"
              />
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Conditions</p>
            <Button type="button" size="sm" variant="outline" className="border-slate-700 text-slate-400 h-7 text-xs gap-1" onClick={addCondition} data-testid="add-condition-btn">
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={cond}
                  onChange={(e) => updateCondition(i, e.target.value)}
                  placeholder={`Condition ${i + 1}`}
                  className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                  data-testid={`condition-input-${i}`}
                />
                {conditions.length > 1 && (
                  <Button type="button" size="sm" variant="outline" className="border-slate-700 text-red-400 h-9 w-9 p-0 flex-shrink-0" onClick={() => removeCondition(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Outcomes */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Outcomes</p>
            <Button type="button" size="sm" variant="outline" className="border-slate-700 text-slate-400 h-7 text-xs gap-1" onClick={addOutcome} data-testid="add-outcome-btn">
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
          <div className="space-y-3">
            {outcomes.map((outcome, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_80px] gap-2 items-start">
                <div className="w-7 h-9 flex items-center justify-center text-xs text-slate-500 font-mono">{i}</div>
                <Input
                  value={outcome.label}
                  onChange={(e) => updateOutcome(i, "label", e.target.value)}
                  placeholder="Label"
                  className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                  data-testid={`outcome-label-${i}`}
                />
                <Input
                  value={outcome.description}
                  onChange={(e) => updateOutcome(i, "description", e.target.value)}
                  placeholder="Description"
                  className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                  data-testid={`outcome-desc-${i}`}
                />
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={outcome.distributionBps}
                    onChange={(e) => updateOutcome(i, "distributionBps", parseInt(e.target.value) || 0)}
                    placeholder="BPS"
                    className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                    data-testid={`outcome-bps-${i}`}
                  />
                  {outcomes.length > 2 && (
                    <Button type="button" size="sm" variant="outline" className="border-slate-700 text-red-400 h-9 w-9 p-0 flex-shrink-0" onClick={() => removeOutcome(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-2">BPS = basis points (10000 = 100%)</p>
        </div>

        {error && (
          <p className="text-sm text-red-400 rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2">
            Failed to register manifest.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/manifests">
            <Button type="button" variant="outline" className="border-slate-700 text-slate-400">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white" data-testid="submit-btn">
            {isPending ? "Registering..." : "Register Manifest"}
          </Button>
        </div>
      </form>
    </div>
  );
}
