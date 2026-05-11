"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  Database,
  DollarSign,
  ExternalLink,
  FileCode2,
  Fingerprint,
  Globe2,
  Hammer,
  History,
  Home,
  ImageIcon,
  Loader2,
  Mic,
  Monitor,
  Package,
  PanelRight,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Terminal,
  Upload,
  UserCircle,
  Video,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { SystemInstructionsDrawer, getInstructionStackNames } from "./system-instructions-drawer";
import { ComputerUseSupervisor } from "./computer-use-supervisor";
import { CanvasViewport } from "./canvas/canvas-viewport";
import {
  buildCanonicalEncompassUrls,
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "@/src/features/bom/services/source-tier-policy";
import {
  DEFAULT_MODEL_SLOTS,
  DEFAULT_MODEL_TOOLS,
  type BomWorkspaceMode,
  type BrowserSourceCapture,
  type ModelSlot,
  type ModelToolSettings,
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
  initialAction?: string;
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

type WorkspaceView = "studio" | "mission";
type WorkbenchScreen = "canvas" | "browser" | "models" | "supervisor";

type PromptAttachmentKind = "image" | "document" | "file";

type PromptAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: PromptAttachmentKind;
  data: string;
  inline: boolean;
};

type SupplierCard = {
  id: SupplierId;
  label: string;
  domain: string;
};

const RUN_HISTORY_KEY = "bom-prompt-workspace:runs";
const MAX_PROMPT_ATTACHMENT_BYTES = 2_000_000;
const MAX_URL_CONTEXT_URLS = 20;

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

type ModelCatalogItem = {
  id: ModelSlot["modelName"] | string;
  name: string;
  alias: string;
  category: "Featured" | "Gemini" | "Agents" | "Images" | "Video" | "Audio" | "Live";
  description: string;
  context: string;
  cost: string;
  cutoff: string;
  releaseDate: string;
  selectable: boolean;
};

const MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite Preview",
    alias: "gemini-3.1-flash-lite-preview",
    category: "Featured",
    description: "Roadrunner default Gemini model for prompt runs, OCR, source review, and BOM support tasks.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Text output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: December 2025",
    selectable: true,
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    alias: "gemini-3-flash-preview",
    category: "Gemini",
    description: "Operator-selectable Flash Preview option for explicit Roadrunner fallback or stage-specific runs.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Text output model",
    cutoff: "January 2025",
    releaseDate: "Preview",
    selectable: true,
  },
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    alias: "gemini-3-pro-preview",
    category: "Gemini",
    description: "Legacy stronger-model fallback entry retained for reference; Roadrunner prompt runs normalize to Lite.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Text output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: November 2025",
    selectable: false,
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image Preview",
    alias: "gemini-3-pro-image-preview",
    category: "Images",
    description: "Gemini 3 image model for image and text input with image and text output.",
    context: "Input: 65,536 / Output: 32,768",
    cost: "Image output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: November 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    alias: "gemini-2.5-pro",
    category: "Gemini",
    description: "Stable thinking model for complex reasoning, coding, STEM, large datasets, and long-context documents.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Stable text output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: June 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    alias: "gemini-2.5-flash",
    category: "Gemini",
    description: "Stable price-performance model for low-latency, high-volume, thinking, and agentic use cases.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Stable text output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: June 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    alias: "gemini-2.5-flash-lite",
    category: "Gemini",
    description: "Fastest Flash model optimized for cost efficiency and high throughput.",
    context: "Input: 1,048,576 / Output: 65,536",
    cost: "Stable text output model",
    cutoff: "January 2025",
    releaseDate: "Latest update: July 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    alias: "gemini-2.5-flash-image",
    category: "Images",
    description: "Image and text model for image generation workflows.",
    context: "Input: 65,536 / Output: 32,768",
    cost: "Stable image output model",
    cutoff: "June 2025",
    releaseDate: "Latest update: October 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    name: "Gemini 2.5 Flash Live",
    alias: "gemini-2.5-flash-native-audio-preview-12-2025",
    category: "Live",
    description: "Live API model for audio, video, and text input with audio and text output.",
    context: "Input: 131,072 / Output: 8,192",
    cost: "Live audio/text model",
    cutoff: "January 2025",
    releaseDate: "Latest update: September 2025",
    selectable: false,
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    name: "Gemini 2.5 Flash TTS",
    alias: "gemini-2.5-flash-preview-tts",
    category: "Audio",
    description: "Text-to-speech model for text input and audio output.",
    context: "Input: 8,192 / Output: 16,384",
    cost: "Audio output model",
    cutoff: "N/A",
    releaseDate: "Latest update: December 2025",
    selectable: false,
  },
];

const MODEL_FILTERS = ["All", "Featured", "Gemini", "Agents", "Images", "Video", "Audio", "Live"] as const;

type ModelToolToggleKey =
  | "structuredOutputs"
  | "codeExecution"
  | "functionCalling"
  | "googleSearchGrounding"
  | "googleMapsGrounding"
  | "urlContext"
  | "computerUse";

const TOOL_LABELS: Array<{ key: ModelToolToggleKey; label: string; editable?: boolean }> = [
  { key: "structuredOutputs", label: "Structured outputs", editable: true },
  { key: "codeExecution", label: "Code execution" },
  { key: "functionCalling", label: "Function calling", editable: true },
  { key: "googleSearchGrounding", label: "Grounding with Google Search" },
  { key: "googleMapsGrounding", label: "Grounding with Google Maps" },
  { key: "urlContext", label: "URL context" },
  { key: "computerUse", label: "Computer Use", editable: true },
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

const WORKBENCH_SCREENS: Array<{
  screen: WorkbenchScreen;
  label: string;
  icon: typeof Monitor;
}> = [
  { screen: "canvas", label: "Project canvas", icon: Boxes },
  { screen: "browser", label: "Browser windows", icon: Monitor },
  { screen: "models", label: "Model outputs", icon: Bot },
  { screen: "supervisor", label: "Playwright supervisor", icon: Globe2 },
];

const TASK_TO_SCENARIO: Record<"diagrams" | "bom" | "pricing", PromptScenarioType> = {
  diagrams: "diagram_discovery",
  bom: "bom_extraction",
  pricing: "pricing_reconciliation",
};

const WORKFLOW_SCENARIO_GROUPS: Array<{
  label: string;
  types: PromptScenarioType[];
}> = [
  {
    label: "Identity",
    types: ["identity_extraction", "nameplate_ocr_identity_json", "plaintext_identity_extraction"],
  },
  {
    label: "Source Discovery",
    types: ["supplier_url_generation", "official_parts_source_search", "diagram_discovery", "computer_use_navigation"],
  },
  {
    label: "Extraction",
    types: ["technical_diagram_callouts_csv", "bom_extraction", "bom_row_extraction_json", "visual_qa_drift_json"],
  },
  {
    label: "Validation & Pricing",
    types: ["bom_validation", "pricing_reconciliation", "pricing_router", "retail_pricing_verification"],
  },
  {
    label: "Marketplace",
    types: ["ebay_listing_prep", "market_intelligence_survey", "visual_loop_recovery"],
  },
  {
    label: "May 7 RLD Reference",
    types: [
      "may7_rld_orchestration_phase_1a",
      "may7_unified_image_tattoo_lock_extraction",
      "may7_tattoo_surgical_edit",
      "may7_tattoo_flash_variant_sheet",
      "may7_global_rld_prompt_rule",
    ],
  },
  {
    label: "May 7 Roadrunner",
    types: [
      "may7_roadrunner_identity_extraction",
      "may7_roadrunner_orchestrator",
      "may7_roadrunner_parts_extraction",
      "may7_roadrunner_pricing_extraction",
      "may7_roadrunner_final_bom_audit",
      "may7_roadrunner_diagnostic",
    ],
  },
];

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

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCaptureKind(kind: BrowserSourceCapture["captureKind"]) {
  return kind.replaceAll("_", " ");
}

function readFileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] || "" : result);
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function promptAttachmentPayload(attachment: PromptAttachment) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    inline: attachment.inline,
    dataBase64: attachment.data,
  };
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
  const canonical = normalizeCanonicalModel(model);
  const encoded = encodeURIComponent(canonical || model || "");
  if (supplier.id === "manual-pdf" || supplier.id === "diagram-upload") return "";
  if (supplier.id === "encompass") {
    return (
      buildKnownEncompassAssemblyUrl(canonical) ||
      buildCanonicalEncompassUrls({ model: canonical }).explodedViewUrl ||
      `https://encompass.com/Exploded-View-Search?searchTerm=${encoded}`
    );
  }
  if (supplier.id === "sears-partsdirect") return `https://www.searspartsdirect.com/search?q=${encoded}`;
  if (supplier.id === "repairclinic") return `https://www.repairclinic.com/Shop-For-Parts?query=${encoded}`;
  if (supplier.id === "ge") return `https://www.geapplianceparts.com/store/parts/search?q=${encoded}`;
  if (supplier.id === "whirlpool") return `https://www.whirlpoolparts.com/Search?query=${encoded}`;
  if (supplier.id === "lg") return `https://lgparts.com/search?q=${encoded}`;
  if (supplier.id === "samsung") return `https://samsungparts.com/search?q=${encoded}`;
  return "";
}

function uniqueUrls(urls: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const clean = String(url || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_URL_CONTEXT_URLS) break;
  }
  return out;
}

function urlOf(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return String(record.url || record.sourceUrl || record.href || "").trim();
}

function urlsFromPayload(inputPayload: Record<string, unknown>) {
  return uniqueUrls([
    ...normalizeUrlList(inputPayload.sourceUrls),
    ...normalizeUrlList(inputPayload.candidateUrls),
    ...normalizeUrlList(inputPayload.sourceUrl),
  ]);
}

function normalizeUrlList(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(urlOf).filter(Boolean);
}

function buildWorkspaceToolContext(inputPayload: Record<string, unknown>) {
  const urls = urlsFromPayload(inputPayload);
  return {
    urlContext: {
      enabled: urls.length > 0,
      maxUrls: MAX_URL_CONTEXT_URLS,
      urls,
    },
    googleSearch: {
      enabled: true,
    },
    functionCalling: {
      enabled: true,
      callLimit: null,
      mode: "AUTO",
      allowedFunctionNames: [],
      functionDeclarations: [],
    },
  };
}

async function resolveSupplierUrls(input: {
  supplier: SupplierCard;
  model: string;
  brand?: string | null;
}) {
  const canonical = normalizeCanonicalModel(input.model);
  if (input.supplier.id !== "encompass" || !canonical) {
    const url = supplierUrl(input.supplier, canonical || input.model);
    return { primaryUrl: url, urls: uniqueUrls([url]) };
  }

  const localFallback =
    buildKnownEncompassAssemblyUrl(canonical, input.brand) ||
    buildCanonicalEncompassUrls({ model: canonical, brand: input.brand }).explodedViewUrl ||
    supplierUrl(input.supplier, canonical);
  const canonicalUrl = buildCanonicalEncompassUrls({ model: canonical, brand: input.brand }).explodedViewUrl;

  try {
    const params = new URLSearchParams({ model: canonical });
    if (input.brand) params.set("brand", input.brand);
    const res = await fetch(`/api/bom/encompass-index?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return { primaryUrl: localFallback, urls: uniqueUrls([localFallback, canonicalUrl]) };
    const selectedUrl = data.selected?.url || data.url || data.fallbackUrl;
    const candidateUrls = Array.isArray(data.candidates) ? data.candidates.map(urlOf) : [];
    const urls = uniqueUrls([
      typeof selectedUrl === "string" ? selectedUrl : "",
      data.fallbackUrl,
      localFallback,
      canonicalUrl,
      ...candidateUrls,
    ]);
    return { primaryUrl: urls[0] || localFallback, urls };
  } catch {
    return { primaryUrl: localFallback, urls: uniqueUrls([localFallback, canonicalUrl]) };
  }
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

function renderUserTemplatePreview(template: string, inputPayload: Record<string, unknown>) {
  const inputJson = JSON.stringify(inputPayload, null, 2);
  return String(template || "")
    .replaceAll("{{input_payload_json}}", inputJson)
    .replaceAll("{{inputPayloadJson}}", inputJson);
}

function buildCompiledRunPreview(input: {
  systemPrompt: string;
  userPromptTemplate: string;
  inputPayload: Record<string, unknown>;
  modelSlots: ModelSlot[];
}) {
  const toolContext = buildWorkspaceToolContext(input.inputPayload);
  const runConfig = input.modelSlots
    .filter((slot) => slot.enabled)
    .map((slot) => ({
      slotId: slot.id,
      model: slot.modelName,
      provider: slot.provider,
      temperature: slot.temperature ?? 1,
      topP: slot.topP ?? null,
      maxOutputTokens: slot.maxOutputTokens ?? null,
      tools: {
        sdkTools: [
          slot.tools?.googleSearchGrounding ? { googleSearch: {} } : null,
          slot.tools?.urlContext ? { urlContext: {} } : null,
          slot.tools?.functionCalling && toolContext.functionCalling.functionDeclarations.length
            ? { functionDeclarations: toolContext.functionCalling.functionDeclarations }
            : null,
        ].filter(Boolean),
        structuredOutputs: slot.tools?.structuredOutputs ?? null,
        codeExecution: slot.tools?.codeExecution ?? null,
        functionCalling: {
          enabled: slot.tools?.functionCalling ?? null,
          callLimit: slot.tools?.functionCalling ? null : "disabled",
          mode: toolContext.functionCalling.mode,
          allowedFunctionNames: toolContext.functionCalling.allowedFunctionNames,
          functionDeclarations: toolContext.functionCalling.functionDeclarations,
        },
        googleSearchGrounding: slot.tools?.googleSearchGrounding ?? null,
        googleMapsGrounding: slot.tools?.googleMapsGrounding ?? null,
        urlContext: {
          enabled: slot.tools?.urlContext ?? null,
          maxUrls: slot.tools?.urlContext ? MAX_URL_CONTEXT_URLS : 0,
          urls: slot.tools?.urlContext ? toolContext.urlContext.urls : [],
        },
        thinkingLevel: slot.tools?.thinkingLevel ?? null,
        mediaResolution: slot.tools?.mediaResolution ?? null,
        computerUse: slot.tools?.computerUse ?? null,
        stopSequence: slot.tools?.stopSequence || null,
      },
    }));

  return [
    "[RUN CONFIG AND TOOLS - SENT WITH REQUEST]",
    JSON.stringify(runConfig, null, 2),
    "",
    "[BASE SYSTEM INSTRUCTION AND SELECTED PRESETS - SENT AS SYSTEM]",
    input.systemPrompt.trim() || "(none)",
    "",
    "[OPERATOR OVERRIDE - SENT LAST AS USER PROMPT]",
    renderUserTemplatePreview(input.userPromptTemplate, input.inputPayload).trim() || "(none)",
  ].join("\n");
}

function instructionConflictWarnings(systemPrompt: string, scenarioType?: PromptScenarioType) {
  const warnings: string[] = [];
  const allowsComputerUse = /(computer use|visual loop|browser)\b[\s\S]{0,120}\b(allow|allowed|enable|enabled|use|run)/i.test(systemPrompt);
  const blocksComputerUse = /\b(no|disable|disabled|exclude|excluded|forbid|forbidden|do not|don't)\b[\s\S]{0,120}\bcomputer use/i.test(systemPrompt);
  const marketSignal = /market[-\s]?signal|market intelligence|ebay|listing|pricing|price/i.test(systemPrompt);
  const bomTruthScenario =
    scenarioType === "bom_extraction" ||
    scenarioType === "bom_row_extraction_json" ||
    scenarioType === "technical_diagram_callouts_csv";

  if (allowsComputerUse && blocksComputerUse) {
    warnings.push("Computer Use is both allowed and blocked by the active stack. Resolve the preset order or edit the presets before running.");
  }

  if (marketSignal && bomTruthScenario) {
    warnings.push("Market-signal/pricing instructions are active on a BOM truth extraction scenario.");
  }

  return warnings;
}

function scenarioByType(scenarios: PromptScenario[], type: PromptScenarioType) {
  return scenarios.find((scenario) => scenario.type === type) || null;
}

export function BomPromptWorkspace({
  initialModel = "",
  initialSerial = "",
  initialJobId = "",
  initialAction = "",
}: BomPromptWorkspaceProps) {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("mission");
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
  const [composerPrompt, setComposerPrompt] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
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
  const [workbenchScreen, setWorkbenchScreen] = useState<WorkbenchScreen>("canvas");
  const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [modelDrawerSlot, setModelDrawerSlot] = useState<ModelSlot["id"] | null>(null);
  const [missionSettingsOpen, setMissionSettingsOpen] = useState(false);
  const [missionSettingsSlot, setMissionSettingsSlot] = useState<ModelSlot["id"]>("slot_a");
  const [modelSearch, setModelSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<(typeof MODEL_FILTERS)[number]>("All");
  const [toolsPopoverSlot, setToolsPopoverSlot] = useState<ModelSlot["id"] | null>(null);
  const [isInstructionsDrawerOpen, setIsInstructionsDrawerOpen] = useState(false);

  useEffect(() => {
    (window as any).openInstructionsDrawer = () => setIsInstructionsDrawerOpen(true);
    return () => {
      delete (window as any).openInstructionsDrawer;
    };
  }, []);

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
  const instructionChips = useMemo(() => getInstructionStackNames(systemPrompt), [systemPrompt]);
  const instructionWarnings = useMemo(
    () => instructionConflictWarnings(systemPrompt, selectedScenario?.type),
    [selectedScenario?.type, systemPrompt],
  );

  const draftScenario = useCallback((): PromptScenario | null => {
    if (!selectedScenario) return null;
    return {
      ...selectedScenario,
      systemPrompt,
      userPromptTemplate: composerPrompt.trim() || userPromptTemplate,
    };
  }, [composerPrompt, selectedScenario, systemPrompt, userPromptTemplate]);
  const runPreviewText = useMemo(
    () =>
      buildCompiledRunPreview({
        systemPrompt,
        userPromptTemplate: composerPrompt.trim() || userPromptTemplate,
        inputPayload: inputPayload.value,
        modelSlots,
      }),
    [composerPrompt, inputPayload.value, modelSlots, systemPrompt, userPromptTemplate],
  );

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
    if (initialAction === "market_intel" || initialAction === "market_ops") {
      setWorkspaceView("mission");
      setActiveMode("pricing");
      setPromptDrawerOpen(false);
      loadScenarioByType("pricing_reconciliation");
    }
  }, [initialAction, loadScenarioByType]);

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
              tools: {
                ...(slot.tools || DEFAULT_MODEL_TOOLS),
                ...(patch.tools || {}),
              },
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
      const attachmentPayloads = promptAttachments.map(promptAttachmentPayload);
      const runInputPayload = promptAttachments.length
        ? {
            ...inputPayload.value,
            promptAttachments: attachmentPayloads,
            attachments: attachmentPayloads,
          }
        : inputPayload.value;
      const toolContext = buildWorkspaceToolContext(runInputPayload);
      const res = await fetch("/api/prompt-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          scenario,
          inputPayload: runInputPayload,
          toolContext,
          attachments: attachmentPayloads,
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

  async function selectSupplierAction(supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") {
    const activeModel = model || job?.model || "";
    const resolvedUrls = await resolveSupplierUrls({
      supplier,
      model: activeModel,
      brand: job?.brand || null,
    });
    const url = resolvedUrls.primaryUrl;
    setBrowserSupplier(supplier.id);
    setBrowserUrl(url);
    setBrowserFrameUrl("");
    loadScenarioByType(TASK_TO_SCENARIO[task], {
      supplier: supplier.label,
      supplierId: supplier.id,
      modelNumber: activeModel || null,
      sourceUrl: url || null,
      sourceUrls: resolvedUrls.urls,
      candidateUrls: resolvedUrls.urls.map((candidateUrl, index) => ({
        url: candidateUrl,
        priority: index + 1,
        role: index === 0 ? "primary" : "candidate",
      })),
      browserCapture: null,
      sourceEvidence: null,
      stagedOnly: true,
      runPolicy: `Do not navigate, search, extract, or execute until the operator presses Run. URL Context may include up to ${MAX_URL_CONTEXT_URLS} source URLs. Function calling is not capped by call count; obey stage-specific allowed-tool policy.`,
    });
    setActiveMode(TASK_TO_MODE[task]);
    setWorkbenchScreen("browser");
    setWorkspaceDrawerOpen(true);
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

  async function addPromptAttachments(files: FileList | null, kind: PromptAttachmentKind) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    try {
      const attachments = await Promise.all(
        selectedFiles.map(async (file) => {
          const inline = file.size <= MAX_PROMPT_ATTACHMENT_BYTES;
          return {
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind,
            data: inline ? await readFileData(file) : "",
            inline,
          };
        }),
      );

      setPromptAttachments((items) => [...items, ...attachments]);
      setInputPayloadText((current) => {
        const parsed = safeJsonParse(current);
        if (parsed.error) return current;
        const existing = Array.isArray(parsed.value.promptAttachments)
          ? parsed.value.promptAttachments
          : Array.isArray(parsed.value.attachments)
            ? parsed.value.attachments
            : [];
        const browserCapture = asRecord(parsed.value.browserCapture);
        const operatorUploads = Array.isArray(browserCapture.operatorUploads)
          ? browserCapture.operatorUploads
          : [];
        const attachmentPayloads = attachments.map(promptAttachmentPayload);
        return jsonText({
          ...parsed.value,
          promptAttachments: [...existing, ...attachmentPayloads],
          attachments: [...existing, ...attachmentPayloads],
          browserCapture: {
            ...browserCapture,
            operatorUploads: [
              ...operatorUploads,
              ...attachmentPayloads.map(({ dataBase64, ...summary }) => summary),
            ],
          },
        });
      });
      setComposerPrompt((current) => {
        const attachmentLines = attachments
          .map((attachment) =>
            `Attached ${attachment.kind}: ${attachment.name} (${attachment.mimeType}, ${formatFileSize(attachment.size)}${attachment.inline ? "" : ", metadata only"})`,
          )
          .join("\n");
        return current.trim() ? `${current.trimEnd()}\n\n${attachmentLines}` : attachmentLines;
      });
      setSavedPromptStatus(`${attachments.length} attachment${attachments.length === 1 ? "" : "s"} staged for next run`);
      attachments.forEach((attachment) =>
        queueCapture(
          attachment.kind === "image" ? "image_upload" : attachment.kind === "document" ? "document_upload" : "file_upload",
          `Attached ${attachment.name}`,
        ),
      );
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Attachment upload failed");
    }
  }

  function removePromptAttachment(id: string) {
    setPromptAttachments((items) => items.filter((attachment) => attachment.id !== id));
    setInputPayloadText((current) => {
      const parsed = safeJsonParse(current);
      if (parsed.error) return current;
      const browserCapture = asRecord(parsed.value.browserCapture);
      return jsonText({
        ...parsed.value,
        promptAttachments: Array.isArray(parsed.value.promptAttachments)
          ? parsed.value.promptAttachments.filter((attachment) => asRecord(attachment).id !== id)
          : parsed.value.promptAttachments,
        attachments: Array.isArray(parsed.value.attachments)
          ? parsed.value.attachments.filter((attachment) => asRecord(attachment).id !== id)
          : parsed.value.attachments,
        browserCapture: {
          ...browserCapture,
          operatorUploads: Array.isArray(browserCapture.operatorUploads)
            ? browserCapture.operatorUploads.filter((attachment) => asRecord(attachment).id !== id)
            : browserCapture.operatorUploads,
        },
      });
    });
  }

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  if (workspaceView === "mission") {
    return (
      <main className="bom-cockpit h-screen overflow-hidden">
        <div className="bom-cockpit-super">
          <span className="bom-cockpit-window-dot red" />
          <span className="bom-cockpit-window-dot yellow" />
          <span className="bom-cockpit-window-dot green" />
          <span className="bom-cockpit-version">MISSION COCKPIT</span>
          <div className="flex items-center gap-3">
            <span className="bom-cockpit-job">{model || job?.model || "no model"}</span>
            <button
              onClick={() => navigator.clipboard.writeText(jobId)}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-400 hover:bg-white/10 hover:text-white transition-all"
              title="Click to copy Job ID"
            >
              <Terminal size={10} />
              {jobId}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ScenarioWorkflowSelect scenarios={scenarios} selectedScenario={selectedScenario} loadScenario={loadScenario} />
            <button type="button" className="bom-cockpit-super-icon" data-tooltip="Prompt drawer" aria-label="Prompt drawer" onClick={() => setPromptDrawerOpen((open) => !open)}>
              <FileCode2 size={14} />
            </button>
            <button type="button" className="bom-cockpit-super-icon" data-tooltip="Model settings" aria-label="Model settings" onClick={() => setMissionSettingsOpen((open) => !open)}>
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>
        <div className="bom-cockpit-top">
          <div className="bom-cockpit-brand">
            <Link href="/" className="bom-cockpit-home" data-tooltip="Home" aria-label="Home">
              <Home size={14} />
            </Link>
            <div className="bom-cockpit-logo">
              Roadrunner <span>Cockpit</span>
            </div>
          </div>
          <div className="bom-cockpit-window-title">
            <Monitor size={14} />
            <span>{WORKBENCH_SCREENS.find((item) => item.screen === workbenchScreen)?.label || "Project canvas"}</span>
          </div>
          <div className="bom-cockpit-top-actions">
            <span className="bom-cockpit-pulse" />
            <button type="button" className="bom-cockpit-icon-button" data-tooltip="Prompt drawer" aria-label="Prompt drawer" onClick={() => setPromptDrawerOpen((open) => !open)}>
              <FileCode2 size={14} />
            </button>
            <button
              type="button"
              className={`bom-cockpit-icon-button ${missionSettingsOpen ? "on" : ""}`}
              data-tooltip="Run settings"
              aria-label="Run settings"
              onClick={() => setMissionSettingsOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} />
            </button>
            <button type="button" className="bom-cockpit-icon-button" data-tooltip="Model outputs" aria-label="Model outputs" onClick={() => setWorkbenchScreen("models")}>
              <Bot size={14} />
            </button>
          </div>
        </div>
        <div className="bom-cockpit-body">
          <CockpitRail activeMode={activeMode} setActiveMode={setActiveMode} setWorkbenchScreen={setWorkbenchScreen} setWorkspaceDrawerOpen={setWorkspaceDrawerOpen} />
          {workspaceDrawerOpen ? (
            <WorkspaceDrawer
              activeMode={activeMode}
              model={model}
              serial={serial}
              job={job}
              jobIdInput={jobIdInput}
              jobBusy={jobBusy}
              jobError={jobError}
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              lastRun={lastRun}
              lastValidation={lastValidation}
              runHistory={runHistory}
              finalRows={finalRows}
              rawRows={rawRows}
              captures={captures}
              suppliers={SUPPLIERS}
              setModel={setModel}
              setSerial={setSerial}
              setJobIdInput={setJobIdInput}
              createOrLoadJob={createOrLoadJob}
              loadScenario={loadScenario}
              selectSupplierAction={selectSupplierAction}
              validateLatestRun={validateLatestRun}
              setActiveMode={setActiveMode}
              onClose={() => setWorkspaceDrawerOpen(false)}
            />
          ) : null}
          <section className="bom-cockpit-center">
            <ScreenSwitchRail activeScreen={workbenchScreen} setActiveScreen={setWorkbenchScreen} />
            <WorkbenchStage
              screen={workbenchScreen}
              browserFrameUrl={browserFrameUrl}
              browserUrl={browserUrl}
              browserSupplier={browserSupplier}
              model={model}
              serial={serial}
              job={job}
              jobId={jobId}
              selectedScenario={selectedScenario}
              lastRun={lastRun}
              lastValidation={lastValidation}
              captures={captures}
              modelSlots={modelSlots}
              activeMode={activeMode}
              runHistory={runHistory}
            />
            <PromptCockpitDrawer
              open={promptDrawerOpen}
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              systemPrompt={systemPrompt}
              userPromptTemplate={userPromptTemplate}
              inputPayloadText={inputPayloadText}
              inputError={inputPayload.error}
              compiledRunPreview={runPreviewText}
              instructionWarnings={instructionWarnings}
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
            />
            {promptDrawerOpen ? (
              <MissionPromptComposer
                selectedScenario={selectedScenario}
                promptText={composerPrompt}
                inputError={inputPayload.error}
                runBusy={runBusy}
                runError={runError}
                savedPromptStatus={savedPromptStatus}
                instructionChips={instructionChips}
                instructionWarnings={instructionWarnings}
                toolsPopoverSlot={toolsPopoverSlot}
                activeSlot={modelSlots.find((slot) => slot.id === toolsPopoverSlot) || activeSlots[0] || modelSlots[0]}
                attachments={promptAttachments}
                suppliers={SUPPLIERS}
                setPromptText={setComposerPrompt}
                runScenario={runScenario}
                updateSlot={updateSlot}
                setToolsPopoverSlot={setToolsPopoverSlot}
                addPromptAttachments={addPromptAttachments}
                removePromptAttachment={removePromptAttachment}
                createOrLoadJob={createOrLoadJob}
                queueCapture={queueCapture}
                selectSupplierAction={selectSupplierAction}
                validateLatestRun={validateLatestRun}
                activeSlotsCount={activeSlots.length}
              />
            ) : (
              <CanvasQuickDock
                openPrompt={() => setPromptDrawerOpen(true)}
                openSettings={() => setMissionSettingsOpen(true)}
                showModels={() => setWorkbenchScreen("models")}
              />
            )}
          </section>
          {missionSettingsOpen ? (
            <MissionRunSettingsRail
              modelSlots={modelSlots}
              activeSlotId={missionSettingsSlot}
              setActiveSlotId={setMissionSettingsSlot}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              instructionChips={instructionChips}
              instructionWarnings={instructionWarnings}
              onOpenModelDrawer={(slotId) => setModelDrawerSlot(slotId)}
              onPatch={updateSlot}
              onClose={() => setMissionSettingsOpen(false)}
            />
          ) : null}
          <SystemInstructionsDrawer
            isOpen={isInstructionsDrawerOpen}
            onClose={() => setIsInstructionsDrawerOpen(false)}
            currentInstruction={systemPrompt}
            baseInstruction={selectedScenario?.systemPrompt || ""}
            jobId={jobId}
            onSelect={(content) => setSystemPrompt(content)}
          />
          <ModelSelectionPortal
            slot={modelDrawerSlot ? modelSlots.find((item) => item.id === modelDrawerSlot) || modelSlots[0] : null}
            search={modelSearch}
            filter={modelFilter}
            setSearch={setModelSearch}
            setFilter={setModelFilter}
            onClose={() => setModelDrawerSlot(null)}
            onSelect={(modelName) => {
              if (modelDrawerSlot) updateSlot(modelDrawerSlot, { modelName });
              setModelDrawerSlot(null);
            }}
          />
          {false ? (
            <RightInspector
              modelSlots={modelSlots}
              activeMode={activeMode}
              selectedScenario={selectedScenario}
              inputPayload={(inputPayload.value || {}) as Record<string, unknown>}
              job={job}
              jobId={jobId}
              model={model}
              browserFrameUrl={browserFrameUrl}
              lastRun={lastRun}
              lastValidation={lastValidation}
              updateSlot={updateSlot}
              saveWinningPrompt={saveWinningPrompt}
            />
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className={`ai-studio-shell ${modelDrawerSlot ? "drawer-open" : ""}`}>
      <AIStudioLeftNav activeMode={activeMode} setActiveMode={setActiveMode} />

      <section className="ai-studio-main">
        <header className="ai-studio-topbar">
          <button
            type="button"
            className="ai-icon-button"
            onClick={() => setRailExpanded((expanded) => !expanded)}
            title="Toggle navigation"
          >
            {railExpanded ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
          <strong>Playground</strong>
          <div className="ai-topbar-actions">
            <button type="button" className="ai-icon-button" title="Copy prompt" onClick={() => copyText(inputPayloadText)}>
              <Copy size={15} />
            </button>
            <button type="button" className="ai-icon-button" title="Add model" onClick={() => updateSlot("slot_b", { enabled: true })}>
              <Plus size={15} />
            </button>
            <button type="button" className="ai-icon-button" title="Prompt cockpit" onClick={() => setPromptDrawerOpen((open) => !open)}>
              <FileCode2 size={15} />
            </button>
            <button type="button" className="ai-icon-button" title="Mission cockpit" onClick={() => setWorkspaceView("mission")}>
              <Globe2 size={15} />
            </button>
          </div>
        </header>

        <div className={`ai-workspace ${activeSlots.length > 1 ? "two-model" : "one-model"}`}>
          <div className="ai-project-stage">
            <div className="ai-model-panes">
              {modelSlots.filter((slot) => slot.enabled).map((slot) => (
                <ModelPane
                  key={slot.id}
                  slot={slot}
                  output={lastRun?.outputs.find((output) => output.slotId === slot.id) || null}
                  scenario={selectedScenario}
                  model={model}
                  jobId={jobId}
                  captures={captures}
                  canClose={activeSlots.length > 1}
                  onOpenModelDrawer={() => setModelDrawerSlot(slot.id)}
                  onOpenTools={() => setToolsPopoverSlot((current) => (current === slot.id ? null : slot.id))}
                  onClose={() => {
                    if (activeSlots.length > 1) updateSlot(slot.id, { enabled: false });
                  }}
                  onPatch={(patch) => updateSlot(slot.id, patch)}
                />
              ))}
            </div>

            <PromptComposer
              selectedScenario={selectedScenario}
              promptText={composerPrompt}
              inputError={inputPayload.error}
              runBusy={runBusy}
              runError={runError}
              savedPromptStatus={savedPromptStatus}
              toolsPopoverSlot={toolsPopoverSlot}
              activeSlot={modelSlots.find((slot) => slot.id === toolsPopoverSlot) || activeSlots[0] || modelSlots[0]}
              instructionChips={instructionChips}
              instructionWarnings={instructionWarnings}
              setPromptText={setComposerPrompt}
              runScenario={runScenario}
              updateSlot={updateSlot}
              setToolsPopoverSlot={setToolsPopoverSlot}
              addPromptAttachments={addPromptAttachments}
            />
          </div>

          {activeSlots.length === 1 ? (
            <RunSettingsSidebar
              slot={activeSlots[0]}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              instructionChips={instructionChips}
              instructionWarnings={instructionWarnings}
              onOpenModelDrawer={() => setModelDrawerSlot(activeSlots[0].id)}
              onPatch={(patch) => updateSlot(activeSlots[0].id, patch)}
            />
          ) : null}
        </div>

        {promptDrawerOpen ? (
          <PromptCockpitDrawer
            open={promptDrawerOpen}
            scenarios={scenarios}
            selectedScenario={selectedScenario}
            systemPrompt={systemPrompt}
            userPromptTemplate={userPromptTemplate}
            inputPayloadText={inputPayloadText}
            inputError={inputPayload.error}
            compiledRunPreview={runPreviewText}
            instructionWarnings={instructionWarnings}
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
          />
        ) : null}
      </section>

      <ModelSelectionPortal
        slot={modelDrawerSlot ? modelSlots.find((item) => item.id === modelDrawerSlot) || modelSlots[0] : null}
        search={modelSearch}
        filter={modelFilter}
        setSearch={setModelSearch}
        setFilter={setModelFilter}
        onClose={() => setModelDrawerSlot(null)}
        onSelect={(modelName) => {
          if (modelDrawerSlot) updateSlot(modelDrawerSlot, { modelName });
          setModelDrawerSlot(null);
        }}
      />

      <SystemInstructionsDrawer 
        isOpen={isInstructionsDrawerOpen}
        onClose={() => setIsInstructionsDrawerOpen(false)}
        currentInstruction={systemPrompt}
        baseInstruction={selectedScenario?.systemPrompt || ""}
        onSelect={(content) => setSystemPrompt(content)}
      />
    </main>
  );
}

function AIStudioLeftNav({
  activeMode,
  setActiveMode,
}: {
  activeMode: BomWorkspaceMode;
  setActiveMode: (mode: BomWorkspaceMode) => void;
}) {
  const items: Array<{ label: string; mode: BomWorkspaceMode; icon: React.ReactNode; indent?: boolean }> = [
    { label: "Playground", mode: "prompt_scenarios", icon: <FileCode2 size={14} /> },
    { label: "History", mode: "export_review", icon: <History size={14} />, indent: true },
    { label: "Build", mode: "supplier_runs", icon: <Wrench size={14} /> },
    { label: "Apps", mode: "browser_tool", icon: <Boxes size={14} />, indent: true },
    { label: "Gallery", mode: "diagram_context", icon: <ImageIcon size={14} />, indent: true },
    { label: "Dashboard", mode: "bom_extraction", icon: <Database size={14} /> },
    { label: "Documentation", mode: "validation", icon: <BookOpen size={14} /> },
  ];

  return (
    <aside className="ai-left-nav">
      <Link href="/" className="ai-brand">
        <span>Roadrunner Studio</span>
        <ChevronRight size={13} />
      </Link>
      <nav className="ai-nav-list">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`${activeMode === item.mode ? "active" : ""} ${item.indent ? "indent" : ""}`}
            onClick={() => setActiveMode(item.mode)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="ai-left-bottom">
        {[
          ["Search", <Search key="search" size={14} />],
          ["What's new", <CircleDot key="news" size={14} />],
          ["Get API key", <ExternalLink key="key" size={14} />],
          ["Settings", <Settings2 key="settings" size={14} />],
        ].map(([label, icon]) => (
          <button key={String(label)} type="button">
            {icon}
            <span>{label}</span>
          </button>
        ))}
        <div className="ai-user-chip">
          <UserCircle size={20} />
          <span>operator</span>
          <b>PRO</b>
        </div>
      </div>
    </aside>
  );
}

function ModelPane({
  slot,
  output,
  scenario,
  model,
  jobId,
  captures,
  canClose,
  onOpenModelDrawer,
  onOpenTools,
  onClose,
  onPatch,
}: {
  slot: ModelSlot;
  output: PromptRun["outputs"][number] | null;
  scenario: PromptScenario | undefined;
  model: string;
  jobId: string;
  captures: BrowserSourceCapture[];
  canClose: boolean;
  onOpenModelDrawer: () => void;
  onOpenTools: () => void;
  onClose: () => void;
  onPatch: (patch: Partial<ModelSlot>) => void;
}) {
  const modelLabel = modelNameFor(slot.modelName);
  const enabledTools = TOOL_LABELS.filter((tool) => Boolean(slot.tools?.[tool.key])).map((tool) => tool.label);

  return (
    <article className="ai-model-pane">
      <header className="ai-pane-header">
        <button type="button" className="ai-model-selector" onClick={onOpenModelDrawer}>
          {modelLabel}
        </button>
        <div className="ai-pane-actions">
          <button type="button" className="ai-icon-button" title="Code view">
            <FileCode2 size={14} />
          </button>
          <button type="button" className="ai-icon-button" title="Tools and settings" onClick={onOpenTools}>
            <SlidersHorizontal size={14} />
          </button>
          <button type="button" className="ai-icon-button" title="Remove model" onClick={onClose} disabled={!canClose}>
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="ai-pane-project-screen">
        {output ? (
          <ModelOutputView output={output} />
        ) : (
          <div className="ai-project-empty">
            <Bot size={34} />
            <h2>{scenario?.name || "Project workspace"}</h2>
            <p>{model || jobId ? `${model || "No model"}${jobId ? ` · ${jobId.slice(0, 8)}` : ""}` : "Use this screen for model runs, browser captures, BOM review, and other projects."}</p>
            <div className="ai-project-status-grid">
              <span>{slot.id === "slot_a" ? "Model A" : "Model B"}</span>
              <span>{enabledTools.length ? enabledTools.join(", ") : "No tools enabled"}</span>
              <span>{captures.length} captures</span>
            </div>
          </div>
        )}
      </div>
      <footer className="ai-pane-footer">
        <label>
          <span>Temp</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={slot.temperature ?? 1}
            onChange={(event) => onPatch({ temperature: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Top P</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={slot.topP ?? 0.8}
            onChange={(event) => onPatch({ topP: Number(event.target.value) })}
          />
        </label>
      </footer>
    </article>
  );
}

function PromptComposer({
  selectedScenario,
  promptText,
  inputError,
  runBusy,
  runError,
  savedPromptStatus,
  toolsPopoverSlot,
  activeSlot,
  instructionChips,
  instructionWarnings,
  setPromptText,
  runScenario,
  updateSlot,
  setToolsPopoverSlot,
  addPromptAttachments,
}: {
  selectedScenario: PromptScenario | undefined;
  promptText: string;
  inputError: string | null;
  runBusy: boolean;
  runError: string | null;
  savedPromptStatus: string | null;
  toolsPopoverSlot: ModelSlot["id"] | null;
  activeSlot: ModelSlot;
  instructionChips: string[];
  instructionWarnings: string[];
  setPromptText: (value: string) => void;
  runScenario: () => void;
  updateSlot: (slotId: ModelSlot["id"], patch: Partial<ModelSlot>) => void;
  setToolsPopoverSlot: (slotId: ModelSlot["id"] | null) => void;
  addPromptAttachments: (files: FileList | null, kind: PromptAttachmentKind) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="ai-composer-wrap">
      {toolsPopoverSlot ? (
        <ToolsPopover
          slot={activeSlot}
          onPatch={(patch) => updateSlot(activeSlot.id, patch)}
          onClose={() => setToolsPopoverSlot(null)}
        />
      ) : null}
      <div className="ai-composer">
        <input
          ref={fileInputRef}
          className="mission-file-input"
          type="file"
          multiple
          onChange={(event) => {
            addPromptAttachments(event.currentTarget.files, "file");
            event.currentTarget.value = "";
          }}
        />
        <textarea
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          placeholder={`Start typing a prompt for ${selectedScenario?.name || "this project"}`}
        />
        <div className="ai-composer-actions">
          <button type="button" className="ai-icon-pill" onClick={() => setToolsPopoverSlot(activeSlot.id)}>
            <Wrench size={14} />
            Tools
          </button>
          <InstructionStackChips chips={instructionChips} warnings={instructionWarnings} />
          <span>{inputError ? `JSON: ${inputError}` : runError || savedPromptStatus || selectedScenario?.type || "Ready"}</span>
          <button type="button" className="ai-icon-button" title="Voice input">
            <Bot size={14} />
          </button>
          <button type="button" className="ai-icon-button" title="Add context" onClick={() => fileInputRef.current?.click()}>
            <Plus size={14} />
          </button>
          <button type="button" className="ai-run-button" onClick={runScenario} disabled={runBusy || Boolean(inputError)}>
            {runBusy ? "Running" : "Run Ctrl Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InstructionStackChips({
  chips,
  warnings = [],
  compact = false,
}: {
  chips: string[];
  warnings?: string[];
  compact?: boolean;
}) {
  if (!chips.length && !warnings.length) {
    return <span className={`instruction-chip muted ${compact ? "compact" : ""}`}>Base only</span>;
  }

  return (
    <div className={`instruction-chip-row ${compact ? "compact" : ""}`}>
      {chips.map((chip, index) => (
        <span key={`${chip}-${index}`} className="instruction-chip" title={`Preset priority ${index + 1}`}>
          {index + 1}. {chip}
        </span>
      ))}
      {warnings.map((warning) => (
        <span key={warning} className="instruction-chip warning" title={warning}>
          Conflict
        </span>
      ))}
    </div>
  );
}

function ToolsPopover({
  slot,
  onPatch,
  onClose,
}: {
  slot: ModelSlot;
  onPatch: (patch: Partial<ModelSlot>) => void;
  onClose: () => void;
}) {
  const tools = slot.tools || DEFAULT_MODEL_TOOLS;
  return (
    <div className="ai-tools-popover">
      <div className="ai-tools-head">
        <strong>Tools</strong>
        <button type="button" className="ai-icon-button" onClick={onClose} title="Close tools">
          <X size={13} />
        </button>
      </div>
      {TOOL_LABELS.map((tool) => (
        <ToolToggle
          key={tool.key}
          label={tool.label}
          editable={tool.editable}
          enabled={Boolean(tools[tool.key])}
          onToggle={() =>
            onPatch({
              tools: {
                ...tools,
                [tool.key]: !tools[tool.key],
              },
            })
          }
        />
      ))}
    </div>
  );
}

function RunSettingsSidebar({
  slot,
  systemPrompt,
  setSystemPrompt,
  instructionChips,
  instructionWarnings,
  onOpenModelDrawer,
  onPatch,
}: {
  slot: ModelSlot;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  instructionChips: string[];
  instructionWarnings: string[];
  onOpenModelDrawer: () => void;
  onPatch: (patch: Partial<ModelSlot>) => void;
}) {
  const tools = slot.tools || DEFAULT_MODEL_TOOLS;
  return (
    <aside className="ai-run-settings">
      <div className="ai-settings-title">
        <strong>Run settings</strong>
        <span>{"<>"} Get code</span>
      </div>
      <button type="button" className="ai-selected-model-card" onClick={onOpenModelDrawer}>
        <strong>{modelNameFor(slot.modelName)}</strong>
        <span>{slot.modelName}</span>
        <small>{modelDescriptionFor(slot.modelName)}</small>
      </button>
      <div className="ai-setting-block">
        <span>System instructions</span>
        <button 
          type="button" 
          className="ai-drawer-trigger-button"
          onClick={() => (window as any).openInstructionsDrawer?.()}
        >
          <Settings2 size={14} />
          MANAGE INSTRUCTIONS
        </button>
        <InstructionStackChips chips={instructionChips} warnings={instructionWarnings} compact />
      </div>
      <AiTuningSlider label="Temperature" value={slot.temperature ?? 1} min={0} max={2} step={0.1} onChange={(value) => onPatch({ temperature: value })} />
      <label className="ai-select-setting">
        <span>Thinking level</span>
        <select
          value={tools.thinkingLevel}
          onChange={(event) =>
            onPatch({
              tools: {
                ...tools,
                thinkingLevel: event.target.value as ModelToolSettings["thinkingLevel"],
              },
            })
          }
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <div className="ai-settings-section">
        <div className="ai-settings-section-head">Tools</div>
        {TOOL_LABELS.map((tool) => (
          <ToolToggle
            key={tool.key}
            label={tool.label}
            editable={tool.editable}
            enabled={Boolean(tools[tool.key])}
            onToggle={() =>
              onPatch({
                tools: {
                  ...tools,
                  [tool.key]: !tools[tool.key],
                },
              })
            }
          />
        ))}
      </div>
      <div className="ai-settings-section">
        <div className="ai-settings-section-head">Advanced settings</div>
        <label className="ai-select-setting">
          <span>Media resolution</span>
          <select
            value={tools.mediaResolution}
            onChange={(event) =>
              onPatch({
                tools: {
                  ...tools,
                  mediaResolution: event.target.value as ModelToolSettings["mediaResolution"],
                },
              })
            }
          >
            <option value="default">Default</option>
            <option value="low">Low</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="ai-inline-input">
          <span>Add stop sequence</span>
          <input
            value={tools.stopSequence || ""}
            onChange={(event) =>
              onPatch({
                tools: {
                  ...tools,
                  stopSequence: event.target.value,
                },
              })
            }
            placeholder="Add stop..."
          />
        </label>
        <label className="ai-inline-input">
          <span>Output length</span>
          <input
            value={String(slot.maxOutputTokens ?? 8192)}
            onChange={(event) => onPatch({ maxOutputTokens: Number(event.target.value) })}
          />
        </label>
        <AiTuningSlider label="Top P" value={slot.topP ?? 0.8} min={0} max={1} step={0.05} onChange={(value) => onPatch({ topP: value })} />
      </div>
    </aside>
  );
}

function MissionRunSettingsRail({
  modelSlots,
  activeSlotId,
  setActiveSlotId,
  systemPrompt,
  setSystemPrompt,
  instructionChips,
  instructionWarnings,
  onOpenModelDrawer,
  onPatch,
  onClose,
}: {
  modelSlots: ModelSlot[];
  activeSlotId: ModelSlot["id"];
  setActiveSlotId: (slotId: ModelSlot["id"]) => void;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  instructionChips: string[];
  instructionWarnings: string[];
  onOpenModelDrawer: (slotId: ModelSlot["id"]) => void;
  onPatch: (slotId: ModelSlot["id"], patch: Partial<ModelSlot>) => void;
  onClose: () => void;
}) {
  const slots = modelSlots.slice(0, 2);
  const activeSlot = slots.find((slot) => slot.id === activeSlotId) || slots[0];

  if (!activeSlot) return null;

  return (
    <aside className="ai-run-settings mission-run-settings">
      <div className="ai-settings-title mission-settings-title">
        <strong>Run settings</strong>
        <button type="button" className="ai-icon-button" title="Close run settings" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="mission-model-tabs">
        {slots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={slot.id === activeSlot.id ? "active" : ""}
            onClick={() => setActiveSlotId(slot.id)}
          >
            <span>{slot.id === "slot_a" ? "Model A" : "Model B"}</span>
            <label onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(event) => onPatch(slot.id, { enabled: event.target.checked })}
              />
              enabled
            </label>
          </button>
        ))}
      </div>
      <RunSettingsSidebar
        slot={activeSlot}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        instructionChips={instructionChips}
        instructionWarnings={instructionWarnings}
        onOpenModelDrawer={() => onOpenModelDrawer(activeSlot.id)}
        onPatch={(patch) => onPatch(activeSlot.id, patch)}
      />
    </aside>
  );
}

function ModelSelectionPortal({
  slot,
  search,
  filter,
  setSearch,
  setFilter,
  onClose,
  onSelect,
}: {
  slot: ModelSlot | null;
  search: string;
  filter: (typeof MODEL_FILTERS)[number];
  setSearch: (value: string) => void;
  setFilter: (value: (typeof MODEL_FILTERS)[number]) => void;
  onClose: () => void;
  onSelect: (modelName: ModelSlot["modelName"]) => void;
}) {
  if (!slot) return null;
  return (
    <ModelSelectionDrawer
      slot={slot}
      search={search}
      filter={filter}
      setSearch={setSearch}
      setFilter={setFilter}
      onClose={onClose}
      onSelect={onSelect}
    />
  );
}

function ModelSelectionDrawer({
  slot,
  search,
  filter,
  setSearch,
  setFilter,
  onClose,
  onSelect,
}: {
  slot: ModelSlot;
  search: string;
  filter: (typeof MODEL_FILTERS)[number];
  setSearch: (value: string) => void;
  setFilter: (value: (typeof MODEL_FILTERS)[number]) => void;
  onClose: () => void;
  onSelect: (modelName: ModelSlot["modelName"]) => void;
}) {
  const query = search.trim().toLowerCase();
  const filteredModels = MODEL_CATALOG.filter((item) => {
    const matchesFilter = filter === "All" || item.category === filter;
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.alias.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  return (
    <aside className="ai-model-drawer">
      <header>
        <strong>Model selection</strong>
        <button type="button" className="ai-icon-button" onClick={onClose} title="Close model selection">
          <X size={14} />
        </button>
      </header>
      <label className="ai-model-search">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for a model or agent" />
      </label>
      <div className="ai-model-filters">
        {MODEL_FILTERS.map((item) => (
          <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="ai-model-list">
        {filteredModels.map((item) => {
          const selected = item.id === slot.modelName;
          return (
            <button
              key={item.id}
              type="button"
              className={`ai-model-row ${selected ? "selected" : ""} ${item.selectable ? "" : "disabled"}`}
              onClick={() => {
                if (item.selectable) onSelect(item.id as ModelSlot["modelName"]);
              }}
            >
              <div className="ai-model-mark">{item.selectable ? "✦" : "◇"}</div>
              <div className="ai-model-meta">
                <div>
                  <strong>{item.name}</strong>
                  {!item.selectable ? <span>Not wired</span> : null}
                </div>
                <code>{item.alias}</code>
                <p>{item.description}</p>
                <small>{item.context} · {item.cost}</small>
                <small>Knowledge cut off: {item.cutoff}</small>
                <small>Release date: {item.releaseDate}</small>
              </div>
              <div className="ai-model-row-icons">
                <span>☆</span>
                <span>□</span>
                <span>↗</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ToolToggle({
  label,
  enabled,
  editable,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  editable?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ai-tool-row">
      <span>{label}</span>
      {editable ? <button type="button" className="ai-edit-link">Edit</button> : null}
      <button type="button" className={`ai-toggle ${enabled ? "on" : ""}`} onClick={onToggle} aria-pressed={enabled}>
        <span />
      </button>
    </div>
  );
}

function AiTuningSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ai-range-setting">
      <span>
        {label}
        <b>{value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ModelOutputView({ output }: { output: PromptRun["outputs"][number] }) {
  return (
    <div className="ai-output-view">
      <div className="ai-output-head">
        <strong>{output.validationStatus}</strong>
        <span>{output.latencyMs}ms</span>
      </div>
      <pre>{output.rawOutput}</pre>
    </div>
  );
}

function modelNameFor(modelName: ModelSlot["modelName"]) {
  if (modelName === "gemini-3-flash-preview") return "Gemini 3 Flash Preview";
  return "Gemini 3.1 Flash Lite Preview";
}

function modelDescriptionFor(modelName: ModelSlot["modelName"]) {
  if (modelName === "gemini-3-flash-preview") {
    return "Gemini 3 Flash Preview: optional operator-selected Roadrunner fallback model.";
  }
  return "Gemini 3.1 Flash Lite Preview: Roadrunner default for prompt runs and BOM support tasks.";
}

function groupedScenarios(scenarios: PromptScenario[]) {
  const seen = new Set<string>();
  const groups = WORKFLOW_SCENARIO_GROUPS.map((group) => {
    const items = group.types
      .map((type) => scenarios.find((scenario) => scenario.type === type))
      .filter((scenario): scenario is PromptScenario => Boolean(scenario));
    items.forEach((scenario) => seen.add(scenario.id));
    return { ...group, items };
  }).filter((group) => group.items.length);
  const custom = scenarios.filter((scenario) => !seen.has(scenario.id));
  return custom.length ? [...groups, { label: "Custom", types: [], items: custom }] : groups;
}

function ScenarioWorkflowSelect(props: {
  scenarios: PromptScenario[];
  selectedScenario: PromptScenario | undefined;
  loadScenario: (scenario: PromptScenario, patch?: Record<string, unknown>) => void;
}) {
  return (
    <select
      className="bom-workflow-select"
      value={props.selectedScenario?.id || ""}
      onChange={(event) => {
        const scenario = props.scenarios.find((item) => item.id === event.target.value);
        if (scenario) props.loadScenario(scenario);
      }}
    >
      {groupedScenarios(props.scenarios).map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function MissionPromptComposer(props: {
  selectedScenario: PromptScenario | undefined;
  promptText: string;
  inputError: string | null;
  runBusy: boolean;
  runError: string | null;
  savedPromptStatus: string | null;
  toolsPopoverSlot: ModelSlot["id"] | null;
  activeSlot: ModelSlot;
  attachments: PromptAttachment[];
  suppliers: SupplierCard[];
  instructionChips: string[];
  instructionWarnings: string[];
  setPromptText: React.Dispatch<React.SetStateAction<string>>;
  runScenario: () => void;
  updateSlot: (slotId: ModelSlot["id"], patch: Partial<ModelSlot>) => void;
  setToolsPopoverSlot: (slotId: ModelSlot["id"] | null) => void;
  addPromptAttachments: (files: FileList | null, kind: PromptAttachmentKind) => void;
  removePromptAttachment: (id: string) => void;
  createOrLoadJob: () => void;
  queueCapture: (kind: BrowserSourceCapture["captureKind"], label: string) => void;
  selectSupplierAction: (supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") => void;
  validateLatestRun: () => void;
  activeSlotsCount: number;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supplierButtons = props.suppliers.filter((supplier) =>
    ["sears-partsdirect", "repairclinic", "ge", "whirlpool", "manual-pdf"].includes(supplier.id),
  );
  const tools = props.activeSlot.tools || DEFAULT_MODEL_TOOLS;
  const activeChips = TOOL_LABELS.filter((tool) =>
    tool.key === "functionCalling" || tool.key === "googleSearchGrounding"
      ? Boolean(tools[tool.key])
      : false,
  );
  const statusText = props.inputError
    ? `JSON: ${props.inputError}`
    : props.runError || props.savedPromptStatus || props.selectedScenario?.type || "Ready";

  return (
    <div className="mission-composer-wrap">
      {props.toolsPopoverSlot ? (
        <ToolsPopover
          slot={props.activeSlot}
          onPatch={(patch) => props.updateSlot(props.activeSlot.id, patch)}
          onClose={() => props.setToolsPopoverSlot(null)}
        />
      ) : null}
      <div className="mission-composer">
        <input
          ref={imageInputRef}
          className="mission-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            props.addPromptAttachments(event.currentTarget.files, "image");
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={documentInputRef}
          className="mission-file-input"
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,.tsv,.doc,.docx,.xls,.xlsx,application/pdf,text/*,application/json"
          multiple
          onChange={(event) => {
            props.addPromptAttachments(event.currentTarget.files, "document");
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          className="mission-file-input"
          type="file"
          multiple
          onChange={(event) => {
            props.addPromptAttachments(event.currentTarget.files, "file");
            event.currentTarget.value = "";
          }}
        />
        <textarea
          value={props.promptText}
          onChange={(event) => props.setPromptText(event.target.value)}
          placeholder="Start typing a prompt"
        />
        {props.attachments.length ? (
          <div className="mission-attachment-tray">
            {props.attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                title={`Remove ${attachment.name}`}
                onClick={() => props.removePromptAttachment(attachment.id)}
              >
                {attachment.kind === "image" ? <ImageIcon size={13} /> : attachment.kind === "document" ? <FileCode2 size={13} /> : <Upload size={13} />}
                <span>{attachment.name}</span>
                <small>{attachment.inline ? formatFileSize(attachment.size) : "metadata"}</small>
                <X size={12} />
              </button>
            ))}
          </div>
        ) : null}
        <div className="mission-composer-actions">
          <button
            type="button"
            className="mission-icon-pill mute"
            title="Disable live media"
            onClick={() => props.queueCapture("manual_note", "Live media disabled")}
          >
            <XCircle size={16} />
          </button>
          <button
            type="button"
            className="mission-icon-pill"
            title="Upload image"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon size={16} />
          </button>
          <button
            type="button"
            className="mission-icon-pill"
            title="Upload document"
            onClick={() => documentInputRef.current?.click()}
          >
            <FileCode2 size={16} />
          </button>
          <button
            type="button"
            className="mission-tool-button"
            onClick={() => props.setToolsPopoverSlot(props.activeSlot.id)}
          >
            <Wrench size={16} />
            Tools
          </button>
          <InstructionStackChips chips={props.instructionChips} warnings={props.instructionWarnings} compact />
          {activeChips.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="mission-tool-chip"
              onClick={() =>
                props.updateSlot(props.activeSlot.id, {
                  tools: {
                    ...tools,
                    [tool.key]: false,
                  },
                })
              }
              title={`Disable ${tool.label}`}
            >
              <span>{tool.key === "functionCalling" ? "fx" : "G"}</span>
              {tool.label}
              <X size={15} />
            </button>
          ))}
          <span className="mission-composer-status">{statusText}</span>
          <div className="mission-live-controls">
            <button
              type="button"
              className="mission-icon-pill"
              title="Start recording"
              onClick={() => props.queueCapture("manual_note", "Live audio note requested")}
            >
              <Mic size={16} />
            </button>
            <button
              type="button"
              className="mission-icon-pill"
              title="Upload camera/image"
              onClick={() => imageInputRef.current?.click()}
            >
              <Video size={16} />
            </button>
            <button
              type="button"
              className="mission-icon-pill"
              title="Start screen sharing"
              onClick={() => props.queueCapture("dom", "Screen share requested")}
            >
              <Monitor size={16} />
            </button>
            <button
              type="button"
              className="mission-icon-pill"
              title="Upload any file"
              onClick={() => fileInputRef.current?.click()}
            >
              <PlusCircle size={16} />
            </button>
            <button type="button" className="mission-run-button" onClick={props.runScenario} disabled={props.runBusy || Boolean(props.inputError)}>
              {props.runBusy ? "Running" : props.activeSlotsCount > 1 ? "Run 2 Ctrl Enter" : "Run Ctrl Enter"}
            </button>
          </div>
        </div>
        <div className="mission-composer-shortcuts">
          <span>Actions</span>
          <button type="button" onClick={props.createOrLoadJob}>DB</button>
          <button type="button" onClick={() => props.queueCapture("manual_note", "OCR review request")}>OCR</button>
          <button type="button" onClick={() => props.queueCapture("dom", "Manual refresh capture")}>RF</button>
          <span>Suppliers</span>
          {supplierButtons.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              onClick={() => {
                props.selectSupplierAction(supplier, "bom");
                if (supplier.id === "manual-pdf") documentInputRef.current?.click();
              }}
            >
              {supplier.label.replace(" PartsDirect", "").replace("RepairClinic", "RC").replace("Manual/PDF", "PDF")}
            </button>
          ))}
          <button type="button" className="ok" onClick={props.validateLatestRun}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function MissionBottomBar(props: {
  suppliers: SupplierCard[];
  createOrLoadJob: () => void;
  queueCapture: (kind: BrowserSourceCapture["captureKind"], label: string) => void;
  selectSupplierAction: (supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") => void;
  validateLatestRun: () => void;
  runScenario: () => void;
  runBusy: boolean;
  activeSlotsCount: number;
}) {
  const supplierButtons = props.suppliers.filter((supplier) =>
    ["sears-partsdirect", "repairclinic", "ge", "whirlpool", "manual-pdf"].includes(supplier.id),
  );

  return (
    <div className="bom-cockpit-bottom">
      <span className="bom-cockpit-bottom-label">Actions</span>
      <button type="button" className="bom-cockpit-action" onClick={props.createOrLoadJob}>
        DB
      </button>
      <button type="button" className="bom-cockpit-action" onClick={() => props.queueCapture("manual_note", "OCR review request")}>
        OCR
      </button>
      <button type="button" className="bom-cockpit-action" onClick={() => props.queueCapture("dom", "Manual refresh capture")}>
        RF
      </button>
      <div className="bom-cockpit-sep" />
      <span className="bom-cockpit-bottom-label">Suppliers</span>
      {supplierButtons.map((supplier) => (
        <button key={supplier.id} type="button" className="bom-cockpit-run" onClick={() => props.selectSupplierAction(supplier, "bom")}>
          {supplier.label.replace(" PartsDirect", "").replace("RepairClinic", "RC").replace("Manual/PDF", "PDF")}
        </button>
      ))}
      <div className="bom-cockpit-sep" />
      <button type="button" className="bom-cockpit-run primary" onClick={props.runScenario} disabled={props.runBusy}>
        {props.runBusy ? "RUNNING" : props.activeSlotsCount > 1 ? "RUN 2" : "RUN"}
      </button>
      <button type="button" className="bom-cockpit-ok" onClick={props.validateLatestRun}>
        OK
      </button>
    </div>
  );
}

function WorkspaceDrawer(props: {
  activeMode: BomWorkspaceMode;
  model: string;
  serial: string;
  job: BomJob | null;
  jobIdInput: string;
  jobBusy: boolean;
  jobError: string | null;
  scenarios: PromptScenario[];
  selectedScenario: PromptScenario | undefined;
  lastRun: PromptRun | null;
  lastValidation: PromptValidationResult | null;
  runHistory: PromptRun[];
  finalRows: Array<Record<string, unknown>>;
  rawRows: Array<Record<string, unknown>>;
  captures: BrowserSourceCapture[];
  suppliers: SupplierCard[];
  setModel: (value: string) => void;
  setSerial: (value: string) => void;
  setJobIdInput: (value: string) => void;
  createOrLoadJob: () => void;
  loadScenario: (scenario: PromptScenario, patch?: Record<string, unknown>) => void;
  selectSupplierAction: (supplier: SupplierCard, task: "diagrams" | "bom" | "pricing") => void;
  validateLatestRun: () => void;
  setActiveMode: (mode: BomWorkspaceMode) => void;
  onClose: () => void;
}) {
  const activeLabel =
    {
      identity: "Job",
      prompt_scenarios: "Evidence",
      supplier_runs: "Suppliers",
      browser_tool: "Console",
      diagram_context: "Diagrams",
      bom_extraction: "Rows",
      pricing: "Pricing",
      validation: "Reconcile",
      export_review: "Approve",
    }[props.activeMode] || "Workspace";

  return (
    <aside className="bom-cockpit-drawer">
      <div className="bom-cockpit-drawer-head">
        <span>{activeLabel}</span>
        <button type="button" title="Close drawer" aria-label="Close drawer" onClick={props.onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="bom-cockpit-drawer-body">
        {props.activeMode === "identity" ? (
          <div className="bom-drawer-section">
            <div className="bom-drawer-stats">
              <DrawerStat label="Rows" value={String(props.job?.uniqueRowCount ?? props.finalRows.length)} />
              <DrawerStat label="Raw" value={String(props.job?.rawRowCount ?? props.rawRows.length)} tone="warn" />
              <DrawerStat label="Solid" value={props.lastValidation?.valid ? "yes" : "no"} tone={props.lastValidation?.valid ? "good" : "bad"} />
              <DrawerStat label="Issues" value={String(props.job?.issues?.length ?? 0)} tone="warn" />
            </div>
            <label className="bom-field">
              <span>Job ID</span>
              <input value={props.jobIdInput} onChange={(event) => props.setJobIdInput(event.target.value)} placeholder="existing job id" />
            </label>
            <label className="bom-field">
              <span>Model</span>
              <input value={props.model} onChange={(event) => props.setModel(event.target.value.toUpperCase())} />
            </label>
            <label className="bom-field">
              <span>Serial</span>
              <input value={props.serial} onChange={(event) => props.setSerial(event.target.value.toUpperCase())} />
            </label>
            <button className="bom-drawer-primary" type="button" onClick={props.createOrLoadJob} disabled={props.jobBusy}>
              {props.jobBusy ? "Loading" : "Load / Create"}
            </button>
            {props.jobError ? <p className="bom-drawer-error">{props.jobError}</p> : null}
          </div>
        ) : null}

        {props.activeMode === "prompt_scenarios" ? (
          <div className="bom-drawer-section">
            <div className="bom-drawer-card">
              <div className="bom-drawer-card-head">
                <span>Scenario</span>
                <b>{props.scenarios.length}</b>
              </div>
              {props.scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={`bom-scenario-row ${scenario.id === props.selectedScenario?.id ? "active" : ""}`}
                  onClick={() => props.loadScenario(scenario)}
                >
                  <span>{scenario.name}</span>
                  <small>{scenario.type.replaceAll("_", " ")}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {props.activeMode === "supplier_runs" || props.activeMode === "diagram_context" ? (
          <div className="bom-drawer-section">
            {props.suppliers.map((supplier) => (
              <div key={supplier.id} className="bom-supplier-row">
                <div>
                  <strong>{supplier.label}</strong>
                  <small>{supplier.domain}</small>
                </div>
                <div className="bom-supplier-actions">
                  <button type="button" onClick={() => props.selectSupplierAction(supplier, "diagrams")}>
                    Diag
                  </button>
                  <button type="button" onClick={() => props.selectSupplierAction(supplier, "bom")}>
                    BOM
                  </button>
                  <button type="button" onClick={() => props.selectSupplierAction(supplier, "pricing")}>
                    $
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {props.activeMode === "bom_extraction" ? (
          <div className="bom-drawer-section">
            <DrawerTable rows={props.finalRows.length ? props.finalRows : props.rawRows} />
          </div>
        ) : null}

        {props.activeMode === "pricing" ? (
          <div className="bom-drawer-section">
            <DrawerStat label="Validated" value={String(props.finalRows.length)} />
            <DrawerStat label="Pricing" value="deferred" tone="warn" />
            <DrawerStat label="Source" value="manual" />
          </div>
        ) : null}

        {props.activeMode === "validation" ? (
          <div className="bom-drawer-section">
            <DrawerStat label="Accepted" value={String(props.lastValidation?.acceptedRows.length ?? 0)} tone="good" />
            <DrawerStat label="Rejected" value={String(props.lastValidation?.rejectedRows.length ?? 0)} tone="bad" />
            <DrawerStat label="Warnings" value={String(props.lastValidation?.warnings.length ?? 0)} tone="warn" />
            <button className="bom-drawer-primary" type="button" onClick={props.validateLatestRun}>
              Run Gate
            </button>
          </div>
        ) : null}

        {props.activeMode === "export_review" ? (
          <div className="bom-drawer-section">
            {(props.runHistory.length ? props.runHistory : props.lastRun ? [props.lastRun] : []).map((run) => (
              <div key={run.id} className="bom-history-row">
                <strong>{run.scenarioName}</strong>
                <small>{run.id.slice(0, 8)} - {run.outputs.length} outputs</small>
              </div>
            ))}
            {!props.runHistory.length && !props.lastRun ? <div className="bom-empty-mini">No saved runs</div> : null}
          </div>
        ) : null}

        {props.activeMode === "browser_tool" ? (
          <div className="bom-drawer-section">
            <DrawerStat label="Captures" value={String(props.captures.length)} />
            <DrawerStat label="Run" value={props.lastRun?.id.slice(0, 8) || "idle"} />
            <div className="bom-console-mini">
              {props.captures.length
                ? props.captures.slice(0, 5).map((capture) => `> capture ${formatCaptureKind(capture.captureKind)}: ${capture.status}`).join("\n")
                : "> ready\n> browser scaffold only"}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DrawerStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className={`bom-drawer-stat ${tone}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function DrawerTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <div className="bom-empty-mini">No rows</div>;
  return (
    <table className="bom-drawer-table">
      <thead>
        <tr>
          <th>Part</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 12).map((row, index) => (
          <tr key={`${firstRowText(row, ["partNumber", "part_number"])}-${index}`}>
            <td>{firstRowText(row, ["partNumber", "part_number", "currentServicePartNumber"]) || "-"}</td>
            <td>{firstRowText(row, ["partTitle", "part_title", "description", "title"]) || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CanvasQuickDock({
  openPrompt,
  openSettings,
  showModels,
}: {
  openPrompt: () => void;
  openSettings: () => void;
  showModels: () => void;
}) {
  return (
    <div className="canvas-quick-dock" aria-label="Canvas quick actions">
      <button
        type="button"
        title="Prompt drawer"
        aria-label="Prompt drawer"
        data-tooltip="Prompt drawer"
        onPointerDownCapture={(event) => {
          event.preventDefault();
          openPrompt();
        }}
      >
        <FileCode2 size={18} />
      </button>
      <button
        type="button"
        title="Model outputs"
        aria-label="Model outputs"
        data-tooltip="Model outputs"
        onPointerDownCapture={(event) => {
          event.preventDefault();
          showModels();
        }}
      >
        <Bot size={18} />
      </button>
      <button
        type="button"
        title="Run settings"
        aria-label="Run settings"
        data-tooltip="Run settings"
        onPointerDownCapture={(event) => {
          event.preventDefault();
          openSettings();
        }}
      >
        <SlidersHorizontal size={18} />
      </button>
    </div>
  );
}

function ScreenSwitchRail({
  activeScreen,
  setActiveScreen,
}: {
  activeScreen: WorkbenchScreen;
  setActiveScreen: (screen: WorkbenchScreen) => void;
}) {
  return (
    <div className="bom-screen-rail" aria-label="Screen switcher">
      {WORKBENCH_SCREENS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.screen}
            type="button"
            className={activeScreen === item.screen ? "on" : ""}
            title={item.label}
            aria-label={item.label}
            data-tooltip={item.label}
            onPointerDownCapture={(event) => {
              event.preventDefault();
              setActiveScreen(item.screen);
            }}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}

function WorkbenchStage(props: {
  screen: WorkbenchScreen;
  browserFrameUrl: string;
  browserUrl: string;
  browserSupplier: SupplierId;
  model: string;
  serial: string;
  job: BomJob | null;
  jobId: string;
  selectedScenario: PromptScenario | undefined;
  lastRun: PromptRun | null;
  lastValidation: PromptValidationResult | null;
  captures: BrowserSourceCapture[];
  modelSlots: ModelSlot[];
  activeMode: BomWorkspaceMode;
  runHistory: PromptRun[];
}) {
  if (props.screen === "browser") {
    return (
      <BrowserCanvas
        browserFrameUrl={props.browserFrameUrl}
        browserUrl={props.browserUrl}
        browserSupplier={props.browserSupplier}
        model={props.model}
        lastRun={props.lastRun}
        captures={props.captures}
        modelSlots={props.modelSlots}
        jobId={props.jobId}
      />
    );
  }

  if (props.screen === "supervisor") {
    return (
      <div className="bom-supervisor-screen">
        <ComputerUseSupervisor jobId={props.jobId} model={props.model} sourceUrl={props.browserFrameUrl || props.browserUrl} />
      </div>
    );
  }

  if (props.screen === "models") {
    return (
      <ModelOutputDesk
        modelSlots={props.modelSlots}
        lastRun={props.lastRun}
        lastValidation={props.lastValidation}
        runHistory={props.runHistory}
      />
    );
  }

  return (
    <div className="bom-project-canvas-screen">
      <CanvasViewport
        label="Project Canvas"
        sourceLabel={props.model || props.job?.model || props.selectedScenario?.name || "Roadrunner"}
        active
      >
        <ProjectCanvasBoard
          model={props.model || props.job?.model || ""}
          serial={props.serial || props.job?.serial || ""}
          job={props.job}
          jobId={props.jobId}
          selectedScenario={props.selectedScenario}
          lastRun={props.lastRun}
          lastValidation={props.lastValidation}
          captures={props.captures}
          activeMode={props.activeMode}
          browserUrl={props.browserFrameUrl || props.browserUrl}
        />
      </CanvasViewport>
    </div>
  );
}

function ProjectCanvasBoard(props: {
  model: string;
  serial: string;
  job: BomJob | null;
  jobId: string;
  selectedScenario: PromptScenario | undefined;
  lastRun: PromptRun | null;
  lastValidation: PromptValidationResult | null;
  captures: BrowserSourceCapture[];
  activeMode: BomWorkspaceMode;
  browserUrl: string;
}) {
  const rows = props.job?.uniqueRowCount ?? props.lastValidation?.acceptedRows.length ?? 0;
  const rawRows = props.job?.rawRowCount ?? 0;
  const nodes: Array<{
    id: string;
    label: string;
    detail: string;
    tone: "green" | "cyan" | "violet" | "amber" | "red";
    icon: typeof Bot;
    x: number;
    y: number;
    w: number;
  }> = [
    { id: "job", label: props.model || "Model intake", detail: props.serial || props.jobId || "Load or create a job", tone: "green", icon: Fingerprint, x: 350, y: 380, w: 260 },
    { id: "sources", label: "Source windows", detail: props.browserUrl || "Supplier URLs staged in drawer", tone: "cyan", icon: Globe2, x: 690, y: 220, w: 270 },
    { id: "prompts", label: "Prompt stack", detail: props.selectedScenario?.name || "Select a scenario", tone: "violet", icon: FileCode2, x: 690, y: 520, w: 270 },
    { id: "models", label: "Model A / Model B", detail: props.lastRun ? `${props.lastRun.outputs.length} output windows` : "Ready for split run", tone: "amber", icon: Bot, x: 1030, y: 360, w: 290 },
    { id: "evidence", label: "Evidence capture", detail: `${props.captures.length} capture${props.captures.length === 1 ? "" : "s"} staged`, tone: "cyan", icon: ImageIcon, x: 1370, y: 220, w: 260 },
    { id: "bom", label: "BOM rows", detail: `${rows} accepted / ${rawRows} raw`, tone: "green", icon: Table2, x: 1370, y: 510, w: 260 },
    { id: "gate", label: "Validation gate", detail: props.lastValidation ? (props.lastValidation.valid ? "valid" : "needs review") : "No gate run", tone: props.lastValidation?.valid ? "green" : "red", icon: ShieldCheck, x: 1650, y: 360, w: 250 },
  ];
  const lines = [["job", "sources"], ["job", "prompts"], ["sources", "models"], ["prompts", "models"], ["models", "evidence"], ["models", "bom"], ["evidence", "gate"], ["bom", "gate"]];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="project-canvas-board">
      <svg className="project-canvas-links" viewBox="0 0 2200 980" aria-hidden="true">
        {lines.map(([from, to]) => {
          const start = nodeMap.get(from);
          const end = nodeMap.get(to);
          if (!start || !end) return null;
          const x1 = start.x + start.w;
          const y1 = start.y + 36;
          const x2 = end.x;
          const y2 = end.y + 36;
          const mid = x1 + Math.max(90, (x2 - x1) / 2);
          return <path key={`${from}-${to}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} />;
        })}
      </svg>
      {nodes.map((node) => {
        const Icon = node.icon;
        return (
          <div key={node.id} className={`project-canvas-node ${node.tone}`} style={{ left: node.x, top: node.y, width: node.w }}>
            <Icon size={17} />
            <div>
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </div>
          </div>
        );
      })}
      <div className="project-canvas-status">
        <span>{props.job?.retrievalState || "workspace"}</span>
        <span>{props.lastRun ? props.lastRun.id.slice(0, 8) : "no run"}</span>
        <span>{props.selectedScenario?.type || "no scenario"}</span>
      </div>
    </div>
  );
}

function ModelOutputDesk({
  modelSlots,
  lastRun,
  lastValidation,
  runHistory,
}: {
  modelSlots: ModelSlot[];
  lastRun: PromptRun | null;
  lastValidation: PromptValidationResult | null;
  runHistory: PromptRun[];
}) {
  const visibleSlots = modelSlots.filter((slot) => slot.enabled).slice(0, 2);
  return (
    <div className="model-output-desk">
      <div className="model-output-grid">
        {visibleSlots.map((slot) => {
          const output = lastRun?.outputs.find((item) => item.slotId === slot.id) || null;
          return (
            <section key={slot.id} className="model-output-window">
              <header>
                <span>{slot.id === "slot_a" ? "Model A" : "Model B"}</span>
                <strong>{slot.modelName}</strong>
                <small>{output?.validationStatus || "idle"}</small>
              </header>
              {output ? <ModelOutputView output={output} /> : (
                <div className="model-output-empty">
                  <Bot size={28} />
                  <span>No output in this window</span>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <aside className="model-output-side">
        <div><span>Gate</span><strong>{lastValidation ? (lastValidation.valid ? "valid" : "review") : "idle"}</strong></div>
        <div><span>Accepted</span><strong>{lastValidation?.acceptedRows.length ?? 0}</strong></div>
        <div><span>History</span><strong>{runHistory.length}</strong></div>
      </aside>
    </div>
  );
}

function BrowserCanvas(props: {
  browserFrameUrl: string;
  browserUrl: string;
  browserSupplier: SupplierId;
  model: string;
  lastRun: PromptRun | null;
  captures: BrowserSourceCapture[];
  modelSlots: ModelSlot[];
  jobId: string;
}) {
  const visibleUrl = props.browserFrameUrl || props.browserUrl || "about:blank";
  const visibleSlots = useMemo(() => {
    const enabledSlots = props.modelSlots.filter((slot) => slot.enabled).slice(0, 2);
    return enabledSlots.length ? enabledSlots : [props.modelSlots[0]].filter(Boolean);
  }, [props.modelSlots]);
  const [activeCanvasId, setActiveCanvasId] = useState(visibleSlots[0]?.id || "slot_a");

  useEffect(() => {
    if (!visibleSlots.some((slot) => slot.id === activeCanvasId)) {
      setActiveCanvasId(visibleSlots[0]?.id || "slot_a");
    }
  }, [activeCanvasId, visibleSlots]);

  return (
    <div className={`bom-browser-wrap ${visibleSlots.length > 1 ? "split" : ""}`}>
      <div className={`bom-browser-grid ${visibleSlots.length > 1 ? "two-up" : "single"}`}>
        {visibleSlots.map((slot) => (
          <BrowserBoardPane
            key={slot.id}
            slot={slot}
            browserFrameUrl={props.browserFrameUrl}
            visibleUrl={visibleUrl}
            browserSupplier={props.browserSupplier}
            model={props.model}
            lastRun={props.lastRun}
            captures={props.captures}
            jobId={props.jobId}
            active={slot.id === activeCanvasId}
            onActivate={() => setActiveCanvasId(slot.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BrowserBoardPane(props: {
  slot: ModelSlot;
  visibleUrl: string;
  browserFrameUrl: string;
  browserSupplier: SupplierId;
  model: string;
  lastRun: PromptRun | null;
  captures: BrowserSourceCapture[];
  jobId: string;
  active: boolean;
  onActivate: () => void;
}) {
  const slotOutput = props.lastRun?.outputs.find((output) => output.slotId === props.slot.id) || null;
  const outputs = slotOutput ? [slotOutput] : props.lastRun?.outputs.slice(0, 5) || [];
  const canvasLabel = props.slot.id === "slot_a" ? "Model A" : "Model B";

  return (
    <div className={`bom-browser-canvas ${props.active ? "is-active" : ""}`}>
      <div className="bom-browser-bar">
        <span className="bom-browser-dot red" />
        <span className="bom-browser-dot yellow" />
        <span className="bom-browser-dot green" />
        <div className="bom-browser-url">{canvasLabel} - {props.visibleUrl}</div>
        <div className="bom-browser-spinner" />
      </div>
      <div className="bom-browser-body">
        <CanvasViewport
          label={canvasLabel}
          sourceLabel={props.visibleUrl}
          active={props.active}
          onActivate={props.onActivate}
        >
          {props.slot.tools?.computerUse ? (
            <ComputerUseSupervisor jobId={props.jobId} slotId={props.slot.id} model={props.model} sourceUrl={props.visibleUrl} />
          ) : props.browserFrameUrl ? (
            <iframe title={`${props.slot.id} BOM browser preview`} src={props.browserFrameUrl} sandbox="allow-same-origin allow-scripts" />
          ) : (
            <div className="bom-canvas-idle">
              <Globe2 size={42} />
              <span>Run a supplier to begin scanning</span>
              <small>{props.model || "No model selected"} - {props.browserSupplier}</small>
            </div>
          )}
        </CanvasViewport>
        <div className="bom-scan-line" />
        <div className={`bom-extraction-feed ${outputs.length || props.captures.length ? "show" : ""}`}>
          <div className="bom-feed-head">
            <span>Extraction Feed</span>
            <b>{outputs.length || props.captures.length}</b>
          </div>
          <div className="bom-feed-body">
            {outputs.map((output) => (
              <div key={output.id} className="bom-feed-row">
                <span>{output.slotId}</span>
                <strong>{output.modelName}</strong>
                <small>{output.validationStatus}</small>
              </div>
            ))}
            {!outputs.length && props.captures.map((capture) => (
              <div key={capture.id} className="bom-feed-row">
                <span>{formatCaptureKind(capture.captureKind)}</span>
                <strong>{capture.label}</strong>
                <small>{capture.status}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptCockpitDrawer(props: {
  open: boolean;
  scenarios: PromptScenario[];
  selectedScenario: PromptScenario | undefined;
  systemPrompt: string;
  userPromptTemplate: string;
  inputPayloadText: string;
  inputError: string | null;
  compiledRunPreview: string;
  instructionWarnings: string[];
  runBusy: boolean;
  runError: string | null;
  lastRun: PromptRun | null;
  savedPromptStatus: string | null;
  setInputPayloadText: (value: string) => void;
  setSystemPrompt: (value: string) => void;
  setUserPromptTemplate: (value: string) => void;
  loadScenario: (scenario: PromptScenario, patch?: Record<string, unknown>) => void;
  runScenario: () => void;
  saveWinningPrompt: () => void;
}) {
  return (
    <div className={`bom-prompt-drawer ${props.open ? "open" : "closed"}`}>
      <div className="bom-prompt-head">
        <span>Prompt Cockpit</span>
        <ScenarioWorkflowSelect scenarios={props.scenarios} selectedScenario={props.selectedScenario} loadScenario={props.loadScenario} />
        <button type="button" onClick={props.runScenario} disabled={props.runBusy}>
          {props.runBusy ? "Running" : "Run two models"}
        </button>
        <button type="button" onClick={props.saveWinningPrompt}>
          Save
        </button>
      </div>
      <div className="bom-prompt-body">
        {props.instructionWarnings.length ? (
          <div className="bom-prompt-warning">
            <AlertTriangle size={14} />
            <span>{props.instructionWarnings.join(" ")}</span>
          </div>
        ) : null}
        <label>
          <span>System</span>
          <textarea value={props.systemPrompt} onChange={(event) => props.setSystemPrompt(event.target.value)} />
        </label>
        <label>
          <span>User Template</span>
          <textarea value={props.userPromptTemplate} onChange={(event) => props.setUserPromptTemplate(event.target.value)} />
        </label>
        <label>
          <span>Input Payload</span>
          <textarea value={props.inputPayloadText} onChange={(event) => props.setInputPayloadText(event.target.value)} />
        </label>
        <label>
          <span>Compiled Preview</span>
          <textarea readOnly value={props.compiledRunPreview} />
        </label>
      </div>
      <div className="bom-prompt-foot">
        <span>{props.inputError ? `JSON: ${props.inputError}` : props.runError || props.savedPromptStatus || "Ready"}</span>
        <b>{props.lastRun ? `${props.lastRun.outputs.length} outputs` : "0 outputs"}</b>
      </div>
    </div>
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

function CockpitRail({
  activeMode,
  setActiveMode,
  setWorkbenchScreen,
  setWorkspaceDrawerOpen,
}: {
  activeMode: BomWorkspaceMode;
  setActiveMode: (mode: BomWorkspaceMode) => void;
  setWorkbenchScreen: (screen: WorkbenchScreen) => void;
  setWorkspaceDrawerOpen: (open: boolean) => void;
}) {
  const primaryItems: Array<{
    mode: BomWorkspaceMode;
    label: string;
    title: string;
    icon: React.ReactNode;
    screen?: WorkbenchScreen;
  }> = [
    { mode: "identity", label: "Job", title: "Job setup", icon: <Fingerprint size={18} />, screen: "canvas" },
    { mode: "prompt_scenarios", label: "Prompts", title: "Prompt scenarios", icon: <FileCode2 size={18} />, screen: "canvas" },
    { mode: "supplier_runs", label: "Suppliers", title: "Supplier runs", icon: <Boxes size={18} />, screen: "browser" },
    { mode: "browser_tool", label: "Browser", title: "Playwright browser", icon: <Globe2 size={18} />, screen: "supervisor" },
    { mode: "diagram_context", label: "Diagrams", title: "Diagram context", icon: <ImageIcon size={18} />, screen: "browser" },
    { mode: "bom_extraction", label: "BOM", title: "BOM rows", icon: <Table2 size={18} />, screen: "canvas" },
    { mode: "pricing", label: "Pricing", title: "Pricing", icon: <DollarSign size={18} />, screen: "canvas" },
    { mode: "validation", label: "Validate", title: "Validation", icon: <ShieldCheck size={18} />, screen: "models" },
    { mode: "export_review", label: "History", title: "Run history", icon: <History size={18} />, screen: "models" },
  ];

  const externalItems = [
    { label: "Dashboard", href: "/bom-jobs", icon: <Table2 size={18} /> },
    { label: "Docs", href: "https://ai.google.dev/gemini-api/docs", icon: <BookOpen size={18} /> },
  ];

  return (
    <aside className="bom-cockpit-rail" aria-label="Workspace navigation">
      <div className="bom-cockpit-rail-group">
        {primaryItems.map((item) => (
          <button
            key={item.mode}
            type="button"
            title={item.title}
            aria-label={item.title}
            data-tooltip={item.title}
            onClick={() => {
              setActiveMode(item.mode);
              if (item.screen) setWorkbenchScreen(item.screen);
              setWorkspaceDrawerOpen(true);
            }}
            className={`bom-cockpit-rail-button ${activeMode === item.mode ? "on" : ""}`}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="bom-cockpit-rail-group external">
        {externalItems.map((item) => (
          <Link key={item.label} href={item.href} className="bom-cockpit-rail-button" title={item.label} aria-label={item.label} data-tooltip={item.label}>
            {item.icon}
          </Link>
        ))}
      </div>

      <div className="bom-cockpit-rail-bottom">
        <button className="bom-cockpit-rail-button" type="button" title="What's new" aria-label="What's new" data-tooltip="What's new">
          <Hammer size={18} />
        </button>
        <button className="bom-cockpit-rail-button" type="button" title="Settings" aria-label="Settings" data-tooltip="Settings">
          <Settings2 size={18} />
        </button>
        <button className="bom-cockpit-rail-button profile" type="button" title="Operator profile" aria-label="Operator profile" data-tooltip="Operator">
          <UserCircle size={19} />
        </button>
      </div>
    </aside>
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
  type PipelineSignal = {
    partNumber: string;
    normalizedModel: string | null;
    name: string;
    brand: string | null;
    brandPriority: string;
    normalizedBrandFamily: string;
    recommendationGroup: string;
    active: number;
    sold: number;
    netExpected: number | null;
    confidence: string | null;
    warnings: string[];
  };

  const [pipelineStats, setPipelineStats] = useState<{
    pendingSurvey: number;
    surveyed: number;
    marketSignals: number;
    breadAndButterSignals: number;
    overlookedSignals: number;
    draftListings: number;
  }>({
    pendingSurvey: 0,
    surveyed: 0,
    marketSignals: 0,
    breadAndButterSignals: 0,
    overlookedSignals: 0,
    draftListings: 0,
  });
  const [pipelineSignals, setPipelineSignals] = useState<PipelineSignal[]>([]);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [pipelineError, setPipelineError] = useState("");

  const loadEbayPipeline = useCallback(async () => {
    setPipelineError("");
    try {
      const response = await fetch("/api/ebay/pipeline?limit=25", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || payload?.error || "Failed to load eBay pipeline.");
      }
      setPipelineStats(
        payload.stats || {
          pendingSurvey: 0,
          surveyed: 0,
          marketSignals: 0,
          breadAndButterSignals: 0,
          overlookedSignals: 0,
          draftListings: 0,
        },
      );
      setPipelineSignals(Array.isArray(payload.signals) ? payload.signals : []);
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : "Failed to load eBay pipeline.");
    }
  }, []);

  useEffect(() => {
    void loadEbayPipeline();
  }, [loadEbayPipeline]);

  const runDraftPrep = useCallback(async () => {
    setPipelineBusy(true);
    setPipelineError("");
    setPipelineMessage("");
    try {
      const response = await fetch("/api/ebay/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_drafts",
          limit: 25,
          minNetExpected: 15,
          dryRun: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || payload?.error || "Failed to preview eBay draft candidates.");
      }
      setPipelineStats(
        payload.stats || {
          pendingSurvey: 0,
          surveyed: 0,
          marketSignals: 0,
          breadAndButterSignals: 0,
          overlookedSignals: 0,
          draftListings: 0,
        },
      );
      setPipelineSignals(Array.isArray(payload.signals) ? payload.signals : []);
      setPipelineMessage(`Previewed ${payload.preparedCount || 0} eBay draft candidates. No listing tables were changed.`);
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : "Failed to preview eBay draft candidates.");
    } finally {
      setPipelineBusy(false);
    }
  }, []);

  const pricedRows = props.finalRows.filter((row) => {
    const priceText = firstRowText(row, ["price", "retailPrice", "part_price", "verified_listed_price"]);
    const price = Number(String(priceText || "").replace(/[$,\s]/g, ""));
    const source = firstRowText(row, ["priceSource", "price_source", "retailPriceSource", "source"]);
    return Number.isFinite(price) && price > 0 && Boolean(source);
  }).length;

  const listingReadyRows = props.finalRows.filter((row) => {
    const partNumber = firstRowText(row, ["partNumber", "part_number", "currentServicePartNumber"]);
    const priceText = firstRowText(row, ["price", "retailPrice", "part_price", "verified_listed_price"]);
    const price = Number(String(priceText || "").replace(/[$,\s]/g, ""));
    return Boolean(partNumber) && Number.isFinite(price) && price > 0;
  }).length;

  const processSteps: Array<{
    step: string;
    owner: string;
    payoff: string;
    painAvoided: string;
  }> = [
    {
      step: "1) Capture source-backed prices for each row",
      owner: "Pricing Source Agent",
      payoff: "Every price is tied to a real source URL before decisions are made.",
      painAvoided: "Stops guessed pricing and rework from bad source data.",
    },
    {
      step: "2) Verify model/part/price alignment",
      owner: "Pricing Verification Agent",
      payoff: "Only valid rows survive to listing prep.",
      painAvoided: "Avoids listing the wrong part or wrong fitment.",
    },
    {
      step: "3) Score market demand from comps",
      owner: "Market Snapshot Agent",
      payoff: "You can prioritize parts with better sell-through potential.",
      painAvoided: "Avoids wasting time on low-yield listings.",
    },
    {
      step: "4) Build draft listing package",
      owner: "Listing Draft Agent",
      payoff: "Title/description/price draft is ready for operator review.",
      painAvoided: "Avoids manual copy-paste and inconsistent listing quality.",
    },
    {
      step: "5) Operator approves and publishes",
      owner: "Operator",
      payoff: "Final control stays with you before anything goes live.",
      painAvoided: "Prevents accidental publication of bad listings.",
    },
  ];

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader
          title="Pricing And Listing Workflow"
          action={
            <button
              type="button"
              onClick={() => {
                props.loadScenarioByType("pricing_reconciliation");
                props.setActiveMode("prompt_scenarios");
              }}
              className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"
            >
              Run Pricing Prompt
            </button>
          }
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {[
            ["Rows in scope", String(props.finalRows.length)],
            ["Rows with verified pricing", String(pricedRows)],
            ["Rows ready for listing prep", String(listingReadyRows)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-2 font-mono text-xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-4">
          {[
            ["Pending Survey", String(pipelineStats.pendingSurvey)],
            ["Market Signals", String(pipelineStats.marketSignals)],
            ["Bread & Butter", String(pipelineStats.breadAndButterSignals)],
            ["Overlooked", String(pipelineStats.overlookedSignals)],
            ["Surveyed", String(pipelineStats.surveyed)],
            ["Draft Listings", String(pipelineStats.draftListings)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-2 font-mono text-xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={() => void loadEbayPipeline()}
            className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/70"
          >
            Refresh eBay Stats
          </button>
          <button
            type="button"
            onClick={() => void runDraftPrep()}
            disabled={pipelineBusy}
            className="h-8 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40"
          >
            {pipelineBusy ? "Previewing Drafts" : "Preview eBay Drafts"}
          </button>
        </div>
        {pipelineMessage ? <div className="px-4 pb-2 text-xs text-emerald-200">{pipelineMessage}</div> : null}
        {pipelineError ? <div className="px-4 pb-4 text-xs text-red-300">{pipelineError}</div> : null}
        {pipelineSignals.length ? (
          <div className="border-t border-white/10 p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/45">
              Market Signal Recommendations
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-xs">
                <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/40">
                  <tr>
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Net</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {pipelineSignals.slice(0, 12).map((signal) => (
                    <tr key={`${signal.partNumber}-${signal.normalizedModel || "model"}`}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-white">{signal.partNumber}</div>
                        <div className="max-w-[220px] truncate text-[11px] text-white/45">{signal.name}</div>
                      </td>
                      <td className="px-3 py-2 text-white/65">
                        {signal.normalizedBrandFamily || signal.brand || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] uppercase tracking-widest text-white/65">
                          {signal.recommendationGroup === "in_current_41" ? "current 41" : signal.brandPriority}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-white/70">{signal.sold}</td>
                      <td className="px-3 py-2 font-mono text-white/70">{signal.active}</td>
                      <td className="px-3 py-2 font-mono text-white/70">
                        {typeof signal.netExpected === "number" ? `$${signal.netExpected.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-white/60">{signal.confidence || "-"}</td>
                      <td className="max-w-[260px] px-3 py-2 text-[11px] text-white/45">
                        {signal.warnings?.length ? signal.warnings.join(" ") : "Exact part-number signal."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Panel>
      <Panel>
        <PanelHeader title="One Process Per Agent" />
        <div className="grid gap-3 p-4">
          {processSteps.map((item) => (
            <div key={item.step} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-bold text-white">{item.step}</div>
              <div className="mt-1 text-[11px] text-white/60">
                Owner: <span className="font-semibold text-white/85">{item.owner}</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-200">
                Payoff: {item.payoff}
              </div>
              <div className="mt-1 text-[11px] text-amber-200">
                Pain avoided: {item.painAvoided}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
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
                <div key={slot.id} className="gemini-model-card rounded-lg bg-[#0f1115] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        {slot.id === "slot_a" ? "Model A" : "Model B"}
                      </div>
                      <div className="font-mono text-[10px] text-white/40">{slot.id}</div>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-white/45">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={(event) => props.updateSlot(slot.id, { enabled: event.target.checked })}
                      />
                      enabled
                    </label>
                  </div>
                  <label className="mb-2 grid gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Model</span>
                    <select
                      value={slot.modelName}
                      onChange={(event) =>
                        props.updateSlot(slot.id, {
                          modelName: event.target.value as ModelSlot["modelName"],
                        })
                      }
                      className="h-9 w-full rounded-md border border-white/10 bg-[#17191d] px-2 text-xs text-white outline-none"
                    >
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview</option>
                      <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    </select>
                  </label>
                  <label className="mb-2 grid gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Provider</span>
                    <select
                      value={slot.provider}
                      onChange={(event) =>
                        props.updateSlot(slot.id, {
                          provider: event.target.value as ModelSlot["provider"],
                        })
                      }
                      className="h-9 w-full rounded-md border border-white/10 bg-[#17191d] px-2 text-xs text-white outline-none"
                    >
                      <option value="gemini">Gemini API</option>
                      <option value="manual">Manual</option>
                      <option value="mock">Mock</option>
                    </select>
                  </label>
                  <div className="grid gap-3">
                    <TuningSlider
                      label="Temperature"
                      value={slot.temperature ?? 1}
                      min={0}
                      max={2}
                      step={0.1}
                      onChange={(value) => props.updateSlot(slot.id, { temperature: value })}
                    />
                    <TuningSlider
                      label="Top P"
                      value={slot.topP ?? 0.8}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) => props.updateSlot(slot.id, { topP: value })}
                    />
                    <label className="grid gap-1">
                      <span className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-white/30">
                        Max output
                        <span className="font-mono text-[10px] text-white/55">{slot.maxOutputTokens ?? 8192}</span>
                      </span>
                      <input
                        value={String(slot.maxOutputTokens ?? 8192)}
                        onChange={(event) =>
                          props.updateSlot(slot.id, {
                            maxOutputTokens: Number(event.target.value),
                          })
                        }
                        className="h-8 rounded-md border border-white/10 bg-[#17191d] px-2 font-mono text-[11px] text-white outline-none"
                      />
                    </label>
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

function TuningSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-white/30">
        {label}
        <span className="font-mono text-[10px] text-white/55">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="gemini-tuning-slider"
      />
    </label>
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
