import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { makeZodResolver } from "@/lib/zodResolver";
import { useCreateManifest } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/lib/wallet";
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileText,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getListManifestsQueryKey } from "@workspace/api-client-react";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  createdBy: z.string().min(42, "Valid address required"),
  ipfsHash: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type TemplateId = "contest" | "milestone" | "approval" | "custom";

interface Outcome {
  index: number;
  label: string;
  description: string;
  distributionBps: number;
}

interface ManifestTemplate {
  id: TemplateId;
  label: string;
  summary: string;
  icon: LucideIcon;
  title: string;
  description: string;
  conditions: string[];
  outcomes: Outcome[];
}

const contestOutcomes: Outcome[] = [
  { index: 0, label: "1st place", description: "Highest final ranking", distributionBps: 5000 },
  { index: 1, label: "2nd place", description: "Second highest final ranking", distributionBps: 3000 },
  { index: 2, label: "3rd place", description: "Third highest final ranking", distributionBps: 2000 },
];

const templates: ManifestTemplate[] = [
  {
    id: "contest",
    label: "Contest payout",
    summary: "Leagues, pools, competitions, hackathons",
    icon: Trophy,
    title: "Contest prize payout",
    description: "Defines how pooled funds are paid after final standings are confirmed.",
    conditions: [
      "Final standings are published by the agreed source.",
      "Winner identity and wallet ownership are confirmed before settlement.",
      "Ties, scoring changes, or disputes are resolved before payouts are released.",
    ],
    outcomes: contestOutcomes,
  },
  {
    id: "milestone",
    label: "Milestone work",
    summary: "Freelance jobs, deliverables, phased work",
    icon: ShieldCheck,
    title: "Milestone delivery escrow",
    description: "Defines when funds release for accepted work, revisions, or cancellation.",
    conditions: [
      "The deliverable is submitted through the agreed review channel.",
      "The reviewer accepts the milestone or opens a dispute before the review deadline.",
      "Refunds or revisions follow the written scope agreed by all parties.",
    ],
    outcomes: [
      { index: 0, label: "Accepted", description: "Release the escrowed funds", distributionBps: 10000 },
      { index: 1, label: "Needs revision", description: "Keep funds locked until the next review", distributionBps: 0 },
      { index: 2, label: "Cancelled", description: "Refund or move to dispute resolution", distributionBps: 0 },
    ],
  },
  {
    id: "approval",
    label: "Simple approval",
    summary: "Yes/no settlement with one reviewer",
    icon: WalletCards,
    title: "Approval-based escrow",
    description: "Defines a straightforward approve, reject, or dispute settlement path.",
    conditions: [
      "The reviewer checks the evidence attached to the escrow.",
      "Approval releases funds according to the payout slot.",
      "A rejected or unclear result moves to the agreed dispute process.",
    ],
    outcomes: [
      { index: 0, label: "Approved", description: "Release funds", distributionBps: 10000 },
      { index: 1, label: "Rejected", description: "Do not release funds yet", distributionBps: 0 },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    summary: "Start plain and shape your own rules",
    icon: FileText,
    title: "",
    description: "",
    conditions: [""],
    outcomes: [{ index: 0, label: "Primary payout", description: "Funds released when the rule is met", distributionBps: 10000 }],
  },
];

const payoutPresets = [
  { id: "50-30-20", label: "50 / 30 / 20", values: [5000, 3000, 2000] },
  { id: "60-30-10", label: "60 / 30 / 10", values: [6000, 3000, 1000] },
  { id: "70-20-10", label: "70 / 20 / 10", values: [7000, 2000, 1000] },
  { id: "equal", label: "Equal split", values: [] },
];

function cloneOutcomes(outcomes: Outcome[]): Outcome[] {
  return outcomes.map((outcome, index) => ({ ...outcome, index }));
}

function ordinalLabel(index: number): string {
  const labels = ["1st place", "2nd place", "3rd place"];
  return labels[index] ?? `${index + 1}th place`;
}

function equalDistribution(count: number): number[] {
  const safeCount = Math.max(1, count);
  const base = Math.floor(10000 / safeCount);
  let remainder = 10000 - base * safeCount;
  return Array.from({ length: safeCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function formatPercent(bps: number): string {
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/\.?0+$/, "");
}

function percentToBps(value: string): number {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent * 100)));
}

function normalizeOutcome(outcome: Outcome, index: number): Outcome {
  return {
    index,
    label: outcome.label.trim(),
    description: outcome.description.trim(),
    distributionBps: Math.max(0, Math.min(10000, Math.round(outcome.distributionBps))),
  };
}

function getPresetDistribution(presetId: string, count: number): number[] {
  const preset = payoutPresets.find((item) => item.id === presetId);
  if (!preset || preset.id === "equal") return equalDistribution(count);
  if (preset.values.length === count) return preset.values;
  return equalDistribution(count);
}

const defaultTemplate = templates[0];

export function CreateManifest() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(defaultTemplate.id);
  const [participantCount, setParticipantCount] = useState(12);
  const [activePreset, setActivePreset] = useState("50-30-20");
  const [conditions, setConditions] = useState<string[]>(defaultTemplate.conditions);
  const [outcomes, setOutcomes] = useState<Outcome[]>(cloneOutcomes(defaultTemplate.outcomes));
  const [builderError, setBuilderError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: makeZodResolver(schema),
    defaultValues: {
      title: defaultTemplate.title,
      description: defaultTemplate.description,
      createdBy: "",
      ipfsHash: "",
    },
  });

  useEffect(() => {
    if (address) {
      setValue("createdBy", address, { shouldValidate: true });
    }
  }, [address, setValue]);

  const { mutate, isPending, error } = useCreateManifest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManifestsQueryKey() });
        setLocation("/manifests");
      },
    },
  });

  const title = watch("title");
  const description = watch("description");
  const cleanOutcomes = useMemo(
    () => outcomes.map(normalizeOutcome).filter((outcome) => outcome.label.length > 0),
    [outcomes],
  );
  const payoutTotalBps = useMemo(
    () => cleanOutcomes.reduce((total, outcome) => total + outcome.distributionBps, 0),
    [cleanOutcomes],
  );
  const cleanConditions = useMemo(
    () => conditions.map((condition) => condition.trim()).filter(Boolean),
    [conditions],
  );
  const generatedConditions = useMemo(() => {
    if (selectedTemplate !== "contest") return [];
    return [
      `Expected participant count: ${participantCount}.`,
      `Paid positions: ${outcomes.length}.`,
    ];
  }, [outcomes.length, participantCount, selectedTemplate]);
  const previewConditions = [...generatedConditions, ...cleanConditions];
  const payoutTotalLabel = `${formatPercent(payoutTotalBps)}%`;
  const hasBuilderIssue =
    cleanOutcomes.length === 0 ||
    cleanOutcomes.some((outcome) => !outcome.label) ||
    previewConditions.length === 0 ||
    payoutTotalBps !== 10000;

  function applyTemplate(templateId: TemplateId) {
    const template = templates.find((item) => item.id === templateId) ?? defaultTemplate;
    setSelectedTemplate(template.id);
    setValue("title", template.title, { shouldDirty: true, shouldValidate: true });
    setValue("description", template.description, { shouldDirty: true });
    setConditions(template.conditions);
    setOutcomes(cloneOutcomes(template.outcomes));
    setBuilderError(null);
    if (template.id === "contest") {
      setParticipantCount(12);
      setActivePreset("50-30-20");
    } else {
      setActivePreset("equal");
    }
  }

  function onSubmit(data: FormData) {
    const normalizedOutcomes = outcomes.map(normalizeOutcome).filter((outcome) => outcome.label);
    const manifestConditions = [...generatedConditions, ...cleanConditions];

    if (!normalizedOutcomes.length) {
      setBuilderError("Add at least one payout result before saving.");
      return;
    }
    if (!manifestConditions.length) {
      setBuilderError("Add at least one settlement rule before saving.");
      return;
    }
    if (normalizedOutcomes.reduce((total, outcome) => total + outcome.distributionBps, 0) !== 10000) {
      setBuilderError("Payout percentages must add up to 100%.");
      return;
    }

    setBuilderError(null);
    mutate({
      data: {
        ...data,
        description: data.description?.trim() || undefined,
        conditions: manifestConditions,
        outcomes: normalizedOutcomes,
      },
    });
  }

  function addCondition() {
    setConditions((current) => [...current, ""]);
  }

  function removeCondition(index: number) {
    setConditions((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateCondition(index: number, value: string) {
    setConditions((current) => current.map((condition, currentIndex) => (currentIndex === index ? value : condition)));
  }

  function addOutcome() {
    setOutcomes((current) => [
      ...current,
      {
        index: current.length,
        label: selectedTemplate === "contest" ? ordinalLabel(current.length) : `Outcome ${current.length + 1}`,
        description: selectedTemplate === "contest" ? "Paid position" : "",
        distributionBps: 0,
      },
    ]);
    setActivePreset("custom");
  }

  function removeOutcome(index: number) {
    setOutcomes((current) => current.filter((_, currentIndex) => currentIndex !== index).map((outcome, nextIndex) => ({ ...outcome, index: nextIndex })));
    setActivePreset("custom");
  }

  function updateOutcome(index: number, field: keyof Outcome, value: string | number) {
    setOutcomes((current) => current.map((outcome, currentIndex) => (currentIndex === index ? { ...outcome, [field]: value } : outcome)));
    if (field === "distributionBps") setActivePreset("custom");
  }

  function updatePaidPositions(value: string) {
    const count = Math.max(1, Math.min(12, Number.parseInt(value, 10) || 1));
    setOutcomes((current) => {
      const distribution = equalDistribution(count);
      const next = Array.from({ length: count }, (_, index) => {
        const existing = current[index];
        return {
          index,
          label: existing?.label || ordinalLabel(index),
          description: existing?.description || "Paid position",
          distributionBps: distribution[index],
        };
      });
      return next;
    });
    setActivePreset("equal");
    setParticipantCount((current) => Math.max(current, count));
  }

  function updateParticipantCount(value: string) {
    const count = Math.max(outcomes.length, Math.min(100, Number.parseInt(value, 10) || outcomes.length));
    setParticipantCount(count);
  }

  function applyPayoutPreset(presetId: string) {
    const distribution = getPresetDistribution(presetId, outcomes.length);
    setOutcomes((current) => current.map((outcome, index) => ({ ...outcome, distributionBps: distribution[index] ?? 0 })));
    setActivePreset(presetId);
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <Link href="/manifests">
        <a className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Manifests
        </a>
      </Link>

      <PageHeader
        title="Build Manifest"
        description="Create the payout rulebook an escrow will follow at settlement."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5" data-testid="create-manifest-form">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-md bg-indigo-500/15 text-indigo-300 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Start from a real-world setup</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  A manifest is the escrow's rulebook: who can win, what must be true, and how the funds split.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
              {templates.map((template) => {
                const Icon = template.icon;
                const isActive = selectedTemplate === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className={`text-left rounded-lg border p-3 transition-colors min-h-[104px] ${
                      isActive
                        ? "border-indigo-500/80 bg-indigo-500/10 text-slate-100"
                        : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700"
                    }`}
                    data-testid={`template-${template.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Icon className={`w-4 h-4 ${isActive ? "text-indigo-300" : "text-slate-500"}`} />
                      {isActive && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
                    </div>
                    <p className="text-sm font-medium">{template.label}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{template.summary}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-100">Rulebook basics</h2>
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Manifest name *</Label>
              <Input
                {...register("title")}
                placeholder="Fantasy league payout"
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600"
                data-testid="title-input"
              />
              {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <Label className="text-xs text-slate-400 mb-1.5">Plain-English purpose</Label>
              <Textarea
                {...register("description")}
                placeholder="What situation does this escrow settle?"
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 min-h-[84px]"
                data-testid="description-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Owner wallet *</Label>
                <Input
                  {...register("createdBy")}
                  placeholder="0x..."
                  className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                  data-testid="creator-input"
                />
                {errors.createdBy && <p className="text-xs text-red-400 mt-1">{errors.createdBy.message}</p>}
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5">Optional off-chain proof link</Label>
                <Input
                  {...register("ipfsHash")}
                  placeholder="IPFS hash or reference"
                  className="bg-slate-900 border-slate-700 text-slate-200 font-mono text-xs placeholder:text-slate-600"
                  data-testid="ipfs-input"
                />
              </div>
            </div>
          </section>

          {selectedTemplate === "contest" && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-100">Participants and prizes</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-400 mb-1.5">Expected participants</Label>
                  <Input
                    type="number"
                    min={outcomes.length}
                    max={100}
                    value={participantCount}
                    onChange={(event) => updateParticipantCount(event.target.value)}
                    className="bg-slate-900 border-slate-700 text-slate-200"
                    data-testid="participant-count-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400 mb-1.5">Paid positions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={outcomes.length}
                    onChange={(event) => updatePaidPositions(event.target.value)}
                    className="bg-slate-900 border-slate-700 text-slate-200"
                    data-testid="paid-positions-input"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-400 mb-2">Common prize splits</Label>
                <div className="flex flex-wrap gap-2">
                  {payoutPresets.map((preset) => {
                    const canApply = preset.id === "equal" || preset.values.length === outcomes.length;
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canApply}
                        className={`border-slate-700 h-8 text-xs ${
                          activePreset === preset.id
                            ? "bg-indigo-500/15 text-indigo-200 border-indigo-500/70"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                        onClick={() => applyPayoutPreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-100">Settlement rules</h2>
              </div>
              <Button type="button" size="sm" variant="outline" className="border-slate-700 text-slate-400 h-8 text-xs gap-1" onClick={addCondition} data-testid="add-condition-btn">
                <Plus className="w-3 h-3" /> Add rule
              </Button>
            </div>

            {generatedConditions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {generatedConditions.map((condition) => (
                  <div key={condition} className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
                    {condition}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex gap-2">
                  <Textarea
                    value={condition}
                    onChange={(event) => updateCondition(index, event.target.value)}
                    placeholder={`Rule ${index + 1}`}
                    className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600 min-h-[68px]"
                    data-testid={`condition-input-${index}`}
                  />
                  {conditions.length > 1 && (
                    <Button type="button" size="sm" variant="outline" className="border-slate-700 text-red-400 h-9 w-9 p-0 flex-shrink-0" onClick={() => removeCondition(index)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-100">Payout results</h2>
              </div>
              <Button type="button" size="sm" variant="outline" className="border-slate-700 text-slate-400 h-8 text-xs gap-1" onClick={addOutcome} data-testid="add-outcome-btn">
                <Plus className="w-3 h-3" /> Add result
              </Button>
            </div>

            <div className="space-y-3">
              {outcomes.map((outcome, index) => (
                <div key={index} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_104px_auto] gap-2 items-start">
                    <div>
                      <Label className="text-[11px] text-slate-500 mb-1">Result name</Label>
                      <Input
                        value={outcome.label}
                        onChange={(event) => updateOutcome(index, "label", event.target.value)}
                        placeholder="1st place"
                        className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                        data-testid={`outcome-label-${index}`}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500 mb-1">Payout %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={formatPercent(outcome.distributionBps)}
                        onChange={(event) => updateOutcome(index, "distributionBps", percentToBps(event.target.value))}
                        className="bg-slate-900 border-slate-700 text-slate-200 text-xs"
                        data-testid={`outcome-percent-${index}`}
                      />
                    </div>
                    {outcomes.length > 1 && (
                      <Button type="button" size="sm" variant="outline" className="border-slate-700 text-red-400 h-9 w-9 p-0 sm:mt-5" onClick={() => removeOutcome(index)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2">
                    <Label className="text-[11px] text-slate-500 mb-1">What this result means</Label>
                    <Input
                      value={outcome.description}
                      onChange={(event) => updateOutcome(index, "description", event.target.value)}
                      placeholder="Winner is confirmed by final standings"
                      className="bg-slate-900 border-slate-700 text-slate-200 text-xs placeholder:text-slate-600"
                      data-testid={`outcome-desc-${index}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${payoutTotalBps === 10000 ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-300" : "border-amber-900/70 bg-amber-950/30 text-amber-300"}`}>
              Payout total: {payoutTotalLabel}. It must equal 100% before this rulebook can be saved.
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 h-fit rounded-lg border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">Manifest preview</p>
              <p className="text-xs text-slate-500 mt-1">This is what gets attached to the escrow.</p>
            </div>
            <span className={`text-[11px] rounded-full px-2 py-1 border ${payoutTotalBps === 10000 ? "border-emerald-800 text-emerald-300 bg-emerald-950/30" : "border-amber-800 text-amber-300 bg-amber-950/30"}`}>
              {payoutTotalLabel}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Name</p>
              <p className="text-sm text-slate-200">{title || "Untitled manifest"}</p>
              {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
            </div>

            {selectedTemplate === "contest" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[11px] text-slate-600 uppercase tracking-wider">Participants</p>
                  <p className="text-lg font-semibold text-slate-100 mt-1">{participantCount}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[11px] text-slate-600 uppercase tracking-wider">Paid</p>
                  <p className="text-lg font-semibold text-slate-100 mt-1">{outcomes.length}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-2">Payout results</p>
              <div className="space-y-2">
                {cleanOutcomes.map((outcome) => (
                  <div key={outcome.index} className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{outcome.label}</p>
                      {outcome.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{outcome.description}</p>}
                    </div>
                    <span className="text-xs text-slate-300 flex-shrink-0">{formatPercent(outcome.distributionBps)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-2">Settlement rules</p>
              <div className="space-y-2">
                {previewConditions.map((condition, index) => (
                  <div key={`${condition}-${index}`} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
                    <span className="text-slate-600 flex-shrink-0">{index + 1}.</span>
                    <span>{condition}</span>
                  </div>
                ))}
                {previewConditions.length === 0 && <p className="text-xs text-slate-600">No rules yet.</p>}
              </div>
            </div>
          </div>

          {(builderError || error) && (
            <p className="text-sm text-red-400 rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 mt-4">
              {builderError ?? "Failed to save manifest. Connect your wallet and check the fields."}
            </p>
          )}

          <div className="flex flex-col gap-2 mt-5">
            <Button type="submit" disabled={isPending || hasBuilderIssue} className="bg-indigo-600 hover:bg-indigo-500 text-white w-full" data-testid="submit-btn">
              {isPending ? "Saving..." : "Save Manifest"}
            </Button>
            <Link href="/manifests">
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
