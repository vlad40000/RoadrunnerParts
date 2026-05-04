"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Braces,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Copy,
  Database,
  DollarSign,
  ExternalLink,
  FileCode2,
  Fingerprint,
  Globe2,
  History,
  Home,
  ImageIcon,
  Loader2,
  Package,
  PanelRight,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Table2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  DEFAULT_MODEL_SLOTS,
  type BomWorkspaceMode,
  type BrowserSourceCapture,
  type ModelSlot,
  type PromptRun,
  type PromptScenario,
  type PromptScenarioType,
  type PromptValidationResult,
  type SupplierId,
} from "../prompt-workspace/types";
import { PROMPT_SCENARIOS } from "../prompt-workspace/scenarios";

type BomPromptWorkspaceProps = {
  initialModel?: string;
  initialSerial?: string;
  initialJobId?: string;
};

type BomJob = {
  id: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  productType: string | null;
  rawRowCount: number;
  uniqueRowCount: number;
  retrievalState: string | null;
  coveragePct: number | null;
  issues: string[];
  extractedRowsRaw: Array<Record<string, unknown>>;
  finalRows: Array<Record<string, unknown>>;
  updatedAt: string | Date;
};

type SupplierCard = {
  id: SupplierId;
  label: string;
  domain: string;
};

const RUN_HISTORY_KEY = "bom-prompt-workspace:runs";

const SUPPLIERS: SupplierCard[] = [
  { id: "sears-partsdirect", label: "Sears PartsDirect", domain: "searspartsdirect.com" },
  { id: "encompass", label: "Encompass", domain: "encompass.com" },
  { id: "repairclinic", label: "RepairClinic", domain: "repairclinic.com" },
  { id: "ge", label: "GE", domain: "geappliances.com" },
  { id: "whirlpool", label: "Whirlpool", domain: "whirlpool.com" },
  { id: "lg", label: "LG", domain: "lg.com" },
  { id: "samsung", label: "Samsung", domain: "samsung.com" },
  { id: "manual-pdf", label: "Manual/PDF", domain: "operator upload" },
  { id: "diagram-upload", label: "Diagram Upload", domain: "operator upload" },
];

const MODES: Array<{
  mode: BomWorkspaceMode;
  label: string;
  icon: typeof Fingerprint;
}> = [
  { mode: "identity", label: "Identity", icon: Fingerprint },
  { mode: "prompt_scenarios", label: "Prompts", icon: FileCode2 },
  { mode: "supplier_runs", label: "Suppliers", icon: Globe2 },
  { mode: "browser_tool", label: "Browser", icon: Search },
  { mode: "diagram_context", label: "Diagrams", icon: ImageIcon },
  { mode: "bom_extraction", label: "BOM", icon: Table2 },
  { mode: "pricing", label: "Pricing", icon: DollarSign },
  { mode: "validation", label: "Validate", icon: ShieldCheck },
  { mode: "export_review", label: "Export", icon: Upload },
];

const TASK_TO_SCENARIO: Record<"diagrams" | "bom" | "pricing", PromptScenarioType> = {
  diagrams: "diagram_discovery",
  bom: "bom_extraction",
  pricing: "pricing_reconciliation",
};

const TASK_TO_MODE: Record<"diagrams" | "bom" | "pricing", BomWorkspaceMode> = {
  diagrams: "diagram_context",
  bom: "bom_extraction",
  pricing: "pricing",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeJsonParse(text: string): { value: Record<string, unknown>; error: string | null } {
  try {
    const value = JSON.parse(text || "{}");
    return { value: asRecord(value), error: null };
  } catch (error) {
    return {
      value: {},
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function firstRowText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function supplierUrl(supplier: SupplierCard, model: string) {
  const encoded = encodeURIComponent(model || "");
  if (supplier.id === "manual-pdf" || supplier.id === "diagram-upload") return "";
  if (supplier.id === "encompass") return `https://encompass.com/search?searchTerm=${encoded}`;
  if (supplier.id === "sears-partsdirect") return `https://www.searspartsdirect.com/search?q=${encoded}`;
  if (supplier.id === "repairclinic") return `https://www.repairclinic.com/Shop-For-Parts?query=${encoded}`;
  if (supplier.id === "ge") return `https://www.geapplianceparts.com/store/parts/search?q=${encoded}`;
  if (supplier.id === "whirlpool") return `https://www.whirlpoolparts.com/Search?query=${encoded}`;
  if (supplier.id === "lg") return `https://lgparts.com/search?q=${encoded}`;
  if (supplier.id === "samsung") return `https://samsungparts.com/search?q=${encoded}`;
  return "";
}

function buildDefaultInputPayload(input: {
  scenario: PromptScenario;
  model: string;
  serial: string;
  job: BomJob | null;
  patch?: Record<string, unknown>;
}) {
  const base = {
    modelNumber: input.job?.model || input.model || null,
    serialNumber: input.job?.serial || input.serial || null,
    brand: input.job?.brand || null,
    productType: input.job?.productType || null,
    jobId: input.job?.id || null,
    sourceEvidence: null,
    browserCapture: null,
    rows: input.job?.finalRows || [],
  };

  const required = Object.fromEntries(input.scenario.requiredInputs.map((key) => [key, null]));
  return {
    ...required,
    ...base,
    ...input.patch,
  };
}

function normalizeRunForHistory(run: PromptRun) {
  return {
    ...run,
    outputs: run.outputs.map((output) => ({
      ...output,
      rawOutput: output.rawOutput.slice(0, 4000),
    })),
  };
}

function scenarioByType(scenarios: PromptScenario[], type: PromptScenarioType) {
  return scenarios.find((scenario) => scenario.type === type) || null;
}

export function BomPromptWorkspace({
  initialModel = "",
  initialSerial = "",
  initialJobId = "",
}: BomPromptWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<BomWorkspaceMode>("prompt_scenarios");
  const [model, setModel] = useState(initialModel.toUpperCase());
  const [serial, setSerial] = useState(initialSerial.toUpperCase());
  const [jobId, setJobId] = useState(initialJobId);
  const [jobIdInput, setJobIdInput] = useState(initialJobId);
  const [job, setJob] = useState<BomJob | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<PromptScenario[]>(PROMPT_SCENARIOS);
  const [selectedScenarioId, setSelectedScenarioId] = useState(PROMPT_SCENARIOS[0]?.id || "");
  const [systemPrompt, setSystemPrompt] = useState(PROMPT_SCENARIOS[0]?.systemPrompt || "");
  const [userPromptTemplate, setUserPromptTemplate] = useState(PROMPT_SCENARIOS[0]?.userPromptTemplate || "");
  const [inputPayloadText, setInputPayloadText] = useState(() =>
    jsonText(
      buildDefaultInputPayload({
        scenario: PROMPT_SCENARIOS[0],
        model: initialModel.toUpperCase(),
        serial: initialSerial.toUpperCase(),
        job: null,
      }),
    ),
  );
  const [modelSlots, setModelSlots] = useState<ModelSlot[]>(DEFAULT_MODEL_SLOTS);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<PromptRun | null>(null);
  const [runHistory, setRunHistory] = useState<PromptRun[]>([]);
  const [lastValidation, setLastValidation] = useState<PromptValidationResult | null>(null);
  const [savedPromptStatus, setSavedPromptStatus] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserFrameUrl, setBrowserFrameUrl] = useState("");
  const [browserSupplier, setBrowserSupplier] = useState<SupplierId>("encompass");
  const [captures, setCaptures] = useState<BrowserSourceCapture[]>([]);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios[0],
    [scenarios, selectedScenarioId],
  );
  const inputPayload = useMemo(() => safeJsonParse(inputPayloadText), [inputPayloadText]);
  const finalRows = lastValidation?.acceptedRows?.length
    ? lastValidation.acceptedRows
    : Array.isArray(job?.finalRows)
      ? job.finalRows
      : [];
  const rawRows = Array.isArray(job?.extractedRowsRaw) ? job.extractedRowsRaw : [];
  const activeSlots = modelSlots.filter((slot) => slot.enabled);

  const draftScenario = useCallback((): PromptScenario | null => {
    if (!selectedScenario) return null;
    return {
      ...selectedScenario,
      systemPrompt,
      userPromptTemplate,
    };
  }, [selectedScenario, systemPrompt, userPromptTemplate]);

  const loadScenario = useCallback(
    (scenario: PromptScenario, patch?: Record<string, unknown>) => {
      setSelectedScenarioId(scenario.id);
      setSystemPrompt(scenario.systemPrompt);
      setUserPromptTemplate(scenario.userPromptTemplate);
      setInputPayloadText(
        jsonText(
          buildDefaultInputPayload({
            scenario,
            model,
            serial,
            job,
            patch,
          }),
        ),
      );
      setSavedPromptStatus(null);
    },
    [job, model, serial],
  );

  const loadScenarioByType = useCallback(
    (type: PromptScenarioType, patch?: Record<string, unknown>) => {
      const scenario = scenarioByType(scenarios, type);
      if (scenario) loadScenario(scenario, patch);
    },
    [loadScenario, scenarios],
  );

  useEffect(() => {
    fetch("/api/prompt-scenarios")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok && Array.isArray(data.scenarios)) {
          setScenarios(data.scenarios);
          const selected = data.scenarios.find((scenario: PromptScenario) => scenario.id === selectedScenarioId) || data.scenarios[0];
          if (selected) loadScenario(selected);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!initialJobId) return;
    loadJob(initialJobId).catch((error) => {
      setJobError(error instanceof Error ? error.message : "Job load failed");
    });
  }, [initialJobId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(RUN_HISTORY_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) setRunHistory(parsed.slice(0, 12));
    } catch {
      setRunHistory([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runHistory.slice(0, 12)));
  }, [runHistory]);

  async function loadJob(id = jobIdInput) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setJobBusy(true);
    setJobError(null);
    try {
      const res = await fetch(`/api/bom/jobs/${trimmed}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Job load failed");
      setJob(data.job);
      setJobId(data.job.id);
      setJobIdInput(data.job.id);
      setModel(String(data.job.model || model).toUpperCase());
      setSerial(String(data.job.serial || serial).toUpperCase());
    } finally {
      setJobBusy(false);
    }
  }

  async function createOrLoadJob() {
    setJobBusy(true);
    setJobError(null);
    try {
      if (jobIdInput.trim()) {
        await loadJob(jobIdInput);
        return;
      }
      const res = await fetch("/api/bom/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, serial }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Job creation failed");
      setJob(data.job);
      setJobId(data.job.id);
      setJobIdInput(data.job.id);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Job request failed");
    } finally {
      setJobBusy(false);
    }
  }

  function updateSlot(slotId: ModelSlot["id"], patch: Partial<ModelSlot>) {
    setModelSlots((slots) =>
      slots
        .slice(0, 2)
        .map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                ...patch,
                provider:
                  patch.provider === "manual" || patch.provider === "mock" || patch.provider === "gemini"
                    ? patch.provider
                    : slot.provider,
                temperature:
                  patch.temperature !== undefined && Number.isFinite(Number(patch.temperature))
                    ? Number(patch.temperature)
                    : slot.temperature,
              }
            : slot,
        ),
    );
  }

  async function runScenario() {
    const scenario = draftScenario();
    if (!scenario) return;
    if (inputPayload.error) {
      setRunError(`Input payload JSON error: ${inputPayload.error}`);
      return;
    }

    setRunBusy(true);
    setRunError(null);
    setLastValidation(null);

    try {
      const res = await fetch("/api/prompt-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          scenario,
          inputPayload: inputPayload.value,
          modelSlots,
          jobContext: {
            jobId,
            model,
            serial,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Prompt run failed");
      setLastRun(data.run);
      setRunHistory((runs) => [normalizeRunForHistory(data.run), ...runs].slice(0, 12));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Prompt run failed");
    } finally {
      setRunBusy(false);
    }
  }

  async function validateLatestRun() {
    const output = lastRun?.outputs?.[0];
    if (!lastRun || !output) return;
    const res = await fetch(`/api/prompt-runs/${lastRun.id}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioType: lastRun.scenarioType,
        rawOutput: output.rawOutput,
        parsedJson: output.parsedJson,
      }),
    });
    const data = await res.json();
    if (data?.ok) setLastValidation(data.validation);
  }

  async function saveWinningPrompt() {
    const scenario = draftScenario();
    if (!scenario) return;
    setSavedPromptStatus(null);
    const res = await fetch(`/api/prompt-scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setSavedPromptStatus(data?.error || "Save failed");
      return;
    }
    setScenarios((items) => items.map((item) => (item.id === data.scenario.id ? data.scenario : item)));
    setSavedPromptStatus("Saved in local prompt workspace");
  }

  function selectSupplierAction(supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") {
    const url = supplierUrl(supplier, model);
    setBrowserSupplier(supplier.id);
    setBrowserUrl(url);
    if (url) setBrowserFrameUrl(url);
    loadScenarioByType(TASK_TO_SCENARIO[task], {
      supplier: supplier.label,
      supplierId: supplier.id,
      modelNumber: model || job?.model || null,
      sourceUrl: url || null,
      browserCapture: null,
      sourceEvidence: null,
    });
    setActiveMode(TASK_TO_MODE[task]);
  }

  function queueCapture(kind: BrowserSourceCapture["captureKind"], label: string) {
    setCaptures((items) => [
      {
        id: crypto.randomUUID(),
        label,
        sourceUrl: browserFrameUrl || browserUrl,
        captureKind: kind,
        status: "planned",
        createdAt: new Date().toISOString(),
      },
      ...items,
    ]);
  }

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  return (
    <main className="bom-studio-light fixed inset-0 overflow-hidden bg-[#101113] text-white">
      <div className="flex h-full min-h-0">
        <aside className="bom-left-rail flex w-[72px] shrink-0 flex-col items-center border-r border-white/10 bg-[#15171a] py-3">
          <Link
            href="/"
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
            aria-label="Home"
          >
            <Home size={18} />
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-1">
            {MODES.map((item) => {
              const Icon = item.icon;
              const active = activeMode === item.mode;
              return (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => setActiveMode(item.mode)}
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition ${
                    active
                      ? "bg-[#2f6fec] text-white shadow-lg shadow-blue-950/30"
                      : "text-white/45 hover:bg-white/7 hover:text-white"
                  }`}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon size={18} />
                  {active ? <span className="absolute -right-[15px] h-5 w-1 rounded-l bg-[#8ab4ff]" /> : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="bom-topbar flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#17191d] px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="text-white/45 hover:text-white" aria-label="Back home">
                <ChevronLeft size={18} />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">BOM Studio</span>
                  <span className="rounded bg-white/8 px-2 py-0.5 font-mono text-[10px] text-white/60">
                    {model || "NO MODEL"}
                  </span>
                </div>
                <div className="truncate text-[11px] text-white/40">
                  Prompt scenarios, two model slots, browser scaffold, validation gate
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runScenario}
                disabled={runBusy || !selectedScenario || !activeSlots.length}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#8ab4ff] px-4 text-xs font-bold text-[#07111f] hover:bg-[#a8c7fa] disabled:opacity-50"
              >
                {runBusy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Run
              </button>
              <button
                type="button"
                onClick={validateLatestRun}
                disabled={!lastRun}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/75 hover:bg-white/10 disabled:opacity-40"
              >
                <ShieldCheck size={15} />
                Validate
              </button>
            </div>
          </header>

          <div className="bom-work-area grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] bg-[#101113]">
            <div className="min-w-0 overflow-hidden">
              <div className="h-full overflow-auto p-5">
                <div className="bom-central-panel mx-auto min-h-full max-w-[1520px] rounded-2xl border border-white/10 bg-[#17191d] p-4">
                  {activeMode === "identity" ? (
                    <IdentityPanel
                      model={model}
                      serial={serial}
                      job={job}
                      jobIdInput={jobIdInput}
                      jobBusy={jobBusy}
                      jobError={jobError}
                      setModel={setModel}
                      setSerial={setSerial}
                      setJobIdInput={setJobIdInput}
                      createOrLoadJob={createOrLoadJob}
                      loadScenarioByType={loadScenarioByType}
                      setActiveMode={setActiveMode}
                    />
                  ) : null}

                  {activeMode === "prompt_scenarios" ? (
                    <PromptScenarioPanel
                      scenarios={scenarios}
                      selectedScenario={selectedScenario}
                      systemPrompt={systemPrompt}
                      userPromptTemplate={userPromptTemplate}
                      inputPayloadText={inputPayloadText}
                      inputError={inputPayload.error}
                      runBusy={runBusy}
                      runError={runError}
                      lastRun={lastRun}
                      savedPromptStatus={savedPromptStatus}
                      setInputPayloadText={setInputPayloadText}
                      setSystemPrompt={setSystemPrompt}
                      setUserPromptTemplate={setUserPromptTemplate}
                      loadScenario={loadScenario}
                      runScenario={runScenario}
                      saveWinningPrompt={saveWinningPrompt}
                      copyText={copyText}
                    />
                  ) : null}

                  {activeMode === "supplier_runs" ? (
                    <SupplierActionGrid
                      suppliers={SUPPLIERS}
                      model={model}
                      selectSupplierAction={selectSupplierAction}
                    />
                  ) : null}

                  {activeMode === "browser_tool" || activeMode === "diagram_context" ? (
                    <BrowserWorkbench
                      browserSupplier={browserSupplier}
                      browserUrl={browserUrl}
                      browserFrameUrl={browserFrameUrl}
                      captures={captures}
                      setBrowserSupplier={setBrowserSupplier}
                      setBrowserUrl={setBrowserUrl}
                      setBrowserFrameUrl={setBrowserFrameUrl}
                      queueCapture={queueCapture}
                      suppliers={SUPPLIERS}
                      model={model}
                    />
                  ) : null}

                  {activeMode === "bom_extraction" ? (
                    <BomExtractionPanel
                      rawRows={rawRows}
                      finalRows={finalRows}
                      loadScenarioByType={loadScenarioByType}
                      setActiveMode={setActiveMode}
                    />
                  ) : null}

                  {activeMode === "pricing" ? (
                    <PricingPanel
                      finalRows={finalRows}
                      loadScenarioByType={loadScenarioByType}
                      setActiveMode={setActiveMode}
                    />
                  ) : null}

                  {activeMode === "validation" ? (
                    <ValidationPanel
                      lastValidation={lastValidation}
                      validateLatestRun={validateLatestRun}
                      lastRun={lastRun}
                      finalRows={finalRows}
                    />
                  ) : null}

                  {activeMode === "export_review" ? (
                    <ExportReviewPanel runHistory={runHistory} lastRun={lastRun} />
                  ) : null}
                </div>
              </div>
            </div>

            <RightInspector
              modelSlots={modelSlots}
              activeMode={activeMode}
              selectedScenario={selectedScenario}
              inputPayload={inputPayload.value}
              job={job}
              jobId={jobId}
              model={model}
              browserFrameUrl={browserFrameUrl}
              lastRun={lastRun}
              lastValidation={lastValidation}
              updateSlot={updateSlot}
              saveWinningPrompt={saveWinningPrompt}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bom-panel rounded-xl border border-white/10 bg-[#17191d] ${className}`}>{children}</div>;
}

function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">{title}</div>
      {action}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  className = "",
  minHeight = "min-h-[220px]",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeight?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      className={`bom-editor ${minHeight} w-full resize-y rounded-lg border border-white/10 bg-[#0f1115] p-3 font-mono text-xs leading-relaxed text-white/80 outline-none focus:border-[#8ab4ff]/70 ${className}`}
    />
  );
}

function IdentityPanel(props: {
  model: string;
  serial: string;
  job: BomJob | null;
  jobIdInput: string;
  jobBusy: boolean;
  jobError: string | null;
  setModel: (value: string) => void;
  setSerial: (value: string) => void;
  setJobIdInput: (value: string) => void;
  createOrLoadJob: () => void;
  loadScenarioByType: (type: PromptScenarioType, patch?: Record<string, unknown>) => void;
  setActiveMode: (mode: BomWorkspaceMode) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel>
        <PanelHeader title="Identity" />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Model</span>
            <input
              value={props.model}
              onChange={(event) => props.setModel(event.target.value.toUpperCase())}
              className="h-10 rounded-lg border border-white/10 bg-[#0f1115] px-3 font-mono text-sm text-white outline-none focus:border-[#8ab4ff]"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Serial</span>
            <input
              value={props.serial}
              onChange={(event) => props.setSerial(event.target.value.toUpperCase())}
              className="h-10 rounded-lg border border-white/10 bg-[#0f1115] px-3 font-mono text-sm text-white outline-none focus:border-[#8ab4ff]"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Job</span>
            <input
              value={props.jobIdInput}
              onChange={(event) => props.setJobIdInput(event.target.value.trim())}
              className="h-10 rounded-lg border border-white/10 bg-[#0f1115] px-3 font-mono text-xs text-white outline-none focus:border-[#8ab4ff]"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={props.createOrLoadJob}
            disabled={props.jobBusy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-bold text-black disabled:opacity-50"
          >
            {props.jobBusy ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            Load/Create
          </button>
          <button
            type="button"
            onClick={() => {
              props.loadScenarioByType("identity_extraction");
              props.setActiveMode("prompt_scenarios");
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white/75 hover:bg-white/10"
          >
            <FileCode2 size={15} />
            Identity Prompt
          </button>
        </div>
        {props.jobError ? <div className="border-t border-red-400/20 p-3 text-xs text-red-300">{props.jobError}</div> : null}
      </Panel>

      <Panel>
        <PanelHeader title="Job Context" />
        <div className="grid gap-2 p-4 text-xs">
          {[
            ["Brand", props.job?.brand || "-"],
            ["Model", props.job?.model || props.model || "-"],
            ["Serial", props.job?.serial || props.serial || "-"],
            ["Product", props.job?.productType || "-"],
            ["Rows", String(props.job?.uniqueRowCount ?? 0)],
            ["State", props.job?.retrievalState || "prompt_workspace"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-lg bg-white/5 px-3 py-2">
              <span className="text-white/40">{label}</span>
              <span className="truncate font-mono text-white/80">{value}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PromptScenarioPanel(props: {
  scenarios: PromptScenario[];
  selectedScenario: PromptScenario | undefined;
  systemPrompt: string;
  userPromptTemplate: string;
  inputPayloadText: string;
  inputError: string | null;
  runBusy: boolean;
  runError: string | null;
  lastRun: PromptRun | null;
  savedPromptStatus: string | null;
  setSystemPrompt: (value: string) => void;
  setUserPromptTemplate: (value: string) => void;
  setInputPayloadText: (value: string) => void;
  loadScenario: (scenario: PromptScenario, patch?: Record<string, unknown>) => void;
  runScenario: () => void;
  saveWinningPrompt: () => void;
  copyText: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="grid min-w-0 gap-4">
        <Panel>
          <PanelHeader
            title="Prompt Scenario"
            action={
              <select
                value={props.selectedScenario?.id || ""}
                onChange={(event) => {
                  const scenario = props.scenarios.find((item) => item.id === event.target.value);
                  if (scenario) props.loadScenario(scenario);
                }}
                className="h-8 max-w-[260px] rounded-lg border border-white/10 bg-[#0f1115] px-2 text-xs text-white outline-none"
              >
                {props.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            }
          />
          <div className="grid gap-3 p-4">
            <div className="grid gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">System</div>
              <TextArea value={props.systemPrompt} onChange={props.setSystemPrompt} minHeight="min-h-[170px]" />
            </div>
            <div className="grid gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">User Template</div>
              <TextArea value={props.userPromptTemplate} onChange={props.setUserPromptTemplate} minHeight="min-h-[145px]" />
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Input Payload</span>
                {props.inputError ? <span className="text-[10px] text-red-300">{props.inputError}</span> : null}
              </div>
              <TextArea value={props.inputPayloadText} onChange={props.setInputPayloadText} minHeight="min-h-[180px]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
            <button
              type="button"
              onClick={props.runScenario}
              disabled={props.runBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#8ab4ff] px-4 text-xs font-bold text-[#07111f] disabled:opacity-50"
            >
              {props.runBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run Two Models
            </button>
            <button
              type="button"
              onClick={props.saveWinningPrompt}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white/75 hover:bg-white/10"
            >
              <Save size={14} />
              Save Prompt
            </button>
            {props.savedPromptStatus ? <span className="text-xs text-emerald-300">{props.savedPromptStatus}</span> : null}
            {props.runError ? <span className="text-xs text-red-300">{props.runError}</span> : null}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4">
        <OutputComparison run={props.lastRun} copyText={props.copyText} />
      </div>
    </div>
  );
}

function OutputComparison({
  run,
  copyText,
}: {
  run: PromptRun | null;
  copyText: (value: string) => void;
}) {
  const slotA = run?.outputs.find((output) => output.slotId === "slot_a") || null;
  const slotB = run?.outputs.find((output) => output.slotId === "slot_b") || null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <ModelOutputPanel title="Model A" output={slotA} copyText={copyText} />
        <ModelOutputPanel title="Model B" output={slotB} copyText={copyText} />
      </div>
      <Panel>
        <PanelHeader title="Compare" />
        <div className="grid gap-3 p-4 md:grid-cols-4">
          {[
            ["Run", run?.id.slice(0, 8) || "-"],
            ["Scenario", run?.scenarioName || "-"],
            ["A chars", slotA ? String(slotA.rawOutput.length) : "-"],
            ["B chars", slotB ? String(slotB.rawOutput.length) : "-"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-1 truncate font-mono text-sm text-white/80">{value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ModelOutputPanel({
  title,
  output,
  copyText,
}: {
  title: string;
  output: PromptRun["outputs"][number] | null;
  copyText: (value: string) => void;
}) {
  return (
    <Panel className="min-h-[520px]">
      <PanelHeader
        title={title}
        action={
          output ? (
            <button
              type="button"
              onClick={() => copyText(output.rawOutput)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[10px] text-white/60 hover:bg-white/10"
            >
              <Copy size={12} />
              Copy
            </button>
          ) : null
        }
      />
      {output ? (
        <div className="grid gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            <span className="rounded bg-white/8 px-2 py-1 text-white/55">{output.modelName}</span>
            <span className="rounded bg-white/8 px-2 py-1 text-white/55">{output.validationStatus}</span>
            {output.mock ? <span className="rounded bg-amber-400/15 px-2 py-1 text-amber-200">mock</span> : null}
            <span className="rounded bg-white/8 px-2 py-1 text-white/55">{output.latencyMs}ms</span>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-[#0f1115] p-3 font-mono text-xs leading-relaxed text-white/75">
            {output.rawOutput}
          </pre>
        </div>
      ) : (
        <div className="flex min-h-[430px] items-center justify-center text-xs uppercase tracking-widest text-white/30">
          No output
        </div>
      )}
    </Panel>
  );
}

function SupplierActionGrid({
  suppliers,
  model,
  selectSupplierAction,
}: {
  suppliers: SupplierCard[];
  model: string;
  selectSupplierAction: (supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") => void;
}) {
  return (
    <Panel>
      <PanelHeader title="Supplier Runs" />
      <div className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
        {suppliers.map((supplier) => (
          <div key={supplier.id} className="rounded-xl border border-white/10 bg-[#111317] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{supplier.label}</div>
                <div className="truncate font-mono text-[11px] text-white/35">{supplier.domain}</div>
              </div>
              <CircleDot size={14} className={model ? "text-emerald-300" : "text-white/20"} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["diagrams", "bom", "pricing"] as const).map((task) => (
                <button
                  key={task}
                  type="button"
                  onClick={() => selectSupplierAction(supplier, task)}
                  className="h-9 rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 hover:text-white"
                >
                  {task === "diagrams" ? "Diagrams" : task.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BrowserWorkbench(props: {
  browserSupplier: SupplierId;
  browserUrl: string;
  browserFrameUrl: string;
  captures: BrowserSourceCapture[];
  suppliers: SupplierCard[];
  model: string;
  setBrowserSupplier: (value: SupplierId) => void;
  setBrowserUrl: (value: string) => void;
  setBrowserFrameUrl: (value: string) => void;
  queueCapture: (kind: BrowserSourceCapture["captureKind"], label: string) => void;
}) {
  const selectedSupplier = props.suppliers.find((supplier) => supplier.id === props.browserSupplier) || props.suppliers[1];

  function applySupplierUrl() {
    const url = supplierUrl(selectedSupplier, props.model);
    props.setBrowserUrl(url);
    if (url) props.setBrowserFrameUrl(url);
  }

  return (
    <div className="grid h-full min-h-[720px] gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeader
          title="Browser Workbench"
          action={
            <div className="flex items-center gap-2">
              <select
                value={props.browserSupplier}
                onChange={(event) => props.setBrowserSupplier(event.target.value as SupplierId)}
                className="h-8 rounded-lg border border-white/10 bg-[#0f1115] px-2 text-xs text-white outline-none"
              >
                {props.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applySupplierUrl}
                className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"
              >
                URL
              </button>
            </div>
          }
        />
        <div className="flex items-center gap-2 border-b border-white/10 p-3">
          <input
            value={props.browserUrl}
            onChange={(event) => props.setBrowserUrl(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0f1115] px-3 font-mono text-xs text-white outline-none focus:border-[#8ab4ff]"
            placeholder="https://supplier.example/model"
          />
          <button
            type="button"
            onClick={() => props.setBrowserFrameUrl(props.browserUrl)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-bold text-black"
          >
            <Globe2 size={15} />
            Load
          </button>
          {props.browserFrameUrl ? (
            <a
              href={props.browserFrameUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/70 hover:bg-white/10"
            >
              <ExternalLink size={15} />
              Tab
            </a>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 bg-[#0b0c0f]">
          {props.browserFrameUrl ? (
            <iframe
              title="BOM source browser"
              src={props.browserFrameUrl}
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
              className="h-full min-h-[620px] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full min-h-[620px] items-center justify-center text-center text-xs uppercase tracking-widest text-white/30">
              Load a supplier URL
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Parser Scaffold" />
        <div className="grid gap-3 p-3">
          {[
            { label: "DOM", kind: "dom", detail: "DOM snapshot" },
            { label: "XHR", kind: "xhr_json", detail: "JSON/XHR capture" },
            { label: "IMG", kind: "diagram_image", detail: "Diagram image" },
            { label: "NOTE", kind: "manual_note", detail: "Manual note" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => props.queueCapture(item.kind as BrowserSourceCapture["captureKind"], item.detail)}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
            >
              <span className="text-xs font-semibold text-white/75">{item.detail}</span>
              <span className="rounded bg-white/8 px-2 py-1 text-[10px] font-bold text-white/40">plan</span>
            </button>
          ))}
          <div className="mt-2 grid gap-2">
            {props.captures.length ? (
              props.captures.slice(0, 8).map((capture) => (
                <div key={capture.id} className="rounded-lg bg-[#0f1115] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-white/70">{capture.label}</span>
                    <span className="text-[10px] uppercase tracking-widest text-amber-200">{capture.status}</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-white/30">{capture.sourceUrl || "-"}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-5 text-center text-[11px] uppercase tracking-widest text-white/25">
                No capture plans
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function BomExtractionPanel(props: {
  rawRows: Array<Record<string, unknown>>;
  finalRows: Array<Record<string, unknown>>;
  loadScenarioByType: (type: PromptScenarioType, patch?: Record<string, unknown>) => void;
  setActiveMode: (mode: BomWorkspaceMode) => void;
}) {
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader
          title="BOM Results"
          action={
            <button
              type="button"
              onClick={() => {
                props.loadScenarioByType("bom_extraction");
                props.setActiveMode("prompt_scenarios");
              }}
              className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"
            >
              Prompt
            </button>
          }
        />
        <BomResultTable rows={props.finalRows} />
      </Panel>
      <Panel>
        <PanelHeader title="Raw Row Preview" />
        <BomResultTable rows={props.rawRows} compact />
      </Panel>
    </div>
  );
}

function BomResultTable({
  rows,
  compact = false,
}: {
  rows: Array<Record<string, unknown>>;
  compact?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-xs uppercase tracking-widest text-white/25">
        No rows
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-[#17191d] text-[10px] uppercase tracking-widest text-white/35">
          <tr>
            {["Status", "Part #", "Title", "Qty", "Diagram", "Section", "Supplier", "Source", "Confidence"].map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 15 : 80).map((row, index) => {
            const source = firstRowText(row, ["sourceUrl", "source_url", "source"]);
            return (
              <tr key={`${firstRowText(row, ["partNumber", "part_number"])}-${index}`} className="border-t border-white/8">
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["status", "retrievalStatus"]) || "review"}</td>
                <td className="px-3 py-2 font-mono text-white">{firstRowText(row, ["partNumber", "part_number", "currentServicePartNumber"]) || "-"}</td>
                <td className="max-w-[360px] truncate px-3 py-2 text-white/75">{firstRowText(row, ["partTitle", "part_title", "description", "title"]) || "-"}</td>
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["quantity", "qty"]) || "-"}</td>
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["diagramKey", "diagramNumber", "callout_number"]) || "-"}</td>
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["assemblySection", "section"]) || "-"}</td>
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["supplier", "sourceType", "source"]) || "-"}</td>
                <td className="max-w-[260px] truncate px-3 py-2 font-mono text-[11px] text-[#8ab4ff]">{source || "-"}</td>
                <td className="px-3 py-2 text-white/55">{firstRowText(row, ["confidence"]) || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PricingPanel(props: {
  finalRows: Array<Record<string, unknown>>;
  loadScenarioByType: (type: PromptScenarioType, patch?: Record<string, unknown>) => void;
  setActiveMode: (mode: BomWorkspaceMode) => void;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Pricing"
        action={
          <button
            type="button"
            onClick={() => {
              props.loadScenarioByType("pricing_reconciliation");
              props.setActiveMode("prompt_scenarios");
            }}
            className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"
          >
            Pricing Prompt
          </button>
        }
      />
      <div className="grid gap-3 p-4 md:grid-cols-3">
        {[
          ["Validated rows", String(props.finalRows.length)],
          ["Pricing source", "not wired"],
          ["Execution", "deferred"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
            <div className="mt-2 font-mono text-xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ValidationPanel(props: {
  lastValidation: PromptValidationResult | null;
  validateLatestRun: () => void;
  lastRun: PromptRun | null;
  finalRows: Array<Record<string, unknown>>;
}) {
  const accepted = props.lastValidation?.acceptedRows || [];
  const rejected = props.lastValidation?.rejectedRows || [];
  const warnings = props.lastValidation?.warnings || [];
  const errors = props.lastValidation?.errors || [];

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader
          title="Validation"
          action={
            <button
              type="button"
              onClick={props.validateLatestRun}
              disabled={!props.lastRun}
              className="h-8 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40"
            >
              Run Gate
            </button>
          }
        />
        <div className="grid gap-3 p-4 md:grid-cols-5">
          {[
            ["Accepted", String(accepted.length)],
            ["Rejected", String(rejected.length)],
            ["Warnings", String(warnings.length)],
            ["Errors", String(errors.length)],
            ["Status", props.lastValidation?.completenessStatus || "unknown"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-2 truncate font-mono text-lg text-white">{value}</div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Accepted Rows" />
          <BomResultTable rows={accepted.length ? accepted : props.finalRows} compact />
        </Panel>
        <Panel>
          <PanelHeader title="Rejected / Warnings" />
          <div className="grid gap-2 p-3">
            {[...errors.map((message) => ["error", message]), ...warnings.map((message) => ["warning", message])].map(([kind, message], index) => (
              <div key={`${kind}-${index}`} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                <span className={kind === "error" ? "text-red-300" : "text-amber-200"}>{kind}</span>
                <span className="ml-2">{message}</span>
              </div>
            ))}
            {rejected.map((item, index) => (
              <div key={`rejected-${index}`} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                <span className="text-red-300">rejected</span>
                <span className="ml-2">{item.reason}</span>
              </div>
            ))}
            {!errors.length && !warnings.length && !rejected.length ? (
              <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-xs uppercase tracking-widest text-white/25">
                No validation events
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ExportReviewPanel({
  runHistory,
  lastRun,
}: {
  runHistory: PromptRun[];
  lastRun: PromptRun | null;
}) {
  return (
    <Panel>
      <PanelHeader title="Saved Output / History" />
      <div className="grid gap-2 p-4">
        {(runHistory.length ? runHistory : lastRun ? [lastRun] : []).map((run) => (
          <div key={run.id} className="grid gap-2 rounded-lg border border-white/10 bg-[#111317] p-3 md:grid-cols-[180px_1fr_120px]">
            <div className="font-mono text-xs text-white/60">{run.id.slice(0, 8)}</div>
            <div className="truncate text-sm text-white/80">{run.scenarioName}</div>
            <div className="text-right text-xs text-white/45">{run.outputs.length} outputs</div>
          </div>
        ))}
        {!runHistory.length && !lastRun ? (
          <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-xs uppercase tracking-widest text-white/25">
            No runs saved
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function RightInspector(props: {
  modelSlots: ModelSlot[];
  activeMode: BomWorkspaceMode;
  selectedScenario: PromptScenario | undefined;
  inputPayload: Record<string, unknown>;
  job: BomJob | null;
  jobId: string;
  model: string;
  browserFrameUrl: string;
  lastRun: PromptRun | null;
  lastValidation: PromptValidationResult | null;
  updateSlot: (slotId: ModelSlot["id"], patch: Partial<ModelSlot>) => void;
  saveWinningPrompt: () => void;
}) {
  return (
    <aside className="bom-inspector hidden min-h-0 border-l border-white/10 bg-[#17191d] xl:flex xl:flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-white/10 px-3">
        <PanelRight size={15} className="text-white/45" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">Inspector</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid gap-3">
          <InspectorBlock title="Model Settings" icon={<Settings2 size={14} />}>
            <div className="grid gap-3">
              {props.modelSlots.slice(0, 2).map((slot) => (
                <div key={slot.id} className="rounded-lg bg-[#0f1115] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-white/70">{slot.id}</span>
                    <label className="flex items-center gap-2 text-[11px] text-white/45">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={(event) => props.updateSlot(slot.id, { enabled: event.target.checked })}
                      />
                      enabled
                    </label>
                  </div>
                  <select
                    value={slot.modelName}
                    onChange={(event) =>
                      props.updateSlot(slot.id, {
                        modelName: event.target.value as ModelSlot["modelName"],
                      })
                    }
                    className="mb-2 h-9 w-full rounded-md border border-white/10 bg-[#17191d] px-2 text-xs text-white outline-none"
                  >
                    <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                    <option value="gemini-3-pro-preview">gemini-3-pro-preview</option>
                  </select>
                  <select
                    value={slot.provider}
                    onChange={(event) =>
                      props.updateSlot(slot.id, {
                        provider: event.target.value as ModelSlot["provider"],
                      })
                    }
                    className="mb-2 h-9 w-full rounded-md border border-white/10 bg-[#17191d] px-2 text-xs text-white outline-none"
                  >
                    <option value="gemini">gemini</option>
                    <option value="manual">manual</option>
                    <option value="mock">mock</option>
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["Temp", "temperature", slot.temperature ?? 1],
                      ["TopP", "topP", slot.topP ?? 0.8],
                      ["Max", "maxOutputTokens", slot.maxOutputTokens ?? 8192],
                    ].map(([label, key, value]) => (
                      <label key={String(key)} className="grid gap-1">
                        <span className="text-[9px] uppercase tracking-widest text-white/30">{label}</span>
                        <input
                          value={String(value)}
                          onChange={(event) =>
                            props.updateSlot(slot.id, {
                              [String(key)]: Number(event.target.value),
                            } as Partial<ModelSlot>)
                          }
                          className="h-8 rounded-md border border-white/10 bg-[#17191d] px-2 font-mono text-[11px] text-white outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] uppercase tracking-widest text-white/30">
                Two model slots max
              </div>
            </div>
          </InspectorBlock>

          <InspectorBlock title="Source Context" icon={<Globe2 size={14} />}>
            <KeyValue label="Mode" value={props.activeMode} />
            <KeyValue label="Model" value={props.model || "-"} />
            <KeyValue label="Job" value={props.jobId || props.job?.id || "-"} />
            <KeyValue label="Browser" value={props.browserFrameUrl || "-"} />
          </InspectorBlock>

          <InspectorBlock title="Run Metadata" icon={<History size={14} />}>
            <KeyValue label="Scenario" value={props.selectedScenario?.name || "-"} />
            <KeyValue label="Type" value={props.selectedScenario?.type || "-"} />
            <KeyValue label="Last run" value={props.lastRun?.id.slice(0, 8) || "-"} />
            <KeyValue label="Outputs" value={String(props.lastRun?.outputs.length || 0)} />
          </InspectorBlock>

          <InspectorBlock title="Validation" icon={<BadgeCheck size={14} />}>
            <KeyValue label="Valid" value={props.lastValidation ? String(props.lastValidation.valid) : "-"} />
            <KeyValue label="Errors" value={String(props.lastValidation?.errors.length || 0)} />
            <KeyValue label="Warnings" value={String(props.lastValidation?.warnings.length || 0)} />
            <KeyValue label="Accepted" value={String(props.lastValidation?.acceptedRows.length || 0)} />
          </InspectorBlock>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={props.saveWinningPrompt}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white text-xs font-bold text-black"
            >
              <CheckCircle2 size={14} />
              Save
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-white/60"
            >
              <XCircle size={14} />
              Reject
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function InspectorBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#101216]">
      <div className="flex h-9 items-center gap-2 border-b border-white/10 px-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
        {icon}
        {title}
      </div>
      <div className="grid gap-2 p-3">{children}</div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-white/5 px-2 py-1.5 text-xs">
      <span className="shrink-0 text-white/35">{label}</span>
      <span className="min-w-0 truncate font-mono text-white/70">{value}</span>
    </div>
  );
}
