"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Database,
  ExternalLink,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  ShoppingBag,
  Receipt,
  Search,
  FileSpreadsheet,
  FileJson,
  Printer,
} from "lucide-react";
import { EncompassSupervisorPanel } from "./encompass-supervisor-panel";
import { SupplierAgentMatrix } from "./supplier-agent-matrix";
import { normalizeCanonicalModel } from "../services/source-tier-policy";
import { 
  getBomRowPartNumber, 
  ebaySearchUrl, 
  ebaySoldSearchUrl 
} from "../services/ebay-links";

type BomWorkflowControlPanelProps = {
  initialModel?: string;
  initialJobId?: string;
};

type BomJob = {
  id: string;
  jobStage: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  productType: string | null;
  expectedPartsTotal: number | null;
  expectedPartsSource: string | null;
  expectedPartCount: number | null;
  actualPartCount: number | null;
  actualCanonicalPartCount: number | null;
  actualUniqueParts: number | null;
  rawRowCount: number;
  uniqueRowCount: number;
  verifiedPriceCount: number | null;
  requiredPriceCount: number | null;
  unpricedCount: number | null;
  partsComplete: boolean | null;
  pricingComplete: boolean | null;
  coveragePct: number | null;
  retrievalState: string | null;
  truthSource: string | null;
  trustedTotalPartCount: number | null;
  trustedTotalCountSource: string | null;
  trustedTotalCountSourceUrl: string | null;
  bomComplete: string | null;
  errorText: string | null;
  issues: string[];
  diagramParse: Record<string, unknown> | null;
  retrievedSources: Array<Record<string, unknown>>;
  extractedRowsRaw: Array<Record<string, unknown>>;
  finalRows: Array<Record<string, unknown>>;
  updatedAt: string | Date;
};

type StepStatus = "waiting" | "active" | "filled" | "complete";

const SUPPLIERS = [
  { id: "fix.com", label: "Fix.com" },
  { id: "repairclinic-family", label: "RepairClinic" },
  { id: "appliancepartspros", label: "AppliancePartsPros" },
  { id: "sears-partsdirect", label: "Sears PartsDirect" },
] as const;

const WORKFLOW_STEPS = [
  { key: "identity", label: "Identity", detail: "Model, brand, serial, appliance type" },
  { key: "encompass_url", label: "Visual URL", detail: "Canonical Encompass or truth source URL" },
  { key: "visual_capture", label: "Visual Capture", detail: "Screenshot and assembly overview" },
  { key: "trusted_count", label: "Trusted Count", detail: "Expected total from evidence or operator" },
  { key: "supplier_targets", label: "Supplier Targets", detail: "Supplier URLs and source context" },
  { key: "supplier_runs", label: "Supplier Runs", detail: "Run each supplier agent deliberately" },
  { key: "row_evidence", label: "Row Evidence", detail: "Raw supplier rows and source records" },
  { key: "reconcile", label: "Reconcile", detail: "Merge rows, de-dupe, map against truth" },
  { key: "coverage", label: "Coverage", detail: "Compare accepted rows to trusted count" },
  { key: "pricing", label: "Pricing", detail: "Verified price coverage" },
  { key: "review", label: "Review", detail: "Issues, conflicts, manual checks" },
  { key: "export", label: "Export", detail: "Final controlled output" },
] as const;

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function valueText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${Math.round(value * 100)}%`;
}

function buildSupplierUrl(supplierId: string, model: string) {
  const encoded = encodeURIComponent(normalizeCanonicalModel(model));

  switch (supplierId) {
    case "fix.com":
      return `https://www.fix.com/search/?SearchTerm=${encoded}`;
    case "repairclinic-family":
      return `https://www.repairclinic.com/Shop-For-Parts?SearchText=${encoded}`;
    case "appliancepartspros":
      return `https://www.appliancepartspros.com/search.aspx?model=${encoded}`;
    case "sears-partsdirect":
      return `https://www.searspartsdirect.com/search?q=${encoded}`;
    default:
      return "";
  }
}

function stepClasses(status: StepStatus) {
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "filled") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "active") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-neutral-200 bg-white text-neutral-500";
}

function stepIcon(status: StepStatus) {
  if (status === "complete") return <CheckCircle2 size={16} />;
  if (status === "filled") return <ClipboardCheck size={16} />;
  if (status === "active") return <Loader2 size={16} className="animate-spin" />;
  return <Circle size={16} />;
}

function AutoField({
  label,
  sourceValue,
  sourceLabel,
  placeholder,
  multiline = false,
  onSave,
}: {
  label: string;
  sourceValue: unknown;
  sourceLabel: string;
  placeholder?: string;
  multiline?: boolean;
  onSave?: (value: string) => Promise<void>;
}) {
  const autoValue = valueText(sourceValue);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(autoValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!manual) setDraft(autoValue);
  }, [autoValue, manual]);

  async function save() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setManual(false);
    } finally {
      setSaving(false);
    }
  }

  const hasAuto = autoValue.trim().length > 0;
  const inputClass = `w-full rounded-md border px-3 py-2 text-sm outline-none transition ${
    manual
      ? "border-amber-300 bg-white text-neutral-950 focus:ring-2 focus:ring-amber-100"
      : hasAuto
        ? "border-blue-100 bg-blue-50/60 text-neutral-900"
        : "border-neutral-200 bg-neutral-50 text-neutral-500"
  }`;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            {label}
          </div>
          <div className="text-[10px] text-neutral-400">
            {manual ? "Manual override" : hasAuto ? `Auto from ${sourceLabel}` : "Waiting for upstream data"}
          </div>
        </div>
        <div className="flex gap-1">
          {manual ? (
            <button
              type="button"
              onClick={() => {
                setManual(false);
                setDraft(autoValue);
              }}
              className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50"
              title="Return to auto"
            >
              <RotateCcw size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50"
              title="Edit manually"
            >
              <Pencil size={14} />
            </button>
          )}
          {manual && onSave ? (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md border border-neutral-900 bg-neutral-900 p-1.5 text-white disabled:opacity-50"
              title="Save override"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          ) : null}
        </div>
      </div>

      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          readOnly={!manual}
          placeholder={placeholder}
          className={`${inputClass} min-h-[88px] resize-y font-mono text-xs`}
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          readOnly={!manual}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function BomWorkflowControlPanel({
  initialModel = "",
  initialJobId = "",
}: BomWorkflowControlPanelProps) {
  const [model, setModel] = useState(initialModel.toUpperCase());
  const [jobId, setJobId] = useState(initialJobId);
  const [job, setJob] = useState<BomJob | null>(null);
  const [truth, setTruth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diagramParse = asRecord(job?.diagramParse);
  const liveTruth = truth || (asRecord(diagramParse.visualTruth) as Record<string, unknown>);
  const supplierRuns = asRecord(diagramParse.supplierRuns);
  const supplierRunValues = Object.values(supplierRuns).map(asRecord);
  const normalizedModel = normalizeCanonicalModel(job?.model || model);
  const assemblyNames = asArray(liveTruth?.assemblyNames);
  const finalRows = Array.isArray(job?.finalRows) ? job.finalRows : [];
  const rawRows = Array.isArray(job?.extractedRowsRaw) ? job.extractedRowsRaw : [];
  const supplierCompleteCount = supplierRunValues.filter((run) => {
    const input = asRecord(run.input);
    const result = asRecord(run.result);
    return input.status === "complete" || result.status === "complete";
  }).length;
  const supplierInputCount = supplierRunValues.filter((run) => run.input).length;
  const pricedCount = job?.verifiedPriceCount ?? finalRows.filter((row) => Number(row.price ?? row.retailPrice) > 0).length;
  const expectedTotal = (job?.trustedTotalPartCount ?? job?.expectedPartsTotal ?? liveTruth?.expectedTotal ?? "") as string | number;
  const truthUrl = valueText(liveTruth?.canonUrl || job?.truthSource || job?.trustedTotalCountSourceUrl);
  const screenshotUrl = valueText(liveTruth?.storedImageUrl || liveTruth?.screenshotBase64);

  async function refresh(id = jobId) {
    if (!id) return;
    setError(null);
    const res = await fetch(`/api/bom/jobs/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.job) {
      throw new Error(data?.error || "Job refresh failed");
    }
    setJob(data.job);
    setJobId(data.job.id);
    setModel(String(data.job.model || model || "").toUpperCase());

    const truthRes = await fetch(`/api/bom/jobs/${data.job.id}/visual-truth`, { cache: "no-store" });
    const truthData = await truthRes.json().catch(() => null);
    setTruth(truthData?.visualTruth || null);
  }

  async function createOrLoadJob() {
    const normalized = normalizeCanonicalModel(model);
    if (!normalized) {
      setError("Enter a model before loading a job.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bom/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: normalized }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.job?.id) {
        throw new Error(data?.error || "Job creation failed");
      }
      await refresh(data.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job creation failed");
    } finally {
      setLoading(false);
    }
  }

  async function savePatch(patch: Record<string, unknown>) {
    if (!jobId) throw new Error("Load a job first.");
    const res = await fetch(`/api/bom/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Save failed");
    }
    await refresh(jobId);
  }

  useEffect(() => {
    if (!initialJobId) return;
    refresh(initialJobId).catch((err) => setError(err instanceof Error ? err.message : "Job refresh failed"));
  }, [initialJobId]);

  useEffect(() => {
    if (!jobId) return;
    const timer = window.setInterval(() => {
      refresh(jobId).catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [jobId]);

  const stepStatus: Record<string, StepStatus> = {
    identity: job?.model ? "complete" : model ? "filled" : "active",
    encompass_url: truthUrl ? "complete" : job?.model ? "active" : "waiting",
    visual_capture: screenshotUrl ? "complete" : truthUrl ? "active" : "waiting",
    trusted_count: expectedTotal ? "complete" : screenshotUrl ? "active" : "waiting",
    supplier_targets: supplierInputCount > 0 ? "complete" : expectedTotal ? "active" : "waiting",
    supplier_runs: supplierCompleteCount > 0 ? "complete" : supplierInputCount > 0 ? "active" : "waiting",
    row_evidence: rawRows.length > 0 || Number(job?.rawRowCount || 0) > 0 ? "complete" : supplierCompleteCount > 0 ? "active" : "waiting",
    reconcile: finalRows.length > 0 || Number(job?.actualCanonicalPartCount || 0) > 0 ? "complete" : rawRows.length > 0 ? "active" : "waiting",
    coverage: job?.coveragePct !== null && job?.coveragePct !== undefined ? "complete" : finalRows.length > 0 ? "active" : "waiting",
    pricing: pricedCount > 0 ? "filled" : finalRows.length > 0 ? "active" : "waiting",
    review: job?.issues?.length || job?.errorText ? "active" : finalRows.length > 0 ? "filled" : "waiting",
    export: job?.bomComplete === "true" || job?.partsComplete ? "complete" : finalRows.length > 0 ? "active" : "waiting",
  };

  return (
    <main className="min-h-screen bg-neutral-100 p-5 text-neutral-950 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
              <SlidersHorizontal size={14} />
              Operator Workflow Dashboard
            </div>
            <h1 className="text-3xl font-black tracking-tight">BOM Step Control</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Auto-filled fields stay live as evidence arrives. Take manual control only when you need to override or lock a value.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/bom-ingest"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-50"
            >
              Visual Panel
              <ExternalLink size={14} />
            </Link>
            {jobId ? (
              <button
                type="button"
                onClick={() => refresh(jobId)}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <label className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value.toUpperCase())}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-neutral-900"
                placeholder="HTDX100ED3WW"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Job ID</span>
              <input
                value={jobId}
                onChange={(event) => setJobId(event.target.value.trim())}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-900"
                placeholder="Load an existing job or create by model"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={jobId ? () => refresh(jobId).catch((err) => setError(err.message)) : createOrLoadJob}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            {jobId ? "Load Job" : "Create Job"}
          </button>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {/* Visual Viewport — The "Master Eye" */}
        <section className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/50 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <Database size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.1em] text-neutral-900">Active Visual Context</h3>
                <p className="text-[10px] font-bold text-neutral-400">This image is shared with agents when "Diagram" is enabled.</p>
              </div>
            </div>
            {screenshotUrl && (
              <div className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full uppercase">
                Active Evidence
              </div>
            )}
          </div>
          <div className="p-1">
            <div className="relative aspect-video w-full rounded-xl bg-neutral-900 overflow-hidden flex items-center justify-center border-4 border-white shadow-inner">
              {screenshotUrl ? (
                <img 
                  src={screenshotUrl} 
                  alt="Active context" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                  <Loader2 size={32} className="animate-spin opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest opacity-50">Waiting for visual capture...</p>
                </div>
              )}
              
              {/* Overlay stats */}
              <div className="absolute bottom-4 left-4 flex gap-2">
                <div className="bg-black/60 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  Model: {model || "???"}
                </div>
                {expectedTotal && (
                  <div className="bg-emerald-600/80 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    Target: {String(expectedTotal)} Parts
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-3">
            {WORKFLOW_STEPS.map((step, index) => {
              const status = stepStatus[step.key] || "waiting";
              return (
                <div
                  key={step.key}
                  className={`rounded-lg border p-3 transition ${stepClasses(status)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{stepIcon(status)}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-wide">
                        {String(index + 1).padStart(2, "0")} / {step.label}
                      </div>
                      <div className="mt-1 text-xs opacity-75">{step.detail}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </aside>

          <section className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AutoField
                label="Brand"
                sourceValue={job?.brand}
                sourceLabel="job identity"
                placeholder="Operator can lock brand"
                onSave={(value) => savePatch({ brand: value })}
              />
              <AutoField
                label="Serial"
                sourceValue={job?.serial}
                sourceLabel="job identity"
                placeholder="Optional serial"
                onSave={(value) => savePatch({ serial: value })}
              />
              <AutoField
                label="Product Type"
                sourceValue={job?.productType}
                sourceLabel="job identity"
                placeholder="dryer, washer, dishwasher..."
                onSave={(value) => savePatch({ productType: value })}
              />
              <AutoField
                label="Visual Truth URL"
                sourceValue={truthUrl}
                sourceLabel="visual truth / job source"
                placeholder="Canonical source URL"
                onSave={(value) => savePatch({ truthSource: value, visualTruth: { canonUrl: value } })}
              />
              <AutoField
                label="Expected Total"
                sourceValue={expectedTotal}
                sourceLabel="trusted count"
                placeholder="Only evidence or operator-entered"
                onSave={(value) => savePatch({
                  expectedPartsTotal: value,
                  expectedPartsSource: "operator_override",
                  visualTruth: { expectedTotal: value },
                })}
              />
              <AutoField
                label="Coverage"
                sourceValue={formatPercent(job?.coveragePct)}
                sourceLabel="reconciliation"
                placeholder="Waiting for rows"
              />
              <AutoField
                label="Assembly Names"
                sourceValue={assemblyNames}
                sourceLabel="visual truth"
                placeholder="Assemblies appear here after capture"
                multiline
                onSave={async (value) => {
                  const names = value
                    .split(/\r?\n|,/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                  await savePatch({ visualTruth: { assemblyNames: names } });
                }}
              />
              <AutoField
                label="Row Counts"
                sourceValue={`raw ${rawRows.length || job?.rawRowCount || 0} / final ${finalRows.length || job?.uniqueRowCount || 0} / priced ${pricedCount || 0}`}
                sourceLabel="job artifacts"
              />
              <AutoField
                label="Issues"
                sourceValue={[...(job?.issues || []), job?.errorText].filter(Boolean)}
                sourceLabel="job review"
                multiline
              />
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                  <ListChecks size={16} />
                  Supplier Targets
                </div>
                <div className="text-xs text-neutral-500">
                  {supplierCompleteCount}/{SUPPLIERS.length} completed
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {SUPPLIERS.map((supplier) => {
                  const run = asRecord(supplierRuns[supplier.id]);
                  const input = asRecord(run.input);
                  const result = asRecord(run.result);
                  return (
                    <div key={supplier.id} className="rounded-lg border border-neutral-200 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-bold">{supplier.label}</div>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500">
                          {valueText(input.status || result.status || "not run")}
                        </span>
                      </div>
                      <AutoField
                        label={`${supplier.label} URL`}
                        sourceValue={input.searchUrl || input.sourceUrl || buildSupplierUrl(supplier.id, normalizedModel)}
                        sourceLabel="saved input / model"
                        placeholder="Supplier URL"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                  <ShieldCheck size={16} />
                  Visual Supervisor
                </div>
                <EncompassSupervisorPanel
                  jobId={jobId || null}
                  model={normalizedModel}
                  onTruthCaptured={async (data) => {
                    setTruth(data);
                    if (jobId) await refresh(jobId);
                  }}
                />
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                  <SlidersHorizontal size={16} />
                  Supplier Agent Matrix
                </div>
                <SupplierAgentMatrix jobId={jobId || null} model={normalizedModel} truth={liveTruth} />
              </div>
            </div>
            
            {/* Discovered Bill of Materials — The "Payday" Table */}
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                    <ListChecks size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.1em] text-neutral-900">Discovered Bill of Materials</h3>
                    <p className="text-[10px] font-bold text-neutral-400">{finalRows.length} parts found across all agents</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (finalRows.length === 0) return;
                      const blob = new Blob([JSON.stringify(finalRows, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `BOM_${normalizedModel}.json`);
                      link.click();
                    }}
                    disabled={finalRows.length === 0}
                    className="flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <FileJson size={14} />
                    JSON
                  </button>
                  <button
                    onClick={() => {
                      if (finalRows.length === 0) return;
                      const headers = ["partNumber", "description", "source"];
                      const csvContent = [
                        headers.join(","),
                        ...finalRows.map(row => {
                          const pn = getBomRowPartNumber(row as any);
                          const desc = (row.description || row.partName || "Unknown").toString().replace(/,/g, " ");
                          const source = (row.source || row.provider || "Aggregated").toString().replace(/,/g, " ");
                          return [pn, desc, source].join(",");
                        })
                      ].join("\n");
                      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `BOM_${normalizedModel}.csv`);
                      link.click();
                    }}
                    disabled={finalRows.length === 0}
                    className="flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <FileSpreadsheet size={14} />
                    CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={finalRows.length === 0}
                    className="flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <Printer size={14} />
                    PRINT
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/50 border-b border-neutral-200">
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">Part Number</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">Description</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-500 text-right">Market Pulse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {finalRows.length > 0 ? finalRows.map((row, idx) => {
                      const partNumber = getBomRowPartNumber(row as any);
                      const activeUrl = ebaySearchUrl(partNumber);
                      const soldUrl = ebaySoldSearchUrl(partNumber);
                      
                      return (
                        <tr key={idx} className="hover:bg-neutral-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono font-black text-neutral-900 bg-neutral-100 px-2 py-1 rounded border border-neutral-200">
                              {partNumber || "???"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-neutral-700 line-clamp-1">{valueText(row.description || row.partName || "Unknown Component")}</p>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-tighter">Source: {valueText(row.source || row.provider || "Aggregated")}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <a 
                                href={activeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm hover:shadow-blue-200"
                              >
                                <ShoppingBag size={12} />
                                Selling
                              </a>
                              <a 
                                href={soldUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-sm"
                              >
                                <Receipt size={12} />
                                Sold Comp
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-neutral-400">
                            <Search size={32} className="opacity-20" />
                            <p className="text-xs font-black uppercase tracking-[0.2em]">No parts discovered yet</p>
                            <p className="text-[10px] font-bold">Fire an agent above to begin the search</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {jobId && finalRows.length > 0 ? (
              <div className="flex justify-end">
                <a
                  href={`/api/bom/jobs/${jobId}/export`}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-bold text-white"
                >
                  Export CSV
                  <ExternalLink size={14} />
                </a>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
