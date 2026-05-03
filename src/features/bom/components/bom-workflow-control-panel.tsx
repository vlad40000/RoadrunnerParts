"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Camera,
  Database,
  ExternalLink,
  Home,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Monitor,
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
import { ComputerUseSupervisor } from "./computer-use-supervisor";

import { SupplierAgentMatrix } from "./supplier-agent-matrix";
import {
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "../services/source-tier-policy";
import { 
  getBomRowPartNumber, 
  ebaySearchUrl, 
  ebaySoldSearchUrl 
} from "../services/ebay-links";

type BomWorkflowControlPanelProps = {
  initialModel?: string;
  initialSerial?: string;
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

const TERMINAL_HELP = [
  "help",
  "status",
  "run fix.com",
  "run repairclinic-family",
  "run appliancepartspros",
  "run sears-partsdirect",
].join("\n");

const WORKFLOW_DRAFT_STORAGE_KEY = "bom-workflow:draft";

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

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstText(...value);
      if (nested) return nested;
      continue;
    }
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeOcrPayload(payload: unknown, fallbackModel: string) {
  const root = asRecord(payload);
  const nested =
    asRecord(root.ocr).model || asRecord(root.ocr).modelNumber
      ? asRecord(root.ocr)
      : asRecord(root.data).model || asRecord(root.data).modelNumber
        ? asRecord(root.data)
        : asRecord(root.result).model || asRecord(root.result).modelNumber
          ? asRecord(root.result)
          : root;

  const candidates = [
    ...asArray(nested.candidates),
    ...asArray(nested.modelCandidates),
    ...asArray(nested.model_numbers),
    ...asArray(root.candidates),
  ];
  const model = firstText(
    nested.model,
    nested.modelNumber,
    nested.model_number,
    nested.normalizedModel,
    nested.normalized_model,
    candidates,
    fallbackModel,
  );

  return {
    brand: firstText(nested.brand, nested.brandFamily, asRecord(nested.decodeResult).brandFamily) || null,
    model: model || null,
    serial:
      firstText(
        nested.serial,
        nested.serialNumber,
        nested.serial_number,
        nested.serialNo,
        nested.serial_no,
        nested.serialNum,
        nested.serial_num,
        asRecord(nested.decodeResult).serial,
      ) || null,
    productType: firstText(nested.productType, nested.product_type, nested.applianceType) || null,
    engineeringCode: firstText(nested.engineeringCode, nested.engineering_code) || null,
    confidence: nested.confidence || null,
    candidates,
    decodeResult: nested.decodeResult || null,
    raw: payload,
  } as Record<string, unknown>;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${Math.round(value * 100)}%`;
}

function usableVisualTruthUrl(value: unknown) {
  const url = valueText(value).trim();
  if (!url) return "";
  return url.includes("/Exploded-View-Assembly/") ? url : "";
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
  initialSerial = "",
  initialJobId = "",
}: BomWorkflowControlPanelProps) {
  const [model, setModel] = useState(initialModel.toUpperCase());
  const [activeSerial, setActiveSerial] = useState(initialSerial.toUpperCase());
  const [jobId, setJobId] = useState(initialJobId);
  const [job, setJob] = useState<BomJob | null>(null);
  const [truth, setTruth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(null);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Supplier-run console ready. Type 'help' for commands.",
  ]);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [ocrSourceMenuOpen, setOcrSourceMenuOpen] = useState(false);
  const ocrCameraInputRef = useRef<HTMLInputElement | null>(null);
  const ocrUploadInputRef = useRef<HTMLInputElement | null>(null);

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
  const generatedAssemblyUrl = buildKnownEncompassAssemblyUrl(normalizedModel) || "";
  const truthUrl =
    usableVisualTruthUrl(liveTruth?.canonUrl) ||
    usableVisualTruthUrl(job?.truthSource) ||
    usableVisualTruthUrl(job?.trustedTotalCountSourceUrl) ||
    generatedAssemblyUrl;
  const agentSourceUrl = truthUrl || generatedAssemblyUrl;
  const screenshotUrl = valueText(liveTruth?.storedImageUrl || liveTruth?.screenshotBase64);
  const solidifiedAt = valueText(liveTruth?.solidifiedAt);
  const updatedAtText = job?.updatedAt ? new Date(job.updatedAt).toLocaleString() : "";

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
    if (data.job.serial) {
      setActiveSerial(String(data.job.serial).toUpperCase());
    }

    const truthRes = await fetch(`/api/bom/jobs/${data.job.id}/visual-truth`, { cache: "no-store" });
    const truthData = await truthRes.json().catch(() => null);
    setTruth(truthData?.visualTruth || null);
    setLastRefreshAt(new Date().toLocaleTimeString());
  }

  async function manualRefresh() {
    if (!jobId) return;
    setRefreshing(true);
    try {
      await refresh(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job refresh failed");
    } finally {
      setRefreshing(false);
    }
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
        body: JSON.stringify({
          model: normalized,
          serial: activeSerial.trim().toUpperCase() || undefined,
        }),
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

  async function savePatchForJob(targetJobId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/bom/jobs/${targetJobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Save failed");
    }
    await refresh(targetJobId);
  }

  async function savePatch(patch: Record<string, unknown>) {
    if (!jobId) throw new Error("Load a job first.");
    await savePatchForJob(jobId, patch);
  }

  async function solidifyCurrentState() {
    if (!jobId) {
      setError("Load a job before solidifying state.");
      return;
    }

    await savePatch({
      visualTruth: {
        solidifiedAt: new Date().toISOString(),
        solidifiedBy: "operator_dashboard",
        solidifiedState: {
          model: normalizedModel,
          brand: job?.brand || null,
          expectedTotal: expectedTotal || null,
          finalRows: finalRows.length || job?.uniqueRowCount || 0,
          rawRows: rawRows.length || job?.rawRowCount || 0,
          coveragePct: job?.coveragePct ?? null,
          truthUrl: truthUrl || null,
        },
      },
    });
    appendTerminal("state: current dashboard state solidified");
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WORKFLOW_DRAFT_STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved) as {
        model?: string;
        serial?: string;
        jobId?: string;
      };
      if (!initialModel && draft.model) setModel(String(draft.model).toUpperCase());
      if (!initialSerial && draft.serial) setActiveSerial(String(draft.serial).toUpperCase());
      if (!initialJobId && draft.jobId) setJobId(String(draft.jobId));
    } catch {
      // Ignore corrupted local draft data.
    }
  }, [initialJobId, initialModel, initialSerial]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKFLOW_DRAFT_STORAGE_KEY,
        JSON.stringify({
          model: normalizeCanonicalModel(model),
          serial: activeSerial.trim().toUpperCase(),
          jobId,
        }),
      );
    } catch {
      // Local persistence is best-effort only.
    }
  }, [activeSerial, jobId, model]);

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

  const evidenceItems = [
    { label: "Identity", value: [job?.brand, normalizedModel, job?.serial].filter(Boolean).join(" / ") || "waiting", status: stepStatus.identity },
    { label: "Visual Truth", value: truthUrl || "waiting for canonical URL", status: stepStatus.encompass_url },
    { label: "Capture", value: screenshotUrl ? "image evidence attached" : "waiting for rendered capture", status: stepStatus.visual_capture },
    { label: "Trusted Count", value: expectedTotal ? `${expectedTotal} parts` : "no evidence/operator count", status: stepStatus.trusted_count },
    { label: "Raw Rows", value: String(rawRows.length || job?.rawRowCount || 0), status: stepStatus.row_evidence },
    { label: "Final Rows", value: String(finalRows.length || job?.uniqueRowCount || 0), status: stepStatus.reconcile },
    { label: "Coverage", value: formatPercent(job?.coveragePct) || "not scored", status: stepStatus.coverage },
    { label: "Pricing", value: `${pricedCount || 0} priced`, status: stepStatus.pricing },
  ];

  const ledgerItems = [
    { label: "Provider rows", value: rawRows.length || job?.rawRowCount || 0 },
    { label: "Reconciled rows", value: finalRows.length || job?.uniqueRowCount || 0 },
    { label: "Supplier inputs", value: supplierInputCount },
    { label: "Supplier complete", value: supplierCompleteCount },
    { label: "Issues", value: (job?.issues || []).length + (job?.errorText ? 1 : 0) },
    { label: "Last job update", value: updatedAtText || "none" },
  ];

  function jumpToSection(sectionId: string) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function appendTerminal(line: string) {
    setTerminalLines((prev) => [...prev.slice(-120), line]);
  }

  async function handleOcrImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setOcrBusy(true);
    setError(null);
    try {
      const typedModel = normalizeCanonicalModel(model);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read image file."));
        reader.readAsDataURL(file);
      });

      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "OCR extraction failed");
      }
      const identity = normalizeOcrPayload(payload, typedModel);
      const extractedModel = normalizeCanonicalModel(String(identity.model || typedModel || ""));
      const extractedSerial = String(identity.serial || "").trim().toUpperCase();

      if (!extractedModel && !jobId) {
        throw new Error("OCR did not extract a model. Enter a model first or retry with a clearer nameplate image.");
      }

      let targetJobId = jobId;
      if (!targetJobId || (extractedModel && extractedModel !== normalizedModel)) {
        const createRes = await fetch("/api/bom/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: extractedModel || typedModel || normalizedModel,
            brand: identity.brand || undefined,
            serial: extractedSerial || undefined,
            productType: identity.productType || undefined,
          }),
        });
        const createPayload = await createRes.json().catch(() => null);
        if (!createRes.ok || !createPayload?.job?.id) {
          throw new Error(createPayload?.error || "OCR job creation failed");
        }
        targetJobId = createPayload.job.id;
        setJobId(targetJobId);
      }

      if (extractedModel) setModel(extractedModel);
      if (extractedSerial) setActiveSerial(extractedSerial);
      setOcrResult(identity || null);
      await savePatchForJob(targetJobId, {
        brand: identity.brand || undefined,
        serial: extractedSerial || undefined,
        productType: identity.productType || undefined,
        visualTruth: {
          screenshotBase64: dataUrl,
          ocrImageDataUrl: dataUrl,
          ocrImageName: file.name,
          ocrIdentity: identity,
          ocrRawPayload: payload,
        },
      });
      appendTerminal(
        `ocr: loaded ${file.name}${extractedModel ? ` -> ${extractedModel}` : ""}${
          extractedSerial ? ` / serial ${extractedSerial}` : ""
        }`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OCR upload failed";
      setError(msg);
      appendTerminal(`error: ${msg}`);
    } finally {
      setOcrBusy(false);
      if (event.target) event.target.value = "";
      setOcrSourceMenuOpen(false);
    }
  }

  async function runSupplierFromTerminal(supplierId: string) {
    if (!jobId) throw new Error("Missing jobId. Create or load a job first.");
    if (!normalizedModel) throw new Error("Missing model. Enter a model first.");

    const supplier = SUPPLIERS.find((item) => item.id === supplierId);
    if (!supplier) throw new Error(`Unsupported supplier: ${supplierId}`);

    const searchUrl = buildSupplierUrl(supplierId, normalizedModel);
    if (!searchUrl) throw new Error(`No route URL for supplier: ${supplierId}`);

    const body = {
      jobId,
      task: "run_supplier_agent",
      tierKey: "terminal",
      supplier: supplierId,
      canonicalModel: normalizedModel,
      formattedModel: normalizedModel,
      searchUrl,
      brand: job?.brand || undefined,
      serial: job?.serial || undefined,
      productType: job?.productType || undefined,
      visualTruth: liveTruth,
    };

    const res = await fetch("/api/bom/source-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      throw new Error(payload?.detail || payload?.error || "Supplier run failed");
    }
    await refresh(jobId);
    appendTerminal(`run ${supplierId}: complete`);
  }

  async function runTerminalCommand() {
    const command = terminalInput.trim();
    if (!command || terminalBusy) return;
    setTerminalInput("");
    appendTerminal(`> ${command}`);
    setTerminalBusy(true);
    try {
      const lower = command.toLowerCase();
      if (lower === "help") {
        appendTerminal(TERMINAL_HELP);
      } else if (lower === "status") {
        appendTerminal(
          `status: model=${normalizedModel || "-"} job=${jobId || "-"} rows=${finalRows.length} coverage=${formatPercent(job?.coveragePct) || "-"}`
        );
      } else if (lower.startsWith("run ")) {
        const supplierId = lower.replace(/^run\s+/, "").trim();
        await runSupplierFromTerminal(supplierId);
      } else {
        appendTerminal(`unknown command: ${command}`);
      }
    } catch (err) {
      appendTerminal(`error: ${err instanceof Error ? err.message : "command failed"}`);
    } finally {
      setTerminalBusy(false);
    }
  }

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
              Evidence-first workflow state with manual controls for each BOM step.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-50"
            >
              <Home size={14} />
              Home
            </Link>
            <Link
              href={`/bom-workflow/verify?${new URLSearchParams({
                ...(jobId ? { jobId } : {}),
                ...(normalizedModel ? { model: normalizedModel } : {}),
              })}`}
              className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <ShieldCheck size={14} />
              Verify
            </Link>
            {jobId ? (
              <button
                type="button"
                onClick={manualRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            ) : null}
          </div>
        </header>

        <details className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer list-none border-b border-neutral-200 bg-blue-700 px-4 py-3 text-white">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-100">
                  Pre-emptive State Workflow Dashboard
                </div>
                <div className="text-sm font-semibold">
                  {jobId ? `Job ${jobId}` : "No job loaded"}{lastRefreshAt ? ` / refreshed ${lastRefreshAt}` : ""}
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-100">
                Click to expand
              </div>
            </div>
          </summary>
          <div className="p-4">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => solidifyCurrentState().catch((err) => setError(err instanceof Error ? err.message : "Solidify failed"))}
                disabled={!jobId}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                <ClipboardCheck size={14} />
                Solidify Current State
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {evidenceItems.map((item) => (
                <div key={item.label} className={`rounded-lg border p-3 ${stepClasses(item.status as StepStatus)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest">{item.label}</div>
                    {stepIcon(item.status as StepStatus)}
                  </div>
                  <div className="mt-2 truncate text-sm font-semibold" title={String(item.value)}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-500">
            {solidifiedAt ? `Solidified ${new Date(solidifiedAt).toLocaleString()}` : "State has not been solidified yet."}
          </div>
        </details>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <details className="rounded-lg border border-neutral-200 bg-white">
            <summary className="cursor-pointer list-none border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                <Database size={16} />
                Log Bridge / Evidence Landing
              </div>
            </summary>
            <div className="grid gap-3 p-4 md:grid-cols-3">
                <AutoField
                  label="Canonical Evidence URL"
                  sourceValue={truthUrl}
                  sourceLabel="visual truth"
                  placeholder="Waiting for captured provider URL"
                  onSave={(value) => savePatch({ truthSource: value, visualTruth: { canonUrl: value } })}
                />
                <AutoField
                  label="Expected Total"
                  sourceValue={expectedTotal}
                  sourceLabel="DB/evidence/operator"
                  placeholder="Null until evidence or override"
                  onSave={(value) => savePatch({
                    expectedPartsTotal: value,
                    expectedPartsSource: "operator_override",
                    visualTruth: { expectedTotal: value },
                  })}
                />
                <AutoField
                  label="Assemblies"
                  sourceValue={assemblyNames}
                  sourceLabel="visual capture"
                  placeholder="Assembly names land here"
                  multiline
                  onSave={async (value) => {
                    const names = value
                      .split(/\r?\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean);
                    await savePatch({ visualTruth: { assemblyNames: names } });
                  }}
                />
            </div>
          </details>

          <details className="rounded-lg border border-neutral-200 bg-white">
            <summary className="cursor-pointer list-none border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                <ListChecks size={16} />
                Opportunistic Ledger
              </div>
            </summary>
            <div className="grid grid-cols-2 gap-2 p-4">
                {ledgerItems.map((item) => (
                  <div key={item.label} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      {item.label}
                    </div>
                    <div className="mt-1 truncate text-sm font-black text-neutral-900" title={String(item.value)}>
                      {item.value}
                    </div>
                  </div>
                ))}
            </div>
          </details>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
            <button
              type="button"
              onClick={() => jumpToSection("step-setup")}
              className={`rounded-md border px-2 py-1 transition hover:brightness-95 ${stepClasses(stepStatus.identity)}`}
            >
              1 Setup
            </button>
            <button
              type="button"
              onClick={() => jumpToSection("step-capture")}
              className={`rounded-md border px-2 py-1 transition hover:brightness-95 ${stepClasses(stepStatus.visual_capture)}`}
            >
              2 Capture
            </button>
            <button
              type="button"
              onClick={() => jumpToSection("step-run-agents")}
              className={`rounded-md border px-2 py-1 transition hover:brightness-95 ${stepClasses(stepStatus.supplier_runs)}`}
            >
              3 Run Agents
            </button>
            <button
              type="button"
              onClick={() => jumpToSection("step-review-export")}
              className={`rounded-md border px-2 py-1 transition hover:brightness-95 ${stepClasses(stepStatus.export)}`}
            >
              4 Review / Export
            </button>
          </div>
        </section>

        <section id="step-setup" className="rounded-lg border border-neutral-200 bg-white p-4">
          <input
            ref={ocrCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleOcrImageUpload}
          />
          <input
            ref={ocrUploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleOcrImageUpload}
          />

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
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
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Active Serial</span>
              <input
                value={activeSerial}
                onChange={(event) => {
                  const nextSerial = event.target.value.toUpperCase();
                  setActiveSerial(nextSerial);
                  if (jobId) {
                    savePatch({ serial: nextSerial }).catch((err) => setError(err.message));
                  }
                }}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-neutral-900"
                placeholder="ENTER SERIAL #"
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={jobId ? () => refresh(jobId).catch((err) => setError(err.message)) : createOrLoadJob}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                {jobId ? "Load Job" : "Create Job"}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOcrSourceMenuOpen((open) => !open)}
                  disabled={ocrBusy}
                  className="inline-flex h-10 w-12 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  title="OCR nameplate intake"
                >
                  {ocrBusy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                </button>
                {ocrSourceMenuOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => ocrCameraInputRef.current?.click()}
                      className="flex w-full items-center gap-2 border-b border-neutral-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-neutral-700 hover:bg-neutral-50"
                    >
                      <Camera size={14} />
                      Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => ocrUploadInputRef.current?.click()}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-neutral-700 hover:bg-neutral-50"
                    >
                      <ImageIcon size={14} />
                      Upload Image
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {/* Agentic Command Center — The "Master Eye" */}
        <details id="step-capture" className="rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer list-none p-4">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <Monitor size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">Agentic Command Center</h3>
                <p className="text-[10px] font-bold text-neutral-400">Real-time visual agent supervision & bypass</p>
              </div>
            </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Open</div>
            </div>
          </summary>
          <div className="space-y-4 border-t border-neutral-200 p-4">
          {jobId ? (
            <div className="min-h-[600px]">
              <ComputerUseSupervisor
                jobId={jobId}
                model={normalizedModel}
                sourceUrl={agentSourceUrl}
              />
            </div>
          ) : (
            <div className="relative aspect-video w-full rounded-xl bg-neutral-900 overflow-hidden flex items-center justify-center border-4 border-white shadow-inner">
              <div className="flex flex-col items-center gap-3 text-neutral-500">
                <Loader2 size={32} className="animate-spin opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest opacity-50">Waiting for job initialization...</p>
              </div>
            </div>
          )}

          {ocrResult ? (
            <div className="border-t border-neutral-200 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                OCR Result Preview
              </div>
              <pre className="max-h-40 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 text-[11px] text-neutral-800">
                {JSON.stringify(ocrResult, null, 2)}
              </pre>
            </div>
          ) : null}
          </div>
        </details>

        <div className="grid gap-6">
          <section className="space-y-6">
            <details className="rounded-lg border border-neutral-200 bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black uppercase tracking-wide text-neutral-700">
                Workflow Details (Optional)
              </summary>
              <div className="space-y-6 border-t border-neutral-200 p-4">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {WORKFLOW_STEPS.map((step, index) => {
                    const status = stepStatus[step.key] || "waiting";
                    return (
                      <div
                        key={step.key}
                        className={`rounded-lg border p-2 transition ${stepClasses(status)}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{stepIcon(status)}</div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-black uppercase tracking-wide">
                              {String(index + 1).padStart(2, "0")} {step.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
              </div>
            </details>

            <div id="step-run-agents" className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <details className="rounded-lg border border-neutral-200 bg-white">
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                    <ShieldCheck size={16} />
                    Visual Supervisor
                  </div>
                </summary>
                <div className="border-t border-neutral-200 p-4">
                  <EncompassSupervisorPanel
                    jobId={jobId || null}
                    model={normalizedModel}
                    onTruthCaptured={async (data) => {
                      setTruth(data);
                      if (jobId) await refresh(jobId);
                    }}
                  />
                </div>
              </details>

              <details className="rounded-lg border border-neutral-200 bg-white">
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                    <SlidersHorizontal size={16} />
                    Supplier Agent Matrix
                  </div>
                </summary>
                <div className="border-t border-neutral-200 p-4">
                  <SupplierAgentMatrix jobId={jobId || null} model={normalizedModel} truth={liveTruth} />
                </div>
              </details>
            </div>

            <details className="rounded-lg border border-neutral-200 bg-white">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-neutral-400">
                  <CheckCircle2 size={16} />
                  Reconciliation & Coverage
                </div>
              </summary>
              <div className="border-t border-neutral-200 p-4">
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Confidence Score</div>
                  <div className="text-2xl font-black text-neutral-900">{formatPercent(job?.coveragePct)}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Discrepancies</div>
                  <div className={`text-2xl font-black ${finalRows.some(r => r.isDiscrepancy) ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {finalRows.filter(r => r.isDiscrepancy).length}
                  </div>
                </div>
              </div>
              </div>
            </details>

            <details className="rounded-lg border border-neutral-200 bg-white">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black uppercase tracking-wide">Supplier-Run Console</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Open</div>
                </div>
              </summary>
              <div className="border-t border-neutral-200 p-4">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => appendTerminal("hint: try 'help'")}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Help
                </button>
              </div>
              <div className="rounded-md border border-neutral-900 bg-neutral-950 p-3 font-mono text-xs text-emerald-300">
                <div className="max-h-44 overflow-auto whitespace-pre-wrap">
                  {terminalLines.join("\n")}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={terminalInput}
                    onChange={(event) => setTerminalInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runTerminalCommand();
                      }
                    }}
                    placeholder="help | status | run fix.com"
                    className="flex-1 rounded-md border border-neutral-700 bg-black px-2 py-1 text-emerald-300 outline-none"
                  />
                  <button
                    type="button"
                    onClick={runTerminalCommand}
                    disabled={terminalBusy}
                    className="rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {terminalBusy ? "..." : "Run"}
                  </button>
                </div>
              </div>
              </div>
            </details>
            
            {/* Discovered Bill of Materials — The "Payday" Table */}
            <div id="step-review-export" className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
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
                      const headers = [
                        "partNumber",
                        "description",
                        "source",
                        "eBay Active Search URL",
                        "eBay Sold Search URL",
                      ];
                      const csvContent = [
                        headers.join(","),
                        ...finalRows.map(row => {
                          const pn = getBomRowPartNumber(row as any);
                          const desc = (row.description || row.partName || "Unknown").toString().replace(/,/g, " ");
                          const source = (row.source || row.provider || "Aggregated").toString().replace(/,/g, " ");
                          return [pn, desc, source, ebaySearchUrl(pn), ebaySoldSearchUrl(pn)].join(",");
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
                        <tr key={idx} className={`hover:bg-neutral-50/50 transition-colors group ${row.isDiscrepancy ? "bg-amber-50/30" : ""}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-mono font-black px-2 py-1 rounded border ${row.isDiscrepancy ? "text-amber-900 bg-amber-100 border-amber-200" : "text-neutral-900 bg-neutral-100 border-neutral-200"}`}>
                                {partNumber || "???"}
                              </span>
                              {row.isDiscrepancy ? (
                                <span className="text-[8px] font-black uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded-full" title={String(row.discrepancyType)}>
                                  DIFF
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-neutral-700 line-clamp-1">{valueText(row.description || row.partName || "Unknown Component")}</p>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-tighter">
                              Sources: {asArray(row.sources).join(", ") || valueText(row.source || row.provider || "Aggregated")}
                            </p>
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
                                Sold Comps
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
