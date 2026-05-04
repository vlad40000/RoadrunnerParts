"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Globe, 
  CheckSquare, 
  Square, 
  Play, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Zap,
  Settings2,
  ChevronDown,
  ChevronUp,
  Copy,
  FlaskConical,
  Terminal,
  Cpu,
  Pencil,
  Brain,
  Wrench,
  Info,
  X,
  Check,
  ExternalLink,
  Hash,
  Image as ImageIcon,
  FileText,
  Package,
  Activity,
  History,
  Database
} from "lucide-react";
import {
  buildCanonicalEncompassUrls,
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "@/src/features/bom/services/source-tier-policy";

export const SUPPLIER_AGENT_INSTRUCTION_PREVIEW = `System Role: Deterministic supplier-run operator.

Task:
- Use the provided supplier URL and model context to extract source-backed parts source data.

Rules:
1. Use the supplied target URL first. Do not switch providers unless explicitly instructed.
2. Use visual context only as guidance; do not invent rows from prompts.
3. Return source-backed part rows only.
4. Keep expected count source data separate from extracted rows.
5. Do not claim completeness unless source data supports it.
6. Preserve model/part punctuation exactly.
7. Treat missing/blocked source data as partial, not complete.
8. Honor the operator-selected tool policy. Direct fetch and structured output are mandatory; browser/computer-use source data is a separate supervised path.`;

type GeminiModel =
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gemini-3.1-flash-preview"
  | "gemini-3.1-pro-preview";

interface AgentToolConfig {
  directFetch: boolean;
  structuredOutput: boolean;
  googleSearch: boolean;
  urlContext: boolean;
  codeExecution: boolean;
  functionCalling: boolean;
  googleMaps: boolean;
  computerUse: boolean;
}

interface AgentTuning {
  model: GeminiModel;
  temperature: number;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
  systemInstruction: string;
  toolConfig: AgentToolConfig;
}

interface AgentState {
  id: string;
  name: string;
  url: string;
  sendDiagram: boolean;
  sendExpectedCount: boolean;
  status: "idle" | "running" | "success" | "error";
  tuning: AgentTuning;
  showTuning: boolean;
  error?: string;
}

interface SupplierAgentMatrixProps {
  jobId?: string | null;
  model: string;
  truth: any;
  supplierRuns?: Record<string, unknown> | null;
}

const DEFAULT_TOOL_CONFIG: AgentToolConfig = {
  directFetch: true,
  structuredOutput: true,
  googleSearch: false,
  urlContext: true,
  codeExecution: true,
  functionCalling: false,
  googleMaps: false,
  computerUse: false,
};

const DEFAULT_TUNING: AgentTuning = {
  model: "gemini-3-flash-preview",
  temperature: 1.0,
  thinkingLevel: "medium",
  systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW,
  toolConfig: { ...DEFAULT_TOOL_CONFIG },
};

function createDefaultTuning(patch: Partial<AgentTuning> = {}): AgentTuning {
  return {
    ...DEFAULT_TUNING,
    ...patch,
    toolConfig: {
      ...DEFAULT_TOOL_CONFIG,
      ...(patch.toolConfig || {}),
    },
  };
}

const TOOL_ROWS: Array<{
  key: keyof AgentToolConfig;
  label: string;
  detail: string;
  locked?: boolean;
}> = [
  { key: "directFetch", label: "Direct URL", detail: "Route fetches the selected supplier URL first.", locked: true },
  { key: "structuredOutput", label: "Schema", detail: "Extractor must return structured JSON rows.", locked: true },
  { key: "urlContext", label: "URL Context", detail: "Saved for preflight/handoff; supplier extraction uses direct fetched source text." },
  { key: "googleSearch", label: "Search", detail: "Optional grounding/search for recovery, not final truth by itself." },
  { key: "codeExecution", label: "Code", detail: "Runs operator-supplied code/preflight when present." },
  { key: "functionCalling", label: "Functions", detail: "Persisted for staged function agents; supplier route uses fixed functions." },
  { key: "googleMaps", label: "Maps", detail: "Persisted only; not used by appliance supplier extraction." },
  { key: "computerUse", label: "Computer Use", detail: "Persisted handoff flag; supervised in source data workspace." },
];

function agentCodeStorageKey(jobId: string) {
  return `bom-workflow-agent-code:${jobId}`;
}

function readSharedAgentCode(jobId?: string | null) {
  if (!jobId || typeof window === "undefined") return "";
  return window.localStorage.getItem(agentCodeStorageKey(jobId)) || "";
}

function broadcastAgentCode(jobId: string, code: string) {
  window.localStorage.setItem(agentCodeStorageKey(jobId), code);
  window.dispatchEvent(
    new CustomEvent("bom-workflow-agent-code", {
      detail: { jobId, code },
    }),
  );
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute bottom-full left-1/2 z-[100] mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl"
          >
            {label}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const INITIAL_AGENTS: AgentState[] = [
  {
    id: "encompass-family",
    name: "Encompass Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "sears-partsdirect",
    name: "Sears PartsDirect Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "fix.com",
    name: "Fix.com Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "repairclinic-family",
    name: "RepairClinic Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: false,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "appliancepartspros",
    name: "AppliancePartsPros Agent",
    url: "",
    sendDiagram: false,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "partsdr",
    name: "PartsDr Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
  {
    id: "ai-recovery",
    name: "AI Recovery Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: true,
    tuning: createDefaultTuning({ 
      thinkingLevel: "high",
      systemInstruction: SUPPLIER_AGENT_INSTRUCTION_PREVIEW
    }),
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseThinking(value: unknown): AgentTuning["thinkingLevel"] {
  const normalized = String(value || "medium").trim().toLowerCase();
  return normalized === "minimal" || normalized === "low" || normalized === "high" ? normalized : "medium";
}

function parseModel(value: unknown): GeminiModel {
  if (value === "gemini-3-pro-preview" || value === "gemini-3.1-pro-preview") return "gemini-3-pro-preview";
  if (value === "gemini-3-flash-preview" || value === "gemini-3.1-flash-preview") return "gemini-3-flash-preview";
  return "gemini-3-flash-preview";
}

function parseTemperature(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.min(2, parsed)) : 1;
}

function positiveNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeToolConfigForPreview(value: unknown): AgentToolConfig {
  const input = asRecord(value);
  return {
    directFetch: true,
    structuredOutput: true,
    googleSearch: input.googleSearch === true || input.useSearch === true,
    urlContext: input.urlContext !== false,
    codeExecution: input.codeExecution === true || input.usePython === true,
    functionCalling: input.functionCalling === true,
    googleMaps: input.googleMaps === true,
    computerUse: input.computerUse === true,
  };
}

export function SupplierAgentMatrix({ jobId, model, truth, supplierRuns }: SupplierAgentMatrixProps) {
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [activeAgentId, setActiveAgentId] = useState<string>(INITIAL_AGENTS[0].id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingRunText, setPendingRunText] = useState("");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const normalizedModel = normalizeCanonicalModel(model);
  const lastJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (jobId !== lastJobIdRef.current) {
      setAgents(INITIAL_AGENTS);
      lastJobIdRef.current = jobId || null;
    }
  }, [jobId]);

  const buildSupplierUrl = (supplierId: string) => {
    const encoded = encodeURIComponent(normalizedModel);
    switch (supplierId) {
      case "encompass-family": {
        const assemblyUrl = buildKnownEncompassAssemblyUrl(normalizedModel, truth?.brand);
        if (assemblyUrl) return assemblyUrl;
        const canonical = buildCanonicalEncompassUrls({ model: normalizedModel, brand: truth?.brand });
        if (canonical.regularModelUrl) return canonical.regularModelUrl;
        if (canonical.regularModelUrlAlt) return canonical.regularModelUrlAlt;
        return `https://partstore.encompass.com/model/${encoded}`;
      }
      case "fix.com":
        return `https://www.fix.com/search/?SearchTerm=${encoded}`;
      case "repairclinic-family":
        return `https://www.repairclinic.com/Shop-For-Parts?query=${encoded}`;
      case "appliancepartspros":
        return `https://www.appliancepartspros.com/search.aspx?q=${encoded}`;
      case "sears-partsdirect":
        return `https://www.searspartsdirect.com/search?q=${encoded}`;
      case "partsdr":
        return `https://partsdr.com/search?q=${encoded}`;
      case "ai-recovery":
        return `https://www.google.com/search?q=${encoded}+appliance+parts+diagram`;
      default:
        return "";
    }
  };

  const toggleAgentContext = (id: string, field: "sendDiagram" | "sendExpectedCount") => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, [field]: !agent[field] } : agent
    ));
  };

  const toggleTuning = (id: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, showTuning: !agent.showTuning } : agent
    ));
  };

  const updateTuning = (id: string, patch: Partial<AgentTuning>) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id
        ? {
            ...agent,
            tuning: {
              ...agent.tuning,
              ...patch,
              toolConfig: {
                ...agent.tuning.toolConfig,
                ...(patch.toolConfig || {}),
              },
            },
          }
        : agent
    ));
  };

  const updateToolConfig = (id: string, key: keyof AgentToolConfig, value: boolean) => {
    if (key === "directFetch" || key === "structuredOutput") return;
    setAgents(prev => prev.map(agent =>
      agent.id === id
        ? {
            ...agent,
            tuning: {
              ...agent.tuning,
              toolConfig: {
                ...agent.tuning.toolConfig,
                [key]: value,
              },
            },
          }
        : agent
    ));
  };

  const updateAgentUrl = (id: string, url: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, url } : agent
    ));
  };

  useEffect(() => {
    const runs = asRecord(supplierRuns);
    setAgents((prev) =>
      prev.map((agent) => {
        const run = asRecord(runs[agent.id]);
        const input = asRecord(run.input);
        const persistedAgentConfig = asRecord(input.agentConfig || input.modelConfig || run.agentConfig);
        const persistedTuning = asRecord(persistedAgentConfig.tuning || input.tuning || run.tuning);
        const persistedUrl = String(input.searchUrl || input.sourceUrl || persistedAgentConfig.url || "").trim();
        
        const persistedToolConfig = asRecord(
          persistedAgentConfig.toolConfig || input.toolConfig || persistedTuning.toolConfig,
        );

        const nextToolConfig: AgentToolConfig = {
          ...agent.tuning.toolConfig,
          directFetch: true,
          structuredOutput: true,
          googleSearch: persistedToolConfig.googleSearch === true,
          urlContext: persistedToolConfig.urlContext !== false,
          codeExecution: persistedToolConfig.codeExecution === true,
          functionCalling: persistedToolConfig.functionCalling === true,
          googleMaps: persistedToolConfig.googleMaps === true,
          computerUse: persistedToolConfig.computerUse === true,
        };

        const baselineUrl = buildSupplierUrl(agent.id);
        const truthCanonUrl = String(truth?.canonUrl || "").trim();
        const encompassCanonUrl =
          agent.id === "encompass-family" && truthCanonUrl.includes("/Exploded-View-Assembly/")
            ? truthCanonUrl
            : "";

        return {
          ...agent,
          url: persistedUrl || encompassCanonUrl || baselineUrl,
          sendDiagram: input.includeDiagram !== false,
          sendExpectedCount: input.includeExpectedCount !== false,
          tuning: {
            ...agent.tuning,
            model: parseModel(persistedAgentConfig.model || input.model || persistedTuning.model || agent.tuning.model),
            thinkingLevel: parseThinking(
              persistedAgentConfig.thinkingLevel || input.thinkingLevel || persistedTuning.thinkingLevel || agent.tuning.thinkingLevel
            ),
            temperature: parseTemperature(
              persistedAgentConfig.temperature ?? input.temperature ?? persistedTuning.temperature ?? agent.tuning.temperature
            ),
            systemInstruction: String(
              persistedAgentConfig.systemInstruction ||
                input.systemInstruction ||
                persistedTuning.systemInstruction ||
                truth?.operatorInstructions ||
                agent.tuning.systemInstruction ||
                SUPPLIER_AGENT_INSTRUCTION_PREVIEW
            ).trim(),
            toolConfig: nextToolConfig,
          },
        };
      }),
    );
  }, [supplierRuns, truth, normalizedModel]);

  const buildRunPayload = (agent: AgentState) => {
    const sourceUrl = agent.url || buildSupplierUrl(agent.id);
    const supplierId = agent.id;
    const expectedTotal =
      typeof truth?.expectedTotal === "number" && truth.expectedTotal > 0
        ? truth.expectedTotal
        : null;

    return {
      task: "run_supplier_agent",
      jobId,
      sourceUrl,
      model: agent.tuning.model,
      temperature: agent.tuning.temperature,
      thinkingLevel: agent.tuning.thinkingLevel,
      systemInstruction: agent.tuning.systemInstruction,
      toolConfig: agent.tuning.toolConfig,
      agentConfig: {
        model: agent.tuning.model,
        temperature: agent.tuning.temperature,
        thinkingLevel: agent.tuning.thinkingLevel,
        systemInstruction: agent.tuning.systemInstruction,
        toolConfig: agent.tuning.toolConfig,
      },
      includeDiagram: agent.sendDiagram,
      includeExpectedCount: agent.sendExpectedCount,
      canonUrl: truth?.canonUrl || null,
      diagramImageUrl: agent.sendDiagram
        ? truth?.storedImageUrl || (truth?.base64 ? `data:image/png;base64,${truth.base64}` : truth?.screenshotBase64 || null)
        : null,
      expectedTotal: agent.sendExpectedCount ? expectedTotal : null,
      expectedTotalSource: expectedTotal ? "visual_truth" : null,
      assemblyNames: agent.sendDiagram ? truth?.assemblyNames : [],
      operatorInstructions: truth?.operatorInstructions || null,
      operatorInstructionName: truth?.operatorInstructionName || null,
      normalizedModel,
      supplierId,
      canonicalModel: normalizedModel,
      supplier: supplierId,
      searchUrl: sourceUrl,
      tuning: {
        model: agent.tuning.model,
        temperature: agent.tuning.temperature,
        thinkingLevel: agent.tuning.thinkingLevel,
        systemInstruction: agent.tuning.systemInstruction,
        toolConfig: agent.tuning.toolConfig,
      },
      visualTruth: {
        screenshotBase64: agent.sendDiagram ? truth?.storedImageUrl || (truth?.base64 ? `data:image/png;base64,${truth.base64}` : truth?.screenshotBase64 || null) : null,
        storedImageUrl: agent.sendDiagram ? truth?.storedImageUrl || null : null,
        base64: agent.sendDiagram ? truth?.base64 || null : null,
        canonUrl: agent.sendDiagram ? truth?.canonUrl || null : null,
        expectedTotal: agent.sendExpectedCount ? expectedTotal : null,
        assemblyNames: agent.sendDiagram ? truth?.assemblyNames : [],
        operatorInstructions: truth?.operatorInstructions || null,
        operatorInstructionName: truth?.operatorInstructionName || null
      }
    };
  };

  const openRunReview = (agent: AgentState) => {
    const payload = buildRunPayload(agent);
    const sharedCode = readSharedAgentCode(jobId);
    const runText = sharedCode || JSON.stringify(payload, null, 2);
    setPendingAgentId(agent.id);
    setPendingPayload(payload);
    setPendingRunText(runText);
    if (jobId && !sharedCode) broadcastAgentCode(jobId, runText);
    setReviewOpen(true);
  };

  const updatePendingRunText = (value: string) => {
    setPendingRunText(value);
    if (jobId) broadcastAgentCode(jobId, value);
  };

  const buildPayloadFromRunText = () => {
    const text = pendingRunText.trim();
    if (!text) return pendingPayload;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : pendingPayload;
    } catch {
      return {
        ...(pendingPayload || {}),
        agentCode: pendingRunText,
        agentCodeLanguage: "python",
      };
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const onSharedCode = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string; code?: string }>).detail;
      if (detail?.jobId === jobId && typeof detail.code === "string") {
        setPendingRunText(detail.code);
      }
    };
    window.addEventListener("bom-workflow-agent-code", onSharedCode);
    return () => window.removeEventListener("bom-workflow-agent-code", onSharedCode);
  }, [jobId]);

  const copyToClipboard = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(null), 1400);
  };

  const pendingAgentConfig = asRecord(pendingPayload?.agentConfig);
  const pendingTuning = asRecord(pendingPayload?.tuning);
  const pendingSystemInstruction = String(
    pendingAgentConfig.systemInstruction ||
      pendingPayload?.systemInstruction ||
      pendingTuning.systemInstruction ||
      SUPPLIER_AGENT_INSTRUCTION_PREVIEW,
  );

  const adjustedPayloadPreview = (() => {
    const payload = buildPayloadFromRunText();
    if (!payload) return "";

    const input = asRecord(payload);
    const tuning = asRecord(input.tuning);
    const toolConfig = normalizeToolConfigForPreview(input.toolConfig || tuning.toolConfig || tuning.tools || tuning);
    const supplierId = String(input.supplierId || input.supplier || pendingAgentId || "").trim();
    const supplier = String(input.supplier || supplierId).trim();
    const expectedTotal = positiveNumber(input.expectedTotal);
    const modelName = parseModel(input.model || tuning.model);
    const temperature = parseTemperature(input.temperature ?? tuning.temperature);
    const thinkingLevel = parseThinking(input.thinkingLevel || tuning.thinkingLevel);
    const systemInstruction = String(input.systemInstruction || tuning.systemInstruction || "").trim();

    const adjusted = {
      task: String(input.task || "run_supplier_agent"),
      tierKey: String(input.tierKey || "tier0"),
      supplierId,
      supplier,
      sourceUrl: String(input.sourceUrl || input.searchUrl || "").trim(),
      searchUrl: String(input.searchUrl || input.sourceUrl || "").trim(),
      includeDiagram: input.includeDiagram !== false,
      includeExpectedCount: input.includeExpectedCount !== false,
      canonUrlUsed: input.canonUrl || null,
      diagramImageUrlUsed: input.diagramImageUrl || null,
      expectedTotalUsed: expectedTotal,
      expectedTotalSource: expectedTotal ? String(input.expectedTotalSource || "operator") : null,
      assemblyNamesUsed: Array.isArray(input.assemblyNames) ? input.assemblyNames : [],
      operatorInstructions: String(input.operatorInstructions || "").trim(),
      operatorInstructionName: String(input.operatorInstructionName || "").trim(),
      agentCode: String(input.agentCode || "").trim(),
      agentCodeLanguage: String(input.agentCodeLanguage || "").trim(),
      agentConfig: {
        model: modelName,
        temperature,
        thinkingLevel,
        systemInstruction,
        toolConfig,
      },
      modelConfig: {
        model: modelName,
        temperature,
        thinkingLevel,
        systemInstruction,
        toolConfig,
      },
      toolConfig,
      tuning: {
        model: modelName,
        temperature,
        thinkingLevel,
        toolConfig,
      },
      normalizedModel: String(input.normalizedModel || normalizedModel || "").trim(),
      promptVersion: input.promptVersion || "supplier-agent-matrix-v1",
      functionVersion: input.functionVersion || "supplier-run-route-v2",
    };

    return JSON.stringify(adjusted, null, 2);
  })();

  const runAgent = async (agent: AgentState, payloadOverride?: Record<string, unknown>) => {
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "running", error: undefined } : a));
    
    try {
      if (!jobId) throw new Error("Missing persisted jobId.");
      const payload = payloadOverride || buildRunPayload(agent);
      const supplierId = String(payload.supplier || agent.id);

      await fetch(`/api/bom/jobs/${jobId}/supplier-runs/${supplierId}/input`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await fetch(`/api/bom/jobs/${jobId}/supplier-runs/${supplierId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Agent execution failed");
      
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "success" } : a));
    } catch (err) {
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "error", error: err instanceof Error ? err.message : "Unknown error" } : a));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <Activity size={14} className="text-blue-600" /> Orchestrator Matrix
        </h3>
        <Tooltip label="Canonical Model Reference">
          <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase bg-neutral-100 px-3 py-1 rounded-full">
            <Package size={12} /> {model || "UNDEFINED"}
          </div>
        </Tooltip>
      </div>

      {/* Supplier Link Matrix - Immediate visibility of "Useful URLs" */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 flex-none">
        {agents.map(agent => {
          const targetUrl = agent.url || buildSupplierUrl(agent.id);
          return (
            <div key={`link-matrix-${agent.id}`} className="flex flex-col gap-1 min-w-0">
              <div className="text-[8px] font-black uppercase tracking-widest text-neutral-400 truncate">{agent.name}</div>
              {targetUrl ? (
                <a 
                  href={targetUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="truncate font-mono text-[9px] font-bold text-blue-600 hover:underline"
                  title={targetUrl}
                >
                  {new URL(targetUrl).hostname.replace('www.', '')}
                </a>
              ) : (
                <div className="text-[9px] font-bold text-neutral-300">NO URL</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-auto lg:grid-cols-[180px_1fr]">
        <aside className="h-fit rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          <div className="mb-2 flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            <Cpu size={12} /> Nodes
          </div>
          <div className="grid gap-2">
            {agents.map((agent) => (
              <button
                key={`agent-tab-${agent.id}`}
                type="button"
                onClick={() => setActiveAgentId(agent.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide ${
                  activeAgentId === agent.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                }`}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-h-0">
        {agents.filter((agent) => agent.id === activeAgentId).map((agent) => (
          <motion.div
            key={agent.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group relative overflow-visible rounded-lg border transition-all duration-300 ${
              agent.status === "running" ? "border-blue-300 bg-blue-50/20 ring-4 ring-blue-50/50 shadow-xl" :
              agent.status === "success" ? "border-emerald-200 bg-emerald-50/20" :
              agent.status === "error" ? "border-red-200 bg-red-50/20" :
              "border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-2xl"
            }`}
          >
            {/* Status Indicator */}
            <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${
              agent.status === "running" ? "bg-blue-500 animate-ping" :
              agent.status === "success" ? "bg-emerald-500" :
              agent.status === "error" ? "bg-red-500" :
              "bg-neutral-200"
            }`} />

            <details className="p-3" open>
              <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all shadow-sm ${
                    agent.status === "success" ? "bg-emerald-100 text-emerald-600" :
                    agent.status === "error" ? "bg-red-100 text-red-600" :
                    "bg-neutral-100 text-neutral-500 group-hover:bg-neutral-900 group-hover:text-white"
                  }`}>
                    {agent.status === "running" ? <Loader2 size={24} className="animate-spin" /> :
                     agent.id === "ai-recovery" ? <Zap size={24} /> :
                     <Search size={24} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-black leading-tight text-neutral-900">{agent.name}</h4>
                    <div className="mt-1 flex items-center gap-1">
                      <Tooltip label={agent.showTuning ? "Hide Configuration" : "Open Configuration"}>
                        <button
                          type="button"
                          onClick={() => toggleTuning(agent.id)}
                          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
                            agent.showTuning 
                              ? "border-blue-200 bg-blue-50 text-blue-700" 
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                          }`}
                        >
                          <Settings2 size={13} />
                        </button>
                      </Tooltip>
                      <Tooltip label="View Execution Logs">
                        <button className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 hover:text-neutral-600">
                          <History size={13} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
              </summary>

              <div className="mt-3 space-y-3">
              {/* Tuning Panel */}
              <AnimatePresence>
                {agent.showTuning && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Tooltip label="Inference Model Selection">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                            <Cpu size={12} />
                          </div>
                        </Tooltip>
                        <select
                          value={agent.tuning.model}
                          onChange={(e) => updateTuning(agent.id, { model: e.target.value as GeminiModel })}
                          className="w-full rounded border bg-white p-1 text-[10px] font-bold"
                        >
                          <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                          <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Tooltip label={`Inference Depth: ${agent.tuning.thinkingLevel}`}>
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                            <Brain size={12} />
                          </div>
                        </Tooltip>
                        <select
                          value={agent.tuning.thinkingLevel}
                          onChange={(e) => updateTuning(agent.id, { thinkingLevel: e.target.value as AgentTuning["thinkingLevel"] })}
                          className="w-full rounded border bg-white p-1 text-[10px] font-bold"
                        >
                          <option value="minimal">Minimal</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Tooltip label={`Inference Temperature: ${agent.tuning.temperature.toFixed(1)}`}>
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                            <FlaskConical size={12} />
                          </div>
                        </Tooltip>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={agent.tuning.temperature}
                          onChange={(e) => updateTuning(agent.id, { temperature: parseFloat(e.target.value) })}
                          className="w-full accent-blue-600"
                        />
                        <div className="text-[9px] font-bold text-neutral-400">
                          Gemini 3 default is 1.0. Change only for a stage-specific reason.
                        </div>
                      </div>
                      <label className="space-y-2 sm:col-span-2">
                        <Tooltip label="System Prompt Override (Deterministic Contract)">
                          <div className="flex items-center gap-2 text-[9px] font-black uppercase text-neutral-500">
                            <Terminal size={12} /> System Prompt
                          </div>
                        </Tooltip>
                        <textarea
                          value={agent.tuning.systemInstruction}
                          onChange={(e) => updateTuning(agent.id, { systemInstruction: e.target.value })}
                          placeholder="Optional supplier-specific instruction. Leave blank to use the default contract."
                          className="min-h-16 w-full resize-y rounded border bg-white p-2 text-[10px] font-semibold text-neutral-700 outline-none focus:border-blue-300"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase text-neutral-500">
                          <div className="flex items-center gap-2">
                            <Wrench size={12} /> Capabilities
                          </div>
                          <Tooltip label="Settings are persisted per agent run">
                            <Info size={12} className="text-neutral-400" />
                          </Tooltip>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {TOOL_ROWS.map((tool) => {
                            const enabled = agent.tuning.toolConfig[tool.key];
                            return (
                              <Tooltip key={tool.key} label={tool.detail}>
                                <button
                                  type="button"
                                  onClick={() => updateToolConfig(agent.id, tool.key, !enabled)}
                                  disabled={tool.locked}
                                  aria-label={`${tool.label}: ${tool.detail}`}
                                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[9px] font-black uppercase transition-all disabled:cursor-default ${
                                    enabled
                                      ? "border-blue-200 bg-blue-50 text-blue-800"
                                      : "border-neutral-200 bg-white text-neutral-400"
                                  }`}
                                >
                                  <span className="truncate">{tool.label}</span>
                                  {enabled ? <Check size={12} className="text-blue-600" /> : <X size={12} />}
                                </button>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* URL Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={agent.url}
                  readOnly={editingId !== agent.id}
                  onChange={(e) => updateAgentUrl(agent.id, e.target.value)}
                  aria-label={`${agent.name} target URL`}
                  className={`min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs transition-all ${
                    editingId === agent.id 
                      ? "bg-white border-blue-400 ring-4 ring-blue-50 text-neutral-950" 
                      : "bg-neutral-50 border-neutral-100 text-neutral-600"
                  }`}
                />
                <Tooltip label={editingId === agent.id ? "Lock target URL" : "Edit target URL"}>
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === agent.id ? null : agent.id)}
                    aria-label={editingId === agent.id ? "Lock target URL" : "Edit target URL"}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-neutral-500 hover:text-blue-700 ${
                      editingId === agent.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-neutral-200 bg-white"
                    }`}
                  >
                    <Pencil size={14} />
                  </button>
                </Tooltip>
              </div>

              {/* Context Selection */}
              <div className="grid grid-cols-[44px_44px_1fr] gap-2">
                <Tooltip label={agent.sendDiagram ? "Diagram context enabled" : "Diagram context disabled"}>
                  <button
                    type="button"
                    onClick={() => toggleAgentContext(agent.id, "sendDiagram")}
                    aria-label={agent.sendDiagram ? "Diagram context enabled" : "Diagram context disabled"}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-all ${
                      agent.sendDiagram
                        ? "border-blue-200 bg-blue-50 text-blue-900 shadow-sm"
                        : "border-neutral-100 bg-neutral-50 text-neutral-400"
                    }`}
                  >
                    {agent.sendDiagram ? <CheckSquare size={17} /> : <Square size={17} />}
                  </button>
                </Tooltip>

                <Tooltip label={agent.sendExpectedCount ? "Expected count context enabled" : "Expected count context disabled"}>
                  <button
                    type="button"
                    onClick={() => toggleAgentContext(agent.id, "sendExpectedCount")}
                    aria-label={agent.sendExpectedCount ? "Expected count context enabled" : "Expected count context disabled"}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-all ${
                      agent.sendExpectedCount
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm"
                        : "border-neutral-100 bg-neutral-50 text-neutral-400"
                    }`}
                  >
                    {agent.sendExpectedCount ? <Hash size={17} /> : <AlertCircle size={17} />}
                  </button>
                </Tooltip>

                <Tooltip label="Execute Extraction Run">
                  <button
                    type="button"
                    onClick={() => openRunReview(agent)}
                    disabled={agent.status === "running" || !model}
                    className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-4 transition-all shadow-lg ${
                      agent.status === "running" ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" :
                      agent.status === "success" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                      agent.status === "error" ? "bg-red-600 text-white hover:bg-red-700" :
                      "bg-neutral-950 text-white hover:bg-black"
                    }`}
                  >
                    {agent.status === "running" ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                  </button>
                </Tooltip>
              </div>
              </div>
            </details>
          </motion.div>
        ))}
        </div>
      </div>

      <AnimatePresence>
        {reviewOpen && pendingAgentId && pendingPayload ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setReviewOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                <div>
                  <Tooltip label="Agent Preflight Check">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-2">
                      <Cpu size={14} className="text-neutral-400" /> PREFLIGHT
                    </div>
                  </Tooltip>
                  <h4 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                    <Activity size={20} className="text-blue-600" /> Review Extraction Contract
                  </h4>
                </div>
                  <button
                    type="button"
                    onClick={() => setReviewOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  >
                    <X size={16} />
                  </button>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Tooltip label="System/Agent Instructions (Locked to Preflight Preview)">
                      <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" /> INSTRUCTIONS
                      </div>
                    </Tooltip>
                      <Tooltip label="Copy System Prompt">
                        <button
                          type="button"
                          onClick={() => copyToClipboard("contract", SUPPLIER_AGENT_INSTRUCTION_PREVIEW)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                        >
                          {copiedLabel === "contract" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </Tooltip>
                  </div>
                  <textarea
                    value={pendingSystemInstruction}
                    onChange={(event) => {
                      const next = event.target.value;
                      setPendingPayload((prev) => {
                        if (!prev) return prev;
                        const nextAgentConfig = asRecord(prev.agentConfig);
                        const nextTuning = asRecord(prev.tuning);
                        return {
                          ...prev,
                          systemInstruction: next,
                          agentConfig: {
                            ...nextAgentConfig,
                            systemInstruction: next,
                          },
                          tuning: {
                            ...nextTuning,
                            systemInstruction: next,
                          },
                        };
                      });
                    }}
                    className="h-[360px] w-full resize-y rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Tooltip label="Execution Payload (Truth Injection & Metadata)">
                      <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <Database size={14} className="text-blue-500" /> CONTEXT
                      </div>
                    </Tooltip>
                      <Tooltip label="Copy Payload Data">
                        <button
                          type="button"
                          onClick={() => copyToClipboard("payload", pendingRunText)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                        >
                          {copiedLabel === "payload" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </Tooltip>
                  </div>
                  <textarea
                    value={pendingRunText}
                    onChange={(event) => updatePendingRunText(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    spellCheck={false}
                    className="h-[168px] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="mt-3 mb-2 text-[11px] font-black uppercase tracking-widest text-neutral-500">
                    ADJUSTED JSON (SERVER-NORMALIZED)
                  </div>
                  <textarea
                    value={adjustedPayloadPreview}
                    readOnly
                    spellCheck={false}
                    className="h-[168px] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-100 p-3 font-mono text-xs leading-relaxed text-neutral-700 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const agent = agents.find((a) => a.id === pendingAgentId);
                    if (!agent) return;
                    const runPayload = buildPayloadFromRunText();
                    if (!runPayload) return;
                    setReviewOpen(false);
                    await runAgent(agent, runPayload);
                  }}
                  className="flex items-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-black"
                >
                  <Play size={14} fill="currentColor" /> Execute
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
