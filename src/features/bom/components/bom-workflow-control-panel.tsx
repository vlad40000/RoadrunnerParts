"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  ShieldCheck,
  Database,
  Camera,
  Home,
  ImageIcon,
  Loader2,
  Globe,
  List,
  DollarSign,
  Terminal,
  CheckCircle2,
  LayoutGrid,
  Layers,
  Lock,
  Maximize2,
  Pencil,
  RotateCcw,
  Save,
  Briefcase,
  Search,
  Table,
  GitMerge,
  CheckSquare,
  ChevronLeft,
  RefreshCw,
  MoreHorizontal,
  Activity,
  User,
} from "lucide-react";
import { EncompassEvidenceSummary } from "./encompass-supervisor-panel";
import { ComputerUseSupervisor } from "./computer-use-supervisor";

import { SupplierAgentMatrix } from "./supplier-agent-matrix";
import {
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "../services/source-tier-policy";
import { NAMEPLATE_OCR_PROMPT } from "@/src/lib/nameplate-ocr-contract";

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
type BomWorkspaceMode =
  | "job"
  | "ocr"
  | "evidence"
  | "suppliers"
  | "rows"
  | "reconcile"
  | "pricing"
  | "approve"
  | "console";

const SUPPLIERS = [
  { id: "fix.com", label: "Fix.com" },
  { id: "repairclinic-family", label: "RepairClinic" },
  { id: "appliancepartspros", label: "AppliancePartsPros" },
  { id: "sears-partsdirect", label: "Sears PartsDirect" },
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
  const [jobId, setJobId] = useState(initialJobId || "");
  const [jobIdInput, setJobIdInput] = useState(initialJobId || "");
  const [job, setJob] = useState<BomJob | null>(null);
  const [truth, setTruth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(null);
  const [ocrPrompt, setOcrPrompt] = useState(NAMEPLATE_OCR_PROMPT);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Supplier-run console ready. Type 'help' for commands.",
  ]);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<BomWorkspaceMode>("job");
  const [ocrSourceMenuOpen, setOcrSourceMenuOpen] = useState(false);
  const ocrCameraInputRef = useRef<HTMLInputElement | null>(null);
  const ocrUploadInputRef = useRef<HTMLInputElement | null>(null);
  const isRefreshInFlightRef = useRef(false);
  const refreshUnmountedRef = useRef(false);

  const diagramParse = asRecord(job?.diagramParse);
  const liveTruth = truth || (asRecord(diagramParse.visualTruth) as Record<string, unknown>);

  const supplierRuns = asRecord(diagramParse.supplierRuns);
  const supplierRunValues = Object.values(supplierRuns).map(asRecord);
  const normalizedModel = normalizeCanonicalModel(job?.model || model);
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

  const refresh = useCallback(async (id = jobId, options: { force?: boolean } = {}) => {
    if (!id) return;
    if (isRefreshInFlightRef.current && !options.force) return;
    isRefreshInFlightRef.current = true;
    setError(null);
    try {
      const res = await fetch(`/api/bom/jobs/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.job) {
        throw new Error(data?.error || "Job refresh failed");
      }
      if (refreshUnmountedRef.current) return;
      setJob(data.job);
      setJobId(data.job.id);
      setJobIdInput(data.job.id);
      setModel((prev) => String(data.job.model || prev || "").toUpperCase());
      if (data.job.serial) {
        setActiveSerial(String(data.job.serial).toUpperCase());
      }

      const truthRes = await fetch(`/api/bom/jobs/${data.job.id}/visual-truth`, { cache: "no-store" });
      const truthData = await truthRes.json().catch(() => null);
      if (refreshUnmountedRef.current) return;
      setTruth(truthData?.visualTruth || null);
      setLastRefreshAt(new Date().toLocaleTimeString());
    } finally {
      isRefreshInFlightRef.current = false;
    }
  }, [jobId]);

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
    const typedJobId = jobIdInput.trim();
    if (typedJobId) {
      setLoading(true);
      setError(null);
      try {
        await refresh(typedJobId, { force: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Job load failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    const normalized = normalizeCanonicalModel(model);
    if (!normalized) {
      setError("Enter a model to create a job, or paste a Job ID to load one.");
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
      await refresh(data.job.id, { force: true });
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

  async function reconcileJob() {
    if (!jobId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/bom/jobs/${jobId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Reconciliation failed");
      }
      await refresh(jobId);
      appendTerminal("reconcile: truth scores computed and persisted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setRefreshing(false);
    }
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
      if (!initialJobId && draft.jobId) {
        setJobIdInput(String(draft.jobId));
      }
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
          jobId: jobIdInput.trim() || jobId,
        }),
      );
    } catch {
      // Local persistence is best-effort only.
    }
  }, [activeSerial, jobId, jobIdInput, model]);

  useEffect(() => {
    if (!initialJobId) return;
    refresh(initialJobId).catch((err) => setError(err instanceof Error ? err.message : "Job refresh failed"));
  }, [initialJobId, refresh]);

  useEffect(() => {
    refreshUnmountedRef.current = false;
    if (!jobId) return;
    const timer = window.setInterval(() => {
      refresh(jobId).catch(() => undefined);
    }, 15000);
    return () => {
      refreshUnmountedRef.current = true;
      window.clearInterval(timer);
    };
  }, [jobId, refresh]);

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
    { label: "ID", value: job?.model ? "OK" : "-", status: stepStatus.identity },
    { label: "URL", value: truthUrl ? "OK" : "-", status: stepStatus.encompass_url },
    { label: "CAP", value: screenshotUrl ? "OK" : "-", status: stepStatus.visual_capture },
    { label: "COUNT", value: expectedTotal ? String(expectedTotal) : "-", status: stepStatus.trusted_count },
    { label: "RAW", value: String(rawRows.length || job?.rawRowCount || 0), status: stepStatus.row_evidence },
    { label: "FINAL", value: String(finalRows.length || job?.uniqueRowCount || 0), status: stepStatus.reconcile },
    { label: "PRICE", value: String(pricedCount || 0), status: stepStatus.pricing },
  ];

  const ledgerItems = [
    { label: "Provider rows", value: rawRows.length || job?.rawRowCount || 0 },
    { label: "Reconciled rows", value: finalRows.length || job?.uniqueRowCount || 0 },
    { label: "Supplier inputs", value: supplierInputCount },
    { label: "Supplier complete", value: supplierCompleteCount },
    { label: "Issues", value: (job?.issues || []).length + (job?.errorText ? 1 : 0) },
    { label: "Last job update", value: updatedAtText || "none" },
  ];

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
        body: JSON.stringify({ image: base64, mimeType: file.type, prompt: ocrPrompt }),
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
        setJobIdInput(targetJobId);
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

  const workspaceSteps: Array<{
    mode: BomWorkspaceMode;
    dockLabel: string;
    title: string;
    goal: string;
    status: StepStatus;
  }> = [
    { mode: "job", dockLabel: "Job", title: "Job Identity", goal: "Set model, serial, job, OCR prompt.", status: stepStatus.identity },
    { mode: "ocr", dockLabel: "OCR", title: "OCR Review", goal: "Edit prompt, then capture or upload nameplate evidence.", status: ocrResult ? "complete" : model ? "active" : "waiting" },
    { mode: "suppliers", dockLabel: "SUP", title: "Supplier Agents", goal: "Tune each agent, edit URL, review payload, run.", status: stepStatus.supplier_runs },
    { mode: "evidence", dockLabel: "EV", title: "Evidence", goal: "Capture visual proof, source URL, and agent output.", status: stepStatus.visual_capture },
    { mode: "rows", dockLabel: "ROW", title: "Rows", goal: "Inspect raw and final row previews.", status: stepStatus.row_evidence },
    { mode: "reconcile", dockLabel: "REC", title: "Reconcile", goal: "Check counts, coverage, and issues.", status: stepStatus.reconcile },
    { mode: "pricing", dockLabel: "PRICE", title: "Pricing", goal: "Check priced, required, and missing prices.", status: stepStatus.pricing },
    { mode: "approve", dockLabel: "OK", title: "Approval", goal: "Review evidence state and solidify.", status: stepStatus.export },
    { mode: "console", dockLabel: "CLI", title: "Console", goal: "Run terminal commands only when needed.", status: terminalBusy ? "active" : "waiting" },
  ];

  const supplierActions = [
    { id: "fix.com", label: "FIX" },
    { id: "repairclinic-family", label: "RC" },
    { id: "appliancepartspros", label: "APP" },
    { id: "sears-partsdirect", label: "SEARS" },
  ] as const;

  const rawCount = rawRows.length || job?.rawRowCount || 0;
  const finalCount = finalRows.length || job?.uniqueRowCount || 0;
  const requiredPriceCount = job?.requiredPriceCount ?? finalCount;
  const unpricedCount = job?.unpricedCount ?? Math.max(0, requiredPriceCount - pricedCount);
  const coverageText = formatPercent(job?.coveragePct) || "-";
  const issuesCount = (job?.issues || []).length + (job?.errorText ? 1 : 0);
  const activeStepIndex = Math.max(0, workspaceSteps.findIndex((step) => step.mode === activeWorkspace));
  const activeStep = workspaceSteps[activeStepIndex] || workspaceSteps[0];
  const previousStep = activeStepIndex > 0 ? workspaceSteps[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex < workspaceSteps.length - 1 ? workspaceSteps[activeStepIndex + 1] : null;

  function statusDotClass(status: StepStatus) {
    if (status === "complete") return "bg-emerald-500";
    if (status === "filled") return "bg-blue-500";
    if (status === "active") return "bg-amber-500";
    return "bg-neutral-300";
  }

  function statusLabel(status: StepStatus) {
    if (status === "complete") return "done";
    if (status === "filled") return "ready";
    if (status === "active") return "now";
    return "wait";
  }

  function modeIcon(mode: BomWorkspaceMode) {
    switch (mode) {
      case "job":
        return <Database size={16} />;
      case "ocr":
        return <Camera size={16} />;
      case "suppliers":
        return <Globe size={16} />;
      case "evidence":
        return <ImageIcon size={16} />;
      case "rows":
        return <List size={16} />;
      case "reconcile":
        return <Layers size={16} />;
      case "pricing":
        return <DollarSign size={16} />;
      case "approve":
        return <CheckCircle2 size={16} />;
      case "console":
        return <Terminal size={16} />;
      default:
        return null;
    }
  }

  function runSupplierDockAction(supplierId: string) {
    if (terminalBusy) return;
    setTerminalBusy(true);
    runSupplierFromTerminal(supplierId)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Supplier run failed";
        setError(message);
        appendTerminal(`error: ${message}`);
      })
      .finally(() => setTerminalBusy(false));
  }

  function supplierMark(supplierId: string) {
    const run = asRecord(supplierRuns[supplierId]);
    const input = asRecord(run.input);
    const result = asRecord(run.result);
    if (input.status === "complete" || result.status === "complete") return "OK";
    if (input.url || result.url || input.status || result.status) return "*";
    return "-";
  }

  function rowNumber(row: Record<string, unknown>) {
    return valueText(row.partNumber || row.oem_number || row.oemNumber || row.part_number || row.partNo || "-");
  }

  function rowName(row: Record<string, unknown>) {
    return valueText(row.partName || row.part_name || row.description || row.name || row.title || "-");
  }

  function rowSource(row: Record<string, unknown>) {
    return valueText(row.source || row.provider || row.supplier || row.sourceName || "-");
  }

  function renderRowsPreview(title: string, rows: Array<Record<string, unknown>>, count: number) {
    const visibleRows = rows.slice(0, 25);
    return (
      <div className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="text-xs font-black uppercase tracking-widest text-neutral-600">{title}</div>
          <div className="rounded-full bg-neutral-100 px-2 py-1 font-mono text-[11px] font-bold text-neutral-600">{count}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleRows.length ? (
            visibleRows.map((row, index) => (
              <div key={`${title}-${rowNumber(row)}-${index}`} className="grid grid-cols-[160px_minmax(0,1fr)_120px] gap-3 border-b border-neutral-100 px-4 py-2 text-xs last:border-b-0">
                <div className="truncate font-mono font-bold text-neutral-950">{rowNumber(row)}</div>
                <div className="truncate text-neutral-600">{rowName(row)}</div>
                <div className="truncate text-right text-neutral-500">{rowSource(row)}</div>
              </div>
            ))
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center text-[11px] font-black uppercase tracking-widest text-neutral-400">
              No rows
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderWorkspace() {
    switch (activeWorkspace) {
      case "job":
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-neutral-500">MODEL</span>
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-3 font-mono text-sm uppercase outline-none focus:border-neutral-900"
                    placeholder="HTDX100ED3WW"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-neutral-500">SERIAL</span>
                  <input
                    value={activeSerial}
                    onChange={(event) => {
                      const nextSerial = event.target.value.toUpperCase();
                      setActiveSerial(nextSerial);
                      if (jobId) {
                        savePatch({ serial: nextSerial }).catch((err) => setError(err.message));
                      }
                    }}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-3 font-mono text-sm uppercase outline-none focus:border-neutral-900"
                    placeholder="ENTER SERIAL #"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-neutral-500">JOB</span>
                  <input
                    value={jobIdInput}
                    onChange={(event) => setJobIdInput(event.target.value.trim())}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-3 font-mono text-sm outline-none focus:border-neutral-900"
                    placeholder="Load or create job"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={createOrLoadJob}
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-neutral-200 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                  LOAD
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkspace("ocr")}
                  disabled={ocrBusy}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 text-xs font-black uppercase tracking-widest text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  title="Edit OCR prompt before running OCR"
                >
                  {ocrBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  OCR
                </button>
              </div>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>
              ) : null}
            </div>

            <div className="grid min-h-0 gap-4">
              <AutoField
                label="Build Instructions"
                sourceValue={liveTruth?.operatorInstructions}
                sourceLabel="operator instructions"
                placeholder="Instructions for the agent..."
                multiline
                onSave={(value) => savePatch({ visualTruth: { operatorInstructions: value, operatorInstructionName: "manual" } })}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <AutoField
                  label="Brand"
                  sourceValue={job?.brand}
                  sourceLabel="job identity"
                  onSave={(value) => savePatch({ brand: value })}
                />
                <AutoField
                  label="Product Type"
                  sourceValue={job?.productType}
                  sourceLabel="job identity"
                  onSave={(value) => savePatch({ productType: value })}
                />
              </div>
              {ocrResult ? (
                <div className="min-h-0 overflow-auto rounded-xl border border-neutral-200 bg-white p-3 font-mono text-xs text-neutral-700">
                  {JSON.stringify(ocrResult, null, 2)}
                </div>
              ) : null}
            </div>
          </div>
        );

      case "ocr":
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">OCR Prompt</div>
                  <div className="text-sm font-bold text-neutral-700">Edit this before running camera or upload OCR.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOcrPrompt(NAMEPLATE_OCR_PROMPT)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-neutral-700 hover:bg-neutral-50"
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
              </div>
              <textarea
                value={ocrPrompt}
                onChange={(event) => setOcrPrompt(event.target.value)}
                className="min-h-0 flex-1 resize-none rounded-xl border border-neutral-300 bg-neutral-50 p-4 font-mono text-xs leading-relaxed text-neutral-900 outline-none focus:border-neutral-900"
              />
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Nameplate Input</div>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => ocrCameraInputRef.current?.click()}
                    disabled={ocrBusy || !ocrPrompt.trim()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {ocrBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => ocrUploadInputRef.current?.click()}
                    disabled={ocrBusy || !ocrPrompt.trim()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 text-xs font-black uppercase tracking-widest text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <ImageIcon size={14} />
                    Upload Image
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">OCR Result</div>
                {ocrResult ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-700">{JSON.stringify(ocrResult, null, 2)}</pre>
                ) : (
                  <div className="flex h-full min-h-[180px] items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-center text-[11px] font-black uppercase tracking-widest text-neutral-400">
                    No OCR result yet
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "evidence":
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              {jobId ? (
                <ComputerUseSupervisor jobId={jobId} model={normalizedModel} sourceUrl={agentSourceUrl} />
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] font-black uppercase tracking-widest text-neutral-400">
                  Load a job to start evidence
                </div>
              )}
            </div>
            <div className="min-h-0 overflow-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] font-black uppercase tracking-widest">
                <div className="rounded-lg bg-neutral-50 p-3">URL<br /><span className="text-lg text-neutral-950">{truthUrl ? "OK" : "-"}</span></div>
                <div className="rounded-lg bg-neutral-50 p-3">CAP<br /><span className="text-lg text-neutral-950">{screenshotUrl ? "OK" : "-"}</span></div>
                <div className="rounded-lg bg-neutral-50 p-3">COUNT<br /><span className="text-lg text-neutral-950">{expectedTotal || "-"}</span></div>
              </div>
              <EncompassEvidenceSummary model={normalizedModel} truth={liveTruth} />
            </div>
          </div>
        );

      case "suppliers":
        return (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-none items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Agent Models</div>
                <div className="truncate text-sm font-bold text-neutral-700">Tune model settings, edit target URLs, select evidence, review payload, then run from each card.</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace("console")}
                className="h-10 shrink-0 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-black uppercase tracking-widest text-neutral-700 hover:bg-neutral-50"
              >
                Open CLI
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <SupplierAgentMatrix jobId={jobId || null} model={normalizedModel} truth={liveTruth} />
            </div>
          </div>
        );

      case "rows":
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-2">
            {renderRowsPreview("Raw Rows", rawRows, rawCount)}
            {renderRowsPreview("Final Rows", finalRows, finalCount)}
          </div>
        );

      case "reconcile":
        const report = asRecord(diagramParse.reconciliationReport);
        const reconciledParts = asArray(report.parts).map(asRecord);
        const overlapCount = Number(report.overlapCount || 0);
        const encompassCount = Number(report.encompassCount || 0);
        const searsCount = Number(report.searsCount || 0);
        const truthScore = overlapCount > 0 ? Math.round((overlapCount / Math.max(encompassCount, searsCount)) * 100) : 0;

        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <div className="grid content-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Global Ledger</div>
                {ledgerItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{item.label}</div>
                    <div className="font-mono text-sm font-black text-neutral-950">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Truth Integrity</div>
                  <div className={`rounded-full px-2 py-0.5 text-[10px] font-black text-white ${truthScore > 80 ? "bg-emerald-500" : truthScore > 50 ? "bg-amber-500" : "bg-red-500"}`}>
                    {truthScore}% MATCH
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="absolute h-full bg-emerald-500" style={{ width: `${truthScore}%` }} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg bg-neutral-50 p-2">
                      <div className="text-[9px] font-black uppercase text-neutral-400">Encompass</div>
                      <div className="font-mono text-lg font-black text-neutral-950">{encompassCount}</div>
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-2">
                      <div className="text-[9px] font-black uppercase text-neutral-400">Sears</div>
                      <div className="font-mono text-lg font-black text-neutral-950">{searsCount}</div>
                    </div>
                  </div>

                  <button 
                    onClick={reconcileJob}
                    disabled={refreshing || (asArray(job?.retrievedSources).length === 0)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-neutral-800 disabled:opacity-30"
                  >
                    {refreshing ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                    Run Reconciliation
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Expected</div>
                  <div className="mt-1 font-mono text-2xl font-black">{expectedTotal || "-"}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Coverage</div>
                  <div className="mt-1 font-mono text-2xl font-black">{coverageText}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Overlap</div>
                  <div className="mt-1 font-mono text-2xl font-black text-emerald-600">{overlapCount}</div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden border-t border-neutral-100 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Part Discrepancies</div>
                  <div className="text-[10px] font-bold text-neutral-400">{reconciledParts.length} unique parts</div>
                </div>
                
                <div className="h-full overflow-auto">
                  {reconciledParts.length > 0 ? (
                    <div className="space-y-1">
                      {reconciledParts.map((part, index) => (
                        <div key={`${String(part.partNumber || "")}-${index}`} className={`grid grid-cols-[120px_1fr_100px] items-center gap-3 rounded-lg px-3 py-2 text-xs ${part.isDiscrepancy ? 'bg-amber-50' : 'bg-neutral-50'}`}>
                          <div className="font-mono font-bold text-neutral-950">{String(part.partNumber || "")}</div>
                          <div className="truncate text-neutral-600">{String(part.description || "")}</div>
                          <div className="flex justify-end gap-1">
                            {asArray(part.sources).map((source) => {
                              const sourceName = String(source || "");
                              return (
                                <div key={sourceName} className="h-2 w-2 rounded-full" style={{ backgroundColor: sourceName === 'sears-partsdirect' ? '#0284c7' : '#10b981' }} title={sourceName} />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center text-center text-[11px] font-black uppercase tracking-widest text-neutral-400">
                      Run reconciliation to identify<br />source discrepancies.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case "pricing":
        return (
          <div className="grid h-full content-start gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Priced</div>
              <div className="mt-2 font-mono text-4xl font-black">{pricedCount}</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Required</div>
              <div className="mt-2 font-mono text-4xl font-black">{requiredPriceCount}</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Unpriced</div>
              <div className="mt-2 font-mono text-4xl font-black">{unpricedCount}</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Complete</div>
              <div className="mt-2 font-mono text-4xl font-black">{job?.pricingComplete ? "OK" : "-"}</div>
            </div>
          </div>
        );

      case "approve":
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 overflow-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="grid gap-2 md:grid-cols-4">
                {evidenceItems.map((item) => (
                  <div key={item.label} className={`rounded-xl border p-4 ${stepClasses(item.status)}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-70">{item.label}</div>
                    <div className="mt-2 font-mono text-2xl font-black">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Parts</div>
                  <div className="mt-1 font-mono text-2xl font-black">{job?.partsComplete ? "OK" : "-"}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">BOM</div>
                  <div className="mt-1 font-mono text-2xl font-black">{job?.bomComplete === "true" || job?.partsComplete ? "OK" : "-"}</div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Solidified</div>
                  <div className="mt-1 truncate font-mono text-sm font-black">{solidifiedAt || "-"}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Operator Gate</div>
                <div className="mt-4 space-y-2 text-sm font-bold text-neutral-600">
                  <div>raw {rawCount}</div>
                  <div>final {finalCount}</div>
                  <div>price {pricedCount}</div>
                  <div>issues {issuesCount}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={solidifyCurrentState}
                disabled={!jobId}
                className="mt-4 h-12 rounded-xl bg-neutral-950 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                OK Solidify
              </button>
            </div>
          </div>
        );

      case "console":
        return (
          <div className="flex h-full min-h-0 flex-col rounded-xl border border-neutral-900 bg-neutral-950 p-4 font-mono text-xs text-emerald-300 shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap">
              {terminalLines.join("\n")}
            </div>
            <div className="mt-3 flex flex-none gap-2">
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
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-black px-3 py-2 text-emerald-300 outline-none"
              />
              <button
                type="button"
                onClick={runTerminalCommand}
                disabled={terminalBusy}
                className="rounded-lg border border-emerald-500 bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
              >
                {terminalBusy ? "..." : "Run"}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  function renderCommandBar() {
    switch (activeWorkspace) {
      case "job":
        return (
          <>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value.toUpperCase())}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 font-mono text-xs uppercase text-white outline-none placeholder:text-neutral-500 focus:border-yellow-400"
              placeholder="MODEL"
            />
            <input
              value={activeSerial}
              onChange={(event) => setActiveSerial(event.target.value.toUpperCase())}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 font-mono text-xs uppercase text-white outline-none placeholder:text-neutral-500 focus:border-yellow-400"
              placeholder="SERIAL"
            />
            <input
              value={jobIdInput}
              onChange={(event) => setJobIdInput(event.target.value.trim())}
              className="h-10 min-w-0 flex-[1.2] rounded-xl border border-white/10 bg-white/10 px-3 font-mono text-xs text-white outline-none placeholder:text-neutral-500 focus:border-yellow-400"
              placeholder="JOB ID"
            />
            <button
              type="button"
              onClick={createOrLoadJob}
              disabled={loading}
              className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-lg shadow-yellow-500/20 disabled:opacity-50"
            >
              {loading ? "Loading" : "Load / Create"}
            </button>
          </>
        );

      case "ocr":
        return (
          <>
            <div className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              Prompt is editable in the active card
            </div>
            <button type="button" onClick={() => setOcrPrompt(NAMEPLATE_OCR_PROMPT)} className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-white">
              Reset
            </button>
            <button type="button" onClick={() => ocrCameraInputRef.current?.click()} disabled={ocrBusy || !ocrPrompt.trim()} className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-white disabled:opacity-50">
              Take Photo
            </button>
            <button type="button" onClick={() => ocrUploadInputRef.current?.click()} disabled={ocrBusy || !ocrPrompt.trim()} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black disabled:opacity-50">
              Upload Image
            </button>
          </>
        );

      case "suppliers":
        return (
          <>
            <div className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              Tune cards first, then run explicit supplier actions
            </div>
            {supplierActions.map((supplier) => (
              <button
                key={`bar-run-${supplier.id}`}
                type="button"
                onClick={() => runSupplierDockAction(supplier.id)}
                disabled={!jobId || terminalBusy}
                className="h-10 rounded-xl border border-white/10 bg-white/10 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-white disabled:opacity-50"
              >
                Run {supplier.label}
              </button>
            ))}
          </>
        );

      case "evidence":
        return (
          <>
            <div className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400">{truthUrl || "No source URL yet"}</div>
            <button type="button" onClick={manualRefresh} disabled={!jobId || refreshing} className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-white disabled:opacity-50">
              Refresh Evidence
            </button>
            {truthUrl ? (
              <a href={truthUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black">
                Open Source
              </a>
            ) : null}
          </>
        );

      case "rows":
        return (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-4 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              <span>Raw {rawCount}</span>
              <span>Final {finalCount}</span>
              <span>Unique {job?.uniqueRowCount || finalCount}</span>
              <span>Priced {pricedCount}</span>
            </div>
            <button type="button" onClick={() => setActiveWorkspace("reconcile")} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black">
              Review Reconcile
            </button>
          </>
        );

      case "reconcile":
        return (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-4 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              <span>Coverage {coverageText}</span>
              <span>Issues {issuesCount}</span>
            </div>
            <button type="button" onClick={() => setActiveWorkspace("suppliers")} className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-white">
              Needs More Evidence
            </button>
            <button type="button" onClick={() => setActiveWorkspace("pricing")} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black">
              Continue Price
            </button>
          </>
        );

      case "pricing":
        return (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-4 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              <span>Priced {pricedCount}</span>
              <span>Required {requiredPriceCount}</span>
              <span>Unpriced {unpricedCount}</span>
            </div>
            <button type="button" onClick={() => setActiveWorkspace("approve")} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black">
              Review Approval
            </button>
          </>
        );

      case "approve":
        return (
          <>
            <div className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">
              Identity {job?.model ? "OK" : "-"} / Evidence {truthUrl || screenshotUrl ? "OK" : "-"} / Rows {finalCount} / Price {pricedCount}
            </div>
            <button type="button" onClick={() => setActiveWorkspace("suppliers")} className="h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-white">
              Reject / More Evidence
            </button>
            <button type="button" onClick={solidifyCurrentState} disabled={!jobId || !job?.model || !finalCount} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black disabled:opacity-50">
              Approve BOM
            </button>
          </>
        );

      case "console":
        return (
          <>
            <input
              value={terminalInput}
              onChange={(event) => setTerminalInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runTerminalCommand();
                }
              }}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 font-mono text-xs text-emerald-300 outline-none"
              placeholder="help | status | run fix.com"
            />
            <button type="button" onClick={runTerminalCommand} disabled={terminalBusy} className="h-10 rounded-xl bg-yellow-400 px-5 text-[11px] font-black uppercase tracking-[0.2em] text-black disabled:opacity-50">
              Run Command
            </button>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0d0d0d] text-white font-sans selection:bg-amber-400 selection:text-black">
      {/* Background Grid Layer */}
      <div className="absolute inset-0 z-0 opacity-20" 
           style={{ 
             backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
             backgroundSize: '40px 40px' 
           }} 
      />

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

      <div className="relative z-10 flex h-full flex-col">
        {/* TOP PHASE BAR */}
        <header className="flex h-10 flex-none items-center justify-between border-b border-white/5 bg-[#111]/80 px-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/40 hover:text-white transition-colors">
              <ChevronLeft size={16} />
            </Link>
            
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${normalizedModel ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/40'}`}>
                {normalizedModel || "NO MODEL"}
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                BOM WORKFLOW
              </div>
            </div>
          </div>

          {/* Phase Navigation */}
          <nav className="flex items-center gap-1">
            {workspaceSteps.map((step) => {
              const isActive = activeWorkspace === step.mode;
              const label = step.dockLabel.toUpperCase();
              
              return (
                <button
                  key={`top-nav-${step.mode}-${step.dockLabel}`}
                  onClick={() => {
                    setActiveWorkspace(step.mode);
                    if (step.dockLabel === "OCR") setOcrSourceMenuOpen(true);
                    else if (step.mode === "job") setOcrSourceMenuOpen(false);
                  }}
                  className={`relative flex items-center px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${
                    isActive ? "text-white" : "text-white/30 hover:text-white/60"
                  }`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="top-pill"
                      className="absolute inset-0 rounded-full bg-white/10" 
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <span className={`h-1 w-1 rounded-full ${statusDotClass(step.status)}`} />
                    {label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-white/30">
              <div className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${jobId ? 'bg-emerald-500' : 'bg-white/10'}`} />
                <span className="text-[9px] font-black uppercase tracking-wider">ONLINE</span>
              </div>
              <button onClick={() => manualRefresh()} className="hover:text-white transition-colors">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => solidifyCurrentState()} className="hover:text-white transition-colors">
                <Lock size={12} className={solidifiedAt ? "text-amber-400" : ""} />
              </button>
              <button className="hover:text-white transition-colors">
                <Maximize2 size={12} />
              </button>
            </div>
            
            <div className="h-4 w-[1px] bg-white/10" />
            
            <Link 
              href={`/bom-workflow/verify?${new URLSearchParams({
                ...(jobId ? { jobId } : {}),
                ...(normalizedModel ? { model: normalizedModel } : {}),
              })}`}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)]"
            >
              <ShieldCheck size={12} />
              VERIFY
            </Link>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* LEFT VERTICAL RAIL */}
          <aside className="flex w-12 flex-none flex-col items-center border-r border-white/5 bg-[#111] py-4">
            <div className="flex flex-col gap-2">
              {[
                { icon: Briefcase, mode: "job", label: "Job", ocr: false },
                { icon: Camera, mode: "job", label: "OCR", ocr: true },
                { icon: Layers, mode: "suppliers", label: "Suppliers" },
                { icon: Search, mode: "evidence", label: "Evidence" },
                { icon: Table, mode: "rows", label: "Rows" },
                { icon: GitMerge, mode: "reconcile", label: "Reconcile" },
                { icon: DollarSign, mode: "pricing", label: "Price" },
                { icon: CheckSquare, mode: "approve", label: "Approve" },
                { icon: Terminal, mode: "console", label: "Console" },
              ].map((item) => {
                const isActive = activeWorkspace === item.mode && (item.ocr ? ocrSourceMenuOpen : (item.mode !== "job" || !ocrSourceMenuOpen));
                const status = workspaceSteps.find(s => s.mode === item.mode)?.status || "waiting";
                
                return (
                  <button
                    key={`rail-${item.label}`}
                    title={item.label}
                    onClick={() => {
                      setActiveWorkspace(item.mode as BomWorkspaceMode);
                      if (item.label === "OCR") setOcrSourceMenuOpen(true);
                      else if (item.mode === "job") setOcrSourceMenuOpen(false);
                    }}
                    className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                      isActive 
                        ? "bg-white/10 text-white shadow-inner" 
                        : "text-white/20 hover:bg-white/5 hover:text-white/60"
                    }`}
                  >
                    <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <div className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-[#111] ${statusDotClass(status)}`} />
                    {isActive && (
                      <div className="absolute left-0 h-4 w-1 rounded-r-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-auto flex flex-col gap-4 text-white/10">
              <button className="hover:text-white/40 transition-colors"><User size={18} /></button>
              <button className="hover:text-white/40 transition-colors"><MoreHorizontal size={18} /></button>
            </div>
          </aside>

          {/* MAIN CENTER WORKSPACE */}
          <section className="relative flex-1 min-w-0 overflow-hidden p-6 lg:p-10">
            <div className="mx-auto flex h-full max-w-6xl flex-col rounded-2xl border border-white/10 bg-[#161616] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden">
              {/* Card Header Strip */}
              <div className="flex h-12 flex-none items-center justify-between border-b border-white/5 bg-white/2 px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[10px] font-black text-white/40">
                    {activeStepIndex + 1}
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">
                    {activeStep.title}
                  </h2>
                </div>
                <div className="hidden max-w-md truncate text-[10px] font-bold uppercase tracking-widest text-white/30 xl:block">
                  {activeStep.goal}
                </div>
              </div>

              {/* Workspace Content - Light Surface */}
              <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50/95 backdrop-blur-sm">
                <div className="h-full overflow-auto p-6 text-neutral-950">
                  {renderWorkspace()}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* BOTTOM OPERATOR COMMAND BAR */}
        <footer className="flex h-14 flex-none items-center justify-between border-t border-white/5 bg-[#111]/90 px-6 backdrop-blur-md">
          <div className="flex items-center gap-6">
            {activeWorkspace === "job" && (
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">MODEL</span>
                  <input 
                    value={model} 
                    onChange={e => setModel(e.target.value.toUpperCase())}
                    className="w-32 bg-transparent font-mono text-sm font-bold text-white outline-none placeholder:text-white/10"
                    placeholder="REQUIRED"
                  />
                </div>
                <div className="h-6 w-[1px] bg-white/5" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">SERIAL</span>
                  <input 
                    value={activeSerial} 
                    onChange={e => setActiveSerial(e.target.value.toUpperCase())}
                    className="w-32 bg-transparent font-mono text-sm font-bold text-white outline-none placeholder:text-white/10"
                    placeholder="OPTIONAL"
                  />
                </div>
                <button 
                  onClick={createOrLoadJob}
                  disabled={loading}
                  className="ml-2 flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-[10px] font-black uppercase tracking-widest text-black transition-all hover:bg-amber-400 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  LOAD / CREATE
                </button>
              </div>
            )}

            {activeWorkspace === "evidence" && (
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">SOURCE URL</span>
                  <div className="max-w-xs truncate font-mono text-[10px] font-bold text-white/60">
                    {agentSourceUrl || "NO SOURCE"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => manualRefresh()} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10">
                    REFRESH
                  </button>
                  {agentSourceUrl && (
                    <a href={agentSourceUrl} target="_blank" className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10">
                      OPEN SOURCE
                    </a>
                  )}
                </div>
              </div>
            )}

            {activeWorkspace === "suppliers" && (
              <div className="flex items-center gap-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">OPERATIONS:</div>
                <details className="relative">
                  <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10">
                    QUICK RUN
                  </summary>
                  <div className="absolute bottom-full left-0 z-20 mb-2 grid w-48 gap-1 rounded-xl border border-white/10 bg-[#161616] p-2 shadow-2xl">
                    {supplierActions.map((supplier) => (
                      <button
                        key={`bottom-run-${supplier.id}`}
                        onClick={() => runSupplierDockAction(supplier.id)}
                        disabled={terminalBusy}
                        className="rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 hover:text-white"
                      >
                        {supplier.label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {(activeWorkspace === "rows" || activeWorkspace === "reconcile") && (
              <div className="flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">RAW ROWS</span>
                  <span className="font-mono text-sm font-black text-amber-400">{rawCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">FINAL ROWS</span>
                  <span className="font-mono text-sm font-black text-emerald-400">{finalCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">COVERAGE</span>
                  <span className="font-mono text-sm font-black text-white">{coverageText}</span>
                </div>
              </div>
            )}

            {activeWorkspace === "pricing" && (
              <div className="flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">PRICED</span>
                  <span className="font-mono text-sm font-black text-emerald-400">{pricedCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30">UNPRICED</span>
                  <span className="font-mono text-sm font-black text-red-400">{unpricedCount}</span>
                </div>
              </div>
            )}

            {activeWorkspace === "approve" && (
              <div className="flex items-center gap-4">
                <button 
                  onClick={solidifyCurrentState}
                  disabled={!jobId}
                  className="flex h-10 items-center gap-2 rounded-lg bg-amber-400 px-6 text-[11px] font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-amber-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] disabled:opacity-50"
                >
                  <Lock size={14} />
                  APPROVE & SOLIDIFY
                </button>
                <button 
                  className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-6 text-[11px] font-black uppercase tracking-[0.2em] text-white/40 hover:bg-white/10 hover:text-white"
                >
                  NEEDS EVIDENCE
                </button>
              </div>
            )}

            {activeWorkspace === "console" && (
              <div className="flex flex-1 items-center gap-3">
                <div className="flex h-9 flex-1 items-center gap-2 rounded-lg bg-black/50 px-3 ring-1 ring-white/10">
                  <Terminal size={14} className="text-emerald-500" />
                  <input
                    value={terminalInput}
                    onChange={(event) => setTerminalInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runTerminalCommand();
                      }
                    }}
                    placeholder="Type a command..."
                    className="flex-1 bg-transparent font-mono text-xs text-emerald-400 outline-none"
                  />
                </div>
                <button
                  onClick={runTerminalCommand}
                  disabled={terminalBusy}
                  className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  RUN
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-right">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/20">WORKFLOW STATUS</span>
              <div className="flex gap-1 mt-1">
                {workspaceSteps.map((step, idx) => (
                  <div 
                    key={`dot-${idx}`}
                    className={`h-1 w-3 rounded-full transition-all ${
                      activeWorkspace === step.mode ? 'bg-amber-400 w-6' : statusDotClass(step.status)
                    } ${step.status === 'waiting' ? 'opacity-20' : 'opacity-100'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
