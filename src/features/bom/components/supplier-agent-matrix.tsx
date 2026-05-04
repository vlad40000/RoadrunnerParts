"use client";

import React, { useEffect, useState } from "react";
import { 
  Globe, 
  CheckSquare, 
  Square, 
  Play, 
  ExternalLink, 
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
  Cpu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "@/src/features/bom/services/source-tier-policy";

const SUPPLIER_AGENT_INSTRUCTION_PREVIEW = `System Role: Deterministic supplier-run operator.

Task:
- Use the provided supplier URL and model context to extract source-backed parts evidence.

Rules:
1. Use the supplied target URL first. Do not switch providers unless explicitly instructed.
2. Use visual context only as guidance; do not invent rows from prompts.
3. Return source-backed part rows only.
4. Keep expected count evidence separate from extracted rows.
5. Do not claim completeness unless evidence supports it.
6. Preserve model/part punctuation exactly.
7. Treat missing/blocked evidence as partial, not complete.`;

interface AgentTuning {
  temperature: number;
  thinkingLevel: "low" | "medium" | "high";
  useSearch: boolean;
  usePython: boolean;
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
}

const DEFAULT_TUNING: AgentTuning = {
  temperature: 1.0,
  thinkingLevel: "medium",
  useSearch: true,
  usePython: true,
};

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

const INITIAL_AGENTS: AgentState[] = [
  {
    id: "encompass-family",
    name: "Encompass Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: "sears-partsdirect",
    name: "Sears PartsDirect Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: "fix.com",
    name: "Fix.com Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: "repairclinic-family",
    name: "RepairClinic Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: false,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: "appliancepartspros",
    name: "AppliancePartsPros Agent",
    url: "",
    sendDiagram: false,
    sendExpectedCount: true,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: "ai-recovery",
    name: "AI Recovery Agent",
    url: "",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
    showTuning: false,
    tuning: { ...DEFAULT_TUNING, temperature: 1.2, thinkingLevel: "high" },
  },
];

export function SupplierAgentMatrix({ jobId, model, truth }: SupplierAgentMatrixProps) {
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingRunText, setPendingRunText] = useState("");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const normalizedModel = normalizeCanonicalModel(model);

  const buildSupplierUrl = (supplierId: string) => {
    const encoded = encodeURIComponent(normalizedModel);
    switch (supplierId) {
      case "encompass-family":
        return buildKnownEncompassAssemblyUrl(normalizedModel) || "";
      case "fix.com":
        return `https://www.fix.com/search/?SearchTerm=${encoded}`;
      case "repairclinic-family":
        return `https://www.repairclinic.com/Shop-For-Parts?SearchText=${encoded}`;
      case "appliancepartspros":
        return `https://www.appliancepartspros.com/search.aspx?model=${encoded}`;
      case "sears-partsdirect":
        return `https://www.searspartsdirect.com/search?q=${encoded}`;
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
      agent.id === id ? { ...agent, tuning: { ...agent.tuning, ...patch } } : agent
    ));
  };

  const updateAgentUrl = (id: string, url: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, url } : agent
    ));
  };

  useEffect(() => {
    setAgents(prev => prev.map(agent => ({
      ...agent,
      url: agent.url || buildSupplierUrl(agent.id),
    })));
  }, [normalizedModel]);

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
      tuning: agent.tuning,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <Globe size={14} className="text-blue-600" /> Supplier Agent Matrix
        </h3>
        <div className="text-[10px] font-black text-neutral-400 uppercase bg-neutral-100 px-3 py-1 rounded-full">
          Model: {model || "NONE"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {agents.map((agent) => (
          <motion.div
            key={agent.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group relative overflow-hidden rounded-lg border transition-all duration-300 ${
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

            <details className="p-4" open={agent.id === "encompass-family"}>
              <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all shadow-sm ${
                    agent.status === "success" ? "bg-emerald-100 text-emerald-600" :
                    agent.status === "error" ? "bg-red-100 text-red-600" :
                    "bg-neutral-100 text-neutral-500 group-hover:bg-neutral-900 group-hover:text-white"
                  }`}>
                    {agent.status === "running" ? <Loader2 size={24} className="animate-spin" /> :
                     agent.id === "ai-recovery" ? <Zap size={24} /> :
                     <Search size={24} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="break-words text-base font-black leading-tight text-neutral-900">{agent.name}</h4>
                    <button 
                      onClick={() => toggleTuning(agent.id)}
                      className="mt-1 flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors"
                    >
                      <Settings2 size={10} />
                      {agent.showTuning ? "Hide Tuning" : "Tune Agent"}
                      {agent.showTuning ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                  </div>
                </div>
                <div className="shrink-0 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Open
                </div>
              </div>
              </summary>

              <div className="mt-4 space-y-4">
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
                        <label className="flex items-center gap-2 text-[9px] font-black uppercase text-neutral-500">
                          <FlaskConical size={10} /> Temp: {agent.tuning.temperature.toFixed(1)}
                        </label>
                        <input 
                          type="range" min="0" max="2" step="0.1" 
                          value={agent.tuning.temperature}
                          onChange={(e) => updateTuning(agent.id, { temperature: parseFloat(e.target.value) })}
                          className="w-full accent-blue-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[9px] font-black uppercase text-neutral-500">
                          <Cpu size={10} /> Thinking: {agent.tuning.thinkingLevel}
                        </label>
                        <select 
                          value={agent.tuning.thinkingLevel}
                          onChange={(e) => updateTuning(agent.id, { thinkingLevel: e.target.value as any })}
                          className="w-full text-[10px] font-bold p-1 rounded border bg-white"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-2 sm:col-span-2">
                         <button 
                          onClick={() => updateTuning(agent.id, { useSearch: !agent.tuning.useSearch })}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                            agent.tuning.useSearch ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-neutral-200 text-neutral-400"
                          }`}
                         >
                           <Globe size={10} /> Search {agent.tuning.useSearch ? "ON" : "OFF"}
                         </button>
                         <button 
                          onClick={() => updateTuning(agent.id, { usePython: !agent.tuning.usePython })}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                            agent.tuning.usePython ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-neutral-200 text-neutral-400"
                          }`}
                         >
                           <Terminal size={10} /> Python {agent.tuning.usePython ? "ON" : "OFF"}
                         </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* URL Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                    Target Identity
                  </label>
                  <button 
                    onClick={() => setEditingId(editingId === agent.id ? null : agent.id)}
                    className="text-[10px] font-black text-blue-600 hover:underline uppercase"
                  >
                    {editingId === agent.id ? "[Lock]" : "[Override]"}
                  </button>
                </div>
                <input
                  type="text"
                  value={agent.url}
                  readOnly={editingId !== agent.id}
                  onChange={(e) => updateAgentUrl(agent.id, e.target.value)}
                  className={`w-full truncate rounded-lg border px-3 py-2 font-mono text-xs transition-all ${
                    editingId === agent.id 
                      ? "bg-white border-blue-400 ring-4 ring-blue-50 text-neutral-950" 
                      : "bg-neutral-50 border-neutral-100 text-neutral-600"
                  }`}
                />
              </div>

              {/* Context Selection */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => toggleAgentContext(agent.id, "sendDiagram")}
                  className={`flex min-h-24 flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
                    agent.sendDiagram 
                      ? "border-blue-200 bg-blue-50/50 text-blue-900 shadow-sm" 
                      : "border-neutral-100 bg-neutral-50/30 text-neutral-400"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-black uppercase tracking-widest">Diagram</span>
                    {agent.sendDiagram ? <CheckSquare size={16} /> : <Square size={16} />}
                  </div>
                  <span className="text-[9px] font-bold opacity-60">Send Visual Truth</span>
                </button>

                <button
                  onClick={() => toggleAgentContext(agent.id, "sendExpectedCount")}
                  className={`flex min-h-24 flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
                    agent.sendExpectedCount 
                      ? "border-emerald-200 bg-emerald-50/50 text-emerald-900 shadow-sm" 
                      : "border-neutral-100 bg-neutral-50/30 text-neutral-400"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-black uppercase tracking-widest">Evidence</span>
                    {agent.sendExpectedCount ? <CheckSquare size={16} /> : <Square size={16} />}
                  </div>
                  <span className="text-[9px] font-bold opacity-60">
                    Goal: {typeof truth?.expectedTotal === "number" ? truth.expectedTotal : "???"}
                  </span>
                </button>
              </div>

              {/* Action Button */}
              <button
                onClick={() => openRunReview(agent)}
                disabled={agent.status === "running" || !model}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition-all shadow-lg ${
                  agent.status === "running" ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" :
                  agent.status === "success" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                  agent.status === "error" ? "bg-red-600 text-white hover:bg-red-700" :
                  "bg-neutral-950 text-white hover:bg-black hover:-translate-y-1 active:translate-y-0"
                }`}
              >
                {agent.status === "running" ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                Execute Mission
              </button>
              </div>
            </details>
          </motion.div>
        ))}
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
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                    Agent Preflight Review
                  </div>
                  <h4 className="text-lg font-black text-neutral-900">
                    Review instructions before run
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-600 hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                      Instruction Contract
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("contract", SUPPLIER_AGENT_INSTRUCTION_PREVIEW)}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-600 hover:bg-neutral-50"
                    >
                      <Copy size={12} />
                      {copiedLabel === "contract" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={SUPPLIER_AGENT_INSTRUCTION_PREVIEW}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-[360px] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                      Run Payload
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("payload", pendingRunText)}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-600 hover:bg-neutral-50"
                    >
                      <Copy size={12} />
                      {copiedLabel === "payload" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    value={pendingRunText}
                    onChange={(event) => updatePendingRunText(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    spellCheck={false}
                    className="h-[360px] w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                  className="rounded-md border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Confirm Run
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
