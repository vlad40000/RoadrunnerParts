"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Database,
  Camera,
  Home,
  ImageIcon,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
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
  const [ocrSourceMenuOpen, setOcrSourceMenuOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<BomWorkspaceMode>("job");
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

    setOcrSourceMenuOpen(false);
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

  const workspaceDockItems: Array<{ mode: BomWorkspaceMode; label: string }> = [
    { mode: "job", label: "JOB" },
    { mode: "evidence", label: "EV" },
    { mode: "suppliers", label: "SUP" },
    { mode: "rows", label: "ROW" },
    { mode: "reconcile", label: "REC" },
    { mode: "pricing", label: "PRICE" },
    { mode: "approve", label: "APPROVE" },
    { mode: "console", label: "CLI" },
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
                  onClick={() => setOcrSourceMenuOpen((open) => !open)}
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

              {ocrSourceMenuOpen ? (
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">OCR Prompt</div>
                    <button
                      type="button"
                      onClick={() => setOcrPrompt(NAMEPLATE_OCR_PROMPT)}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-[10px] font-black uppercase text-neutral-700 hover:bg-neutral-50"
                    >
                      <RotateCcw size={12} />
                      Reset
                    </button>
                  </div>
                  <textarea
                    value={ocrPrompt}
                    onChange={(event) => setOcrPrompt(event.target.value)}
                    className="min-h-0 flex-1 resize-none rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs text-neutral-900 outline-none focus:border-neutral-900"
                  />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => ocrCameraInputRef.current?.click()}
                      disabled={ocrBusy || !ocrPrompt.trim()}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-900 bg-neutral-950 px-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
                    >
                      <Camera size={14} />
                      Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => ocrUploadInputRef.current?.click()}
                      disabled={ocrBusy || !ocrPrompt.trim()}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-black uppercase tracking-wide text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      <ImageIcon size={14} />
                      Upload
                    </button>
                  </div>
                </div>
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
            <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              {supplierActions.map((supplier) => (
                <button
                  key={`supplier-workspace-${supplier.id}`}
                  type="button"
                  onClick={() => runSupplierDockAction(supplier.id)}
                  disabled={!jobId || terminalBusy}
                  className="inline-flex h-10 items-center rounded-lg border border-neutral-300 bg-white px-4 text-xs font-black uppercase tracking-widest text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                >
                  RUN {supplier.label}
                </button>
              ))}
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
        return (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="grid content-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              {ledgerItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{item.label}</div>
                  <div className="font-mono text-sm font-black text-neutral-950">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="min-h-0 overflow-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
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
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Issues</div>
                  <div className="mt-1 font-mono text-2xl font-black">{issuesCount}</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Issue Log</div>
                {job?.errorText ? <div className="mb-2 text-sm font-bold text-red-700">{job.errorText}</div> : null}
                {(job?.issues || []).length ? (
                  <div className="space-y-2">
                    {(job?.issues || []).map((issue, index) => (
                      <div key={`${issue}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-700">{issue}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-neutral-400">No issues recorded.</div>
                )}
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

  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-100 p-3 text-neutral-950">
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

      <div className="flex h-full min-h-0 flex-col gap-3">
        <header className="flex h-14 flex-none items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-4">
            <h1 className="shrink-0 text-2xl font-black tracking-tight">BOM Cockpit</h1>
            <div className="hidden min-w-0 items-center gap-2 text-[11px] font-black uppercase tracking-widest text-neutral-500 xl:flex">
              <span className="truncate">MODEL {normalizedModel || "-"}</span>
              <span>RAW {rawCount}</span>
              <span>FINAL {finalCount}</span>
              <span>PRICE {pricedCount}</span>
              <span>JOB {jobId ? "OK" : "-"}</span>
              <span>RF {lastRefreshAt || "-"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/" className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-black uppercase tracking-widest hover:bg-neutral-50">
              <Home size={14} />
              Home
            </Link>
            <Link
              href={`/bom-workflow/verify?${new URLSearchParams({
                ...(jobId ? { jobId } : {}),
                ...(normalizedModel ? { model: normalizedModel } : {}),
              })}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-700 bg-blue-700 px-3 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-800"
            >
              <ShieldCheck size={14} />
              Verify
            </Link>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 min-[1400px]:grid-cols-[minmax(0,1fr)_460px]">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm">
            <div className="flex flex-none items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Workspace</div>
              <div className="font-mono text-sm font-black uppercase tracking-widest text-neutral-950">{activeWorkspace}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              {renderWorkspace()}
            </div>
          </section>

          <aside className="hidden min-h-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-sm min-[1400px]:flex min-[1400px]:flex-col min-[1400px]:gap-3">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Job</div>
              <div className="grid gap-2 text-xs font-bold">
                <div className="flex justify-between"><span>status</span><span>{job?.jobStage || job?.retrievalState || "-"}</span></div>
                <div className="flex justify-between"><span>raw</span><span>{rawCount}</span></div>
                <div className="flex justify-between"><span>final</span><span>{finalCount}</span></div>
                <div className="flex justify-between"><span>price</span><span>{pricedCount}</span></div>
                <div className="flex justify-between"><span>solidified</span><span>{solidifiedAt ? "OK" : "-"}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Evidence</div>
              <div className="grid gap-2 text-xs font-bold">
                <div className="flex justify-between"><span>URL</span><span>{truthUrl ? "OK" : "-"}</span></div>
                <div className="flex justify-between"><span>CAP</span><span>{screenshotUrl ? "OK" : "-"}</span></div>
                <div className="flex justify-between"><span>COUNT</span><span>{expectedTotal || "-"}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Suppliers</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-black">
                {supplierActions.map((supplier) => (
                  <div key={`rail-${supplier.id}`} className="rounded-lg bg-white px-2 py-2">
                    <div className="text-[10px] text-neutral-500">{supplier.label}</div>
                    <div className="font-mono text-lg">{supplierMark(supplier.id)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Reconcile</div>
              <div className="grid gap-2 text-xs font-bold">
                <div className="flex justify-between"><span>coverage</span><span>{coverageText}</span></div>
                <div className="flex justify-between"><span>issues</span><span>{issuesCount}</span></div>
              </div>
            </div>
          </aside>
        </div>

        <nav className="flex h-16 flex-none items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {workspaceDockItems.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => setActiveWorkspace(item.mode)}
                className={`h-10 rounded-lg px-3 text-[11px] font-black uppercase tracking-widest transition ${
                  activeWorkspace === item.mode
                    ? "bg-neutral-950 text-white"
                    : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-none items-center gap-1 border-l border-neutral-200 pl-2">
            <button type="button" onClick={createOrLoadJob} disabled={loading} className="h-10 rounded-lg bg-neutral-950 px-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50">DB</button>
            <button type="button" onClick={() => ocrUploadInputRef.current?.click()} disabled={ocrBusy || !ocrPrompt.trim()} className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-neutral-700 disabled:opacity-50">OCR</button>
            <button type="button" onClick={manualRefresh} disabled={!jobId || refreshing} className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-neutral-700 disabled:opacity-50">RF</button>
            <button type="button" onClick={solidifyCurrentState} disabled={!jobId} className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-neutral-700 disabled:opacity-50">OK</button>
            <details className="relative">
              <summary className="flex h-10 cursor-pointer list-none items-center rounded-lg border border-neutral-300 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-neutral-700">
                RUN
              </summary>
              <div className="absolute bottom-full right-0 z-20 mb-2 grid w-44 gap-1 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl">
                {supplierActions.map((supplier) => (
                  <button
                    key={`dock-run-${supplier.id}`}
                    type="button"
                    onClick={() => runSupplierDockAction(supplier.id)}
                    disabled={!jobId || terminalBusy}
                    className="rounded-lg px-3 py-2 text-left text-xs font-black uppercase tracking-widest text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {supplier.label}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </nav>
      </div>
    </main>
  );
}
