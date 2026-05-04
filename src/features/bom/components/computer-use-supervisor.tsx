"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Monitor, 
  MousePointer2, 
  Keyboard, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  Play,
  Terminal
} from "lucide-react";

interface ComputerUseAction {
  name: string;
  args: any;
  timestamp: string;
  status: 'pending' | 'executing' | 'complete' | 'failed';
}

type ReconTelemetry = {
  id?: string;
  event: string;
  status: string;
  payload?: Record<string, any>;
  createdAt?: string;
  created_at?: string;
};

interface ComputerUseSupervisorProps {
  jobId: string;
  model?: string;
  sourceUrl?: string;
  onActionConfirmed?: (actionId: string, confirmed: boolean) => void;
}

type AgentConfig = {
  model: "gemini-3-flash-preview" | "gemini-3-pro-preview";
  systemInstruction: string;
  temperature: number;
  thinkingLevel: "LOW" | "MEDIUM" | "HIGH";
  structuredOutputs: boolean;
  codeExecution: boolean;
  functionCalling: boolean;
  googleSearch: boolean;
  googleMaps: boolean;
  urlContext: boolean;
  computerUse: boolean;
  mediaResolution: "Default" | "Low" | "High";
  outputLength: number;
  topP: number;
};

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: "gemini-3-flash-preview",
  systemInstruction: "",
  temperature: 1,
  thinkingLevel: "MEDIUM",
  structuredOutputs: false,
  codeExecution: false,
  functionCalling: false,
  googleSearch: true,
  googleMaps: false,
  urlContext: true,
  computerUse: false,
  mediaResolution: "Default",
  outputLength: 65536,
  topP: 0.95,
};

function toolLine(enabled: boolean, value: string) {
  return enabled ? `        ${value},\n` : "";
}

function buildPythonPreview(config: AgentConfig, contents: string) {
  const tools =
    toolLine(config.urlContext, "types.Tool(url_context=types.UrlContext())") +
    toolLine(config.googleSearch, "types.Tool(google_search=types.GoogleSearch())") +
    toolLine(config.googleMaps, "types.Tool(google_maps=types.GoogleMaps())") +
    toolLine(config.codeExecution, "types.Tool(code_execution=types.ToolCodeExecution())") +
    toolLine(config.functionCalling, "# function declarations supplied by selected workflow") +
    toolLine(config.computerUse, "# computer use tool enabled by selected workflow");

  return `from google import genai
from google.genai import types
import os

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

tools = [
${tools || "        # no built-in tools selected\n"}]

config = types.GenerateContentConfig(
    temperature=${config.temperature},
    top_p=${config.topP},
    max_output_tokens=${config.outputLength},
    thinking_config=types.ThinkingConfig(
        thinking_level="${config.thinkingLevel}",
    ),
    tools=tools,
)

config = types.GenerateContentConfig(
    temperature=${config.temperature},
    top_p=${config.topP},
    max_output_tokens=${config.outputLength},
    thinking_config=types.ThinkingConfig(
        thinking_level="${config.thinkingLevel}",
    ),
    tools=tools,
)

response = client.models.generate_content_stream(
    model="${config.model}",
    contents=${JSON.stringify(contents)},
    config=config,
)
`;
}

function buildDefaultContents(input: { model?: string; sourceUrl?: string }) {
  const lines = [
    "Validate this supplier evidence URL for the current BOM workflow.",
    input.model ? `Model: ${input.model}` : "",
    input.sourceUrl ? `URL: ${input.sourceUrl}` : "",
    "Use URL Context and Search only for preflight/recon evidence. Do not create final BOM truth or speculative cache rows.",
  ].filter(Boolean);

  return lines.join("\n");
}

function hydrateStoredCode(code: string, contents: string) {
  const contentsLiteral = JSON.stringify(contents);
  return code
    .replace('contents="INSERT_INPUT_HERE"', `contents=${contentsLiteral}`)
    .replace("contents='INSERT_INPUT_HERE'", `contents=${contentsLiteral}`)
    .replace("INSERT_INPUT_HERE", contents.replace(/\n/g, " "));
}

function extractContentsFromCode(code: string, fallback: string) {
  const match = code.match(/contents\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
  if (!match?.[1]) return fallback;
  try {
    return JSON.parse(match[1].replace(/^'/, '"').replace(/'$/, '"'));
  } catch {
    return fallback;
  }
}

function agentCodeStorageKey(jobId: string) {
  return `bom-workflow-agent-code:${jobId}`;
}

function normalizeApprovalStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hasActiveManualGate(job: Record<string, unknown> | null) {
  if (!job) return false;
  const status = normalizeApprovalStatus(job.approvalStatus);
  if (status === "approved" || status === "rejected") return false;
  if (status === "pending" || status === "pending_operator") return true;
  return Boolean(job.requiresApproval);
}

function broadcastAgentCode(jobId: string, code: string) {
  window.localStorage.setItem(agentCodeStorageKey(jobId), code);
  window.dispatchEvent(
    new CustomEvent("bom-workflow-agent-code", {
      detail: { jobId, code },
    }),
  );
}

function ToggleRow({
  label,
  enabled,
  onClick,
  disabled = false,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-neutral-200 transition hover:bg-white/5 disabled:opacity-40"
    >
      <span>{label}</span>
      <span className={`h-5 w-9 rounded-full border p-0.5 ${enabled ? "border-blue-400 bg-blue-500" : "border-neutral-600 bg-neutral-700"}`}>
        <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${enabled ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

export function ComputerUseSupervisor({ jobId, model, sourceUrl, onActionConfirmed }: ComputerUseSupervisorProps) {
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [actions, setActions] = useState<ComputerUseAction[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<ReconTelemetry | null>(null);
  const [telemetry, setTelemetry] = useState<ReconTelemetry[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [panelMode, setPanelMode] = useState<"configure" | "evidence">("configure");
  const [agentCode, setAgentCode] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchPid, setLaunchPid] = useState<number | null>(null);
  const isPollingRef = useRef(false);
  const unmountedRef = useRef(false);
  const pollTickRef = useRef(0);
  const [display, setDisplay] = useState({
    modelSelector: true,
    codePreview: false,
    sidePanel: true,
  });

  const manualGateActive = hasActiveManualGate(job);
  const approvalStatus = normalizeApprovalStatus(job?.approvalStatus);

  async function patchJob(patch: Record<string, unknown>) {
    if (!jobId) return null;
    const res = await fetch(`/api/bom/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Job patch failed");
    }
    if (data.job && !unmountedRef.current) {
      setJob(data.job);
    }
    return data?.job ?? null;
  }

  function patchConfig(patch: Partial<AgentConfig>) {
    const next = { ...config, ...patch };
    const defaultContents = buildDefaultContents({ model, sourceUrl });
    const contents = extractContentsFromCode(agentCode, defaultContents);
    const nextCode = buildPythonPreview(next, contents);
    setConfig(next);
    setAgentCode(nextCode);
    broadcastAgentCode(jobId, nextCode);
  }

  function updateAgentCode(code: string) {
    setAgentCode(code);
    broadcastAgentCode(jobId, code);
  }

  function toggleDisplay(key: keyof typeof display) {
    setDisplay((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleFeedOnly() {
    const feedOnly = display.modelSelector || display.codePreview || display.sidePanel;
    setDisplay({
      modelSelector: !feedOnly,
      codePreview: !feedOnly,
      sidePanel: !feedOnly,
    });
  }

  async function launchAgent() {
    if (!jobId || isLaunching) return;

    const defaultContents = buildDefaultContents({ model, sourceUrl });
    const goal = extractContentsFromCode(agentCode, defaultContents);
    setIsLaunching(true);
    setLaunchError(null);

    try {
      const payload = JSON.stringify({
        model,
        sourceUrl,
        goal,
        config,
      });

      let data: any = null;
      let launchErrorMessage: string | null = null;

      for (const endpoint of [
        `/api/bom/jobs/${jobId}/computer-use/launch`,
        `/api/bom/jobs/${jobId}/agent-launch`,
      ]) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          launchErrorMessage = null;
          break;
        }
        launchErrorMessage = data?.error || "Computer-use launch failed.";
        if (res.status !== 404) break;
      }

      if (launchErrorMessage) {
        throw new Error(launchErrorMessage);
      }

      setLaunchPid(typeof data?.pid === "number" ? data.pid : null);
      setIsAgentRunning(data?.status !== "complete");
      setPanelMode("evidence");
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Computer-use launch failed.");
    } finally {
      setIsLaunching(false);
    }
  }

  async function confirmAction(actionId: string | undefined, confirmed: boolean) {
    if (!actionId) return;

    try {
      const res = await fetch(`/api/bom/jobs/${jobId}/telemetry/${actionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Confirmation failed");
      }

      onActionConfirmed?.(actionId, confirmed);
      setPendingConfirmation(null);
    } catch (err) {
      console.error("Confirmation telemetry failed", err);
    }
  }

  async function handleJobApproval(approved: boolean) {
    if (!jobId || isApproving) return;
    setIsApproving(true);
    try {
      await patchJob({
        requiresApproval: false,
        approvalStatus: approved ? "approved" : "rejected",
      });
    } catch (err) {
      console.error("Job approval failed", err);
    } finally {
      setIsApproving(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    unmountedRef.current = false;
    isPollingRef.current = false;

    const defaultContents = buildDefaultContents({ model, sourceUrl });
    const defaultCode = buildPythonPreview(config, defaultContents);
    const existing = window.localStorage.getItem(agentCodeStorageKey(jobId));
    const initialCode = !existing || existing.includes("INSERT_INPUT_HERE")
      ? hydrateStoredCode(existing || defaultCode, defaultContents)
      : existing;
    setAgentCode(initialCode);
    if (!existing || initialCode !== existing) broadcastAgentCode(jobId, initialCode);

    const onSharedCode = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string; code?: string }>).detail;
      if (detail?.jobId === jobId && typeof detail.code === "string") {
        setAgentCode(detail.code);
      }
    };
    window.addEventListener("bom-workflow-agent-code", onSharedCode);

    async function refreshSupervisorState() {
      if (!jobId || isPollingRef.current || unmountedRef.current) return;
      isPollingRef.current = true;
      try {
        pollTickRef.current += 1;
        const shouldFetchJob = pollTickRef.current % 2 === 1;
        const [telemetryRes, jobRes] = await Promise.all([
          fetch(`/api/bom/jobs/${jobId}/telemetry?limit=15`, { cache: "no-store" }),
          shouldFetchJob ? fetch(`/api/bom/jobs/${jobId}`, { cache: "no-store" }) : Promise.resolve(null),
        ]);
        const telemetryData = await telemetryRes.json().catch(() => null);
        const jobData = jobRes ? await jobRes.json().catch(() => null) : null;
        if (unmountedRef.current) return;

        if (jobData?.ok) {
          setJob(jobData.job);
        }

        const events: ReconTelemetry[] = Array.isArray(telemetryData?.telemetry) ? telemetryData.telemetry : [];
        setTelemetry(events);
        setIsAgentRunning(events.some((event) => event.status === "running" || event.status === "executing"));

        const screenEvent = events.find((e) => e.event === "url_context_frame" || e.event === "grounding_recon_frame" || e.event === "cu_screenshot");
        if (screenEvent && screenEvent.payload?.screenshot) {
          setActiveScreen(screenEvent.payload.screenshot);
          setCurrentUrl(String(screenEvent.payload.url || ""));
        }

        const safetyEvent = events.find((e) => e.status === "require_confirmation");
        setPendingConfirmation(safetyEvent || null);

        const actionEvents = events
          .filter((e) => e.event === "url_context_action" || e.event === "grounding_recon_action" || e.event === "cu_action")
          .map((e) => ({
            name: e.payload?.name || e.event,
            args: e.payload?.args || e.payload || {},
            timestamp: e.createdAt || e.created_at || new Date().toISOString(),
            status: e.status as ComputerUseAction["status"],
          }));
        setActions(actionEvents);
      } catch (err) {
        console.error("Telemetry poll failed", err);
      } finally {
        isPollingRef.current = false;
      }
    }

    void refreshSupervisorState();
    const interval = window.setInterval(() => {
      void refreshSupervisorState();
    }, 2500);

    return () => {
      unmountedRef.current = true;
      window.removeEventListener("bom-workflow-agent-code", onSharedCode);
      clearInterval(interval);
    };
  }, [jobId, model, sourceUrl]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-900 shadow-2xl">
      {/* Header / Top Bar */}
      <div className="flex items-start justify-between gap-3 border-b border-white/5 bg-neutral-800 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isAgentRunning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Monitor size={16} className="text-blue-400" />
              Recon Evidence Supervisor
            </h2>
            <div className="text-[10px] font-bold text-neutral-400 font-mono truncate max-w-[300px]">
              {currentUrl || "Waiting for delivered job evidence..."}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingConfirmation && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/50 px-3 py-1 rounded-full text-[10px] font-black uppercase text-amber-500">
              <ShieldAlert size={12} />
              Operator Confirmation Required
            </div>
          )}
          {!pendingConfirmation && manualGateActive ? (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-400">
              <CheckCircle2 size={12} />
              Manual Gate Pending
            </div>
          ) : null}
          <div className="max-w-[220px] truncate rounded bg-white/5 px-2 py-1 text-[10px] font-bold text-neutral-500">
            JOB: {jobId}
          </div>
          <button
            type="button"
            onClick={launchAgent}
            disabled={isLaunching}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            {isLaunching ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Launch
          </button>
          <button
            type="button"
            onClick={toggleFeedOnly}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10"
          >
            Feed Only
          </button>
          <button
            type="button"
            onClick={() => toggleDisplay("modelSelector")}
            className={`rounded-md border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest ${display.modelSelector ? "bg-white text-neutral-900" : "text-neutral-400 hover:bg-white/10"}`}
          >
            Tools
          </button>
          <button
            type="button"
            onClick={() => toggleDisplay("codePreview")}
            className={`rounded-md border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest ${display.codePreview ? "bg-white text-neutral-900" : "text-neutral-400 hover:bg-white/10"}`}
          >
            Advanced
          </button>
          <button
            type="button"
            onClick={() => toggleDisplay("sidePanel")}
            className={`rounded-md border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest ${display.sidePanel ? "bg-white text-neutral-900" : "text-neutral-400 hover:bg-white/10"}`}
          >
            Trace
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-[600px] overflow-hidden">
        <div className="relative flex-1 overflow-y-auto bg-black p-4">
          <div className="grid gap-4">
            {display.modelSelector ? (
            <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
              <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Launch Controls
              </div>
              <button
                type="button"
                onClick={launchAgent}
                disabled={isLaunching}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500 px-3 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Launch Local Agent
              </button>
              {launchPid ? (
                <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-[10px] font-bold text-emerald-300">
                  Launched local process PID {launchPid}. Telemetry will appear in the evidence feed.
                </div>
              ) : null}
              {launchError ? (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[10px] font-bold text-red-300">
                  {launchError}
                </div>
              ) : null}
              <select
                value={config.model}
                onChange={(event) => patchConfig({ model: event.target.value as AgentConfig["model"] })}
                className="mb-3 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm font-bold text-white outline-none"
              >
                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
              </select>
              <textarea
                value={config.systemInstruction}
                onChange={(event) => patchConfig({ systemInstruction: event.target.value })}
                placeholder="System instructions for this agent mode"
                className="mb-4 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none"
              />

              <div className="space-y-3 border-t border-white/10 pt-4">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Temperature</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={config.temperature}
                    onChange={(event) => patchConfig({ temperature: Number(event.target.value) })}
                    className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Thinking Level</span>
                  <select
                    value={config.thinkingLevel}
                    onChange={(event) => patchConfig({ thinkingLevel: event.target.value as AgentConfig["thinkingLevel"] })}
                    className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 space-y-1 border-t border-white/10 pt-4">
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Tools</div>
                <ToggleRow label="Structured Outputs" enabled={config.structuredOutputs} onClick={() => patchConfig({ structuredOutputs: !config.structuredOutputs })} />
                <ToggleRow label="Code Execution" enabled={config.codeExecution} onClick={() => patchConfig({ codeExecution: !config.codeExecution })} />
                <ToggleRow label="Function Calling" enabled={config.functionCalling} onClick={() => patchConfig({ functionCalling: !config.functionCalling })} />
                <ToggleRow label="Grounding with Google Search" enabled={config.googleSearch} onClick={() => patchConfig({ googleSearch: !config.googleSearch })} />
                <ToggleRow label="Grounding with Google Maps" enabled={config.googleMaps} onClick={() => patchConfig({ googleMaps: !config.googleMaps })} />
                <ToggleRow label="URL Context" enabled={config.urlContext} onClick={() => patchConfig({ urlContext: !config.urlContext })} />
                <ToggleRow label="Computer Use" enabled={true} onClick={() => undefined} disabled />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Media</span>
                  <select
                    value={config.mediaResolution}
                    onChange={(event) => patchConfig({ mediaResolution: event.target.value as AgentConfig["mediaResolution"] })}
                    className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                  >
                    <option>Default</option>
                    <option>Low</option>
                    <option>High</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Top P</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.topP}
                    onChange={(event) => patchConfig({ topP: Number(event.target.value) })}
                    className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                  />
                </label>
                <label className="col-span-2">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Output Length</span>
                  <input
                    type="number"
                    min={1024}
                    value={config.outputLength}
                    onChange={(event) => patchConfig({ outputLength: Number(event.target.value) })}
                    className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                  />
                </label>
              </div>
            </div>
            ) : null}

            <div className="space-y-4">
              <div className="relative w-full aspect-[1440/900] overflow-hidden rounded-lg border border-white/10 bg-neutral-950 shadow-inner">
                {activeScreen ? (
                  <img 
                    src={activeScreen.startsWith('data:') ? activeScreen : `data:image/png;base64,${activeScreen}`} 
                    alt="Agent View" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-neutral-600">
                    <Loader2 size={40} className="animate-spin opacity-20" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] opacity-40 text-center">
                      Awaiting Stream...<br />
                      <span className="text-[10px] normal-case tracking-normal">Evidence, screenshots, redirects, or recon actions will appear here</span>
                    </p>
                  </div>
                )}

                {actions[0]?.name === 'click_at' && (
                  <div 
                    className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-blue-500 bg-blue-500/20 animate-ping"
                    style={{ 
                      left: `${(actions[0].args.x / 1000) * 100}%`, 
                      top: `${(actions[0].args.y / 1000) * 100}%` 
                    }}
                  />
                )}
              </div>

              {display.codePreview ? (
              <div className="rounded-xl border border-white/10 bg-neutral-900">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    <Terminal size={12} />
                    Advanced Launch Goal / Code Preview
                  </div>
                  <div className="text-[10px] font-bold text-neutral-500">Editable</div>
                </div>
                <pre className="max-h-72 overflow-auto p-4 text-[11px] leading-relaxed text-blue-100">
                  <textarea
                    value={agentCode}
                    onChange={(event) => updateAgentCode(event.target.value)}
                    spellCheck={false}
                    className="min-h-72 w-full resize-y border-0 bg-transparent font-mono text-[11px] leading-relaxed text-blue-100 outline-none"
                  />
                </pre>
              </div>
              ) : null}
            </div>
          </div>

          {pendingConfirmation && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 z-50">
              <div className="max-w-md w-full bg-neutral-800 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-amber-500">
                  <ShieldAlert size={24} />
                  <h3 className="font-black uppercase tracking-widest text-lg">Recon Checkpoint</h3>
                </div>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  {pendingConfirmation.payload?.explanation || "A delivered workflow item needs operator approval before continuing."}
                </p>
                <div className="bg-black/20 rounded-lg p-3 font-mono text-xs text-blue-400">
                  ACTION: {pendingConfirmation.payload?.name}({JSON.stringify(pendingConfirmation.payload?.args)})
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => confirmAction(pendingConfirmation.id, false)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-black uppercase tracking-widest transition-all"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                  <button 
                    onClick={() => confirmAction(pendingConfirmation.id, true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40"
                  >
                    <CheckCircle2 size={16} />
                    Approve Action
                  </button>
                </div>
              </div>
            </div>
          )}

          {manualGateActive && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 z-50">
              <div className="max-w-md w-full bg-neutral-800 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-emerald-500">
                  <CheckCircle2 size={24} />
                  <h3 className="font-black uppercase tracking-widest text-lg">Manual Gate Active</h3>
                </div>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  The agent has encountered a block or reached a sensitive stage and is waiting for your signal to proceed.
                </p>
                <div className="bg-black/20 rounded-lg p-3 font-mono text-xs text-blue-400">
                  STATUS: {approvalStatus ? approvalStatus.toUpperCase() : "WAITING_FOR_OPERATOR_APPROVAL"}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    disabled={isApproving}
                    onClick={() => handleJobApproval(false)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                  <button 
                    disabled={isApproving}
                    onClick={() => handleJobApproval(true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40 disabled:opacity-50"
                  >
                    {isApproving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Grant Approval
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {display.sidePanel ? (
        <div className="w-full border-t border-white/5 bg-neutral-800/50 flex flex-col">
          <div className="grid grid-cols-2 border-b border-white/5 p-2">
            <button
              type="button"
              onClick={() => setPanelMode("configure")}
              className={`rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-widest ${panelMode === "configure" ? "bg-white text-neutral-900" : "text-neutral-500 hover:bg-white/5"}`}
            >
              Config
            </button>
            <button
              type="button"
              onClick={() => setPanelMode("evidence")}
              className={`rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-widest ${panelMode === "evidence" ? "bg-white text-neutral-900" : "text-neutral-500 hover:bg-white/5"}`}
            >
              Evidence
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {panelMode === "configure" ? (
              <div className="space-y-2 p-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Selected Model</div>
                  <div className="mt-1 text-sm font-bold text-white">{config.model}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Launch State</div>
                  <div className="mt-1 text-sm font-bold text-white">
                    {isAgentRunning ? "Running / streaming" : launchPid ? `Started PID ${launchPid}` : "Ready"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Active Tools</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      ["Search", config.googleSearch],
                      ["Maps", config.googleMaps],
                      ["URL Context", config.urlContext],
                      ["Code", config.codeExecution],
                      ["Functions", config.functionCalling],
                      ["Structured", config.structuredOutputs],
                      ["Computer Use", config.computerUse],
                    ].filter(([, enabled]) => enabled).map(([label]) => (
                      <span key={String(label)} className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-300">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[10px] font-semibold leading-relaxed text-neutral-400">
                  URL Context can be enabled with Search, Code Execution, or Function Calling for validation and pre-deployment recon. Keep temperature at Gemini 3 default unless a specific stage proves otherwise.
                </div>
              </div>
            ) : (
              <>
                <div className="px-2 py-2 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Delivered Evidence</h3>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-500">
                    <Clock size={10} />
                    Real-time
                  </div>
                </div>
                {actions.map((action, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border transition-all ${idx === 0 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-white/5 border-transparent opacity-60'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {action.name.includes('click') ? <MousePointer2 size={12} className="text-blue-400" /> : <Keyboard size={12} className="text-purple-400" />}
                        <span className="text-[10px] font-black uppercase tracking-tighter text-white">{action.name}</span>
                      </div>
                      <span className="text-[9px] text-neutral-500 font-mono">
                        {new Date(action.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 truncate">
                      {JSON.stringify(action.args)}
                    </div>
                    {idx === 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Executing...</span>
                      </div>
                    )}
                  </div>
                ))}

                {actions.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-neutral-600 space-y-2">
                    <Loader2 size={24} className="animate-spin opacity-20" />
                    <p className="text-[10px] font-bold uppercase">Waiting for job evidence</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4 border-t border-white/5 space-y-3">
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-neutral-900 text-xs font-black uppercase tracking-widest hover:bg-neutral-200 transition-all">
              Monitor Intake
            </button>
            <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500 px-1">
              <span>{telemetry.length} event(s) delivered</span>
              <div className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors">
                Evidence Trace <ExternalLink size={10} />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[10px] font-semibold leading-relaxed text-neutral-400">
              Launch starts the local browser agent from this UI. This panel monitors screenshots, actions, blockers, confirmations, and extracted evidence; it does not decide final BOM truth or write speculative cache rows.
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
