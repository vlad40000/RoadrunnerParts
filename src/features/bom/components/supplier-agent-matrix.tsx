"use client";

import React, { useState } from "react";
import { 
  Globe, 
  CheckSquare, 
  Square, 
  Play, 
  Edit3, 
  ExternalLink, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Hash
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AgentState {
  id: string;
  name: string;
  url: string;
  sendDiagram: boolean;
  sendExpectedCount: boolean;
  status: "idle" | "running" | "success" | "error";
  error?: string;
}

interface SupplierAgentMatrixProps {
  model: string;
  truth: any;
}

const INITIAL_AGENTS: AgentState[] = [
  {
    id: "fix",
    name: "Fix.com Agent",
    url: "https://www.fix.com/models/washer/whirlpool/wtw7500gc2/",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
  },
  {
    id: "rc",
    name: "RepairClinic Agent",
    url: "https://www.repairclinic.com/Shop-For-Parts?SearchText=WTW7500GC2",
    sendDiagram: true,
    sendExpectedCount: false,
    status: "idle",
  },
  {
    id: "app",
    name: "AppliancePartsPros Agent",
    url: "https://www.appliancepartspros.com/search.aspx?model=WTW7500GC2",
    sendDiagram: false,
    sendExpectedCount: true,
    status: "idle",
  },
  {
    id: "sears",
    name: "Sears PartsDirect Agent",
    url: "https://www.searspartsdirect.com/search?q=WTW7500GC2",
    sendDiagram: true,
    sendExpectedCount: true,
    status: "idle",
  },
];

export function SupplierAgentMatrix({ model, truth }: SupplierAgentMatrixProps) {
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleAgentContext = (id: string, field: "sendDiagram" | "sendExpectedCount") => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, [field]: !agent[field] } : agent
    ));
  };

  const updateAgentUrl = (id: string, url: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id ? { ...agent, url } : agent
    ));
  };

  const runAgent = async (agent: AgentState) => {
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "running", error: undefined } : a));
    
    try {
      const payload = {
        task: "load_supplier_index",
        canonicalModel: model || "WTW7500GC2",
        supplier: agent.id === 'sears' ? 'sears-partsdirect' : agent.id,
        searchUrl: agent.url,
        visualTruth: {
          screenshotBase64: agent.sendDiagram ? truth?.screenshotBase64 : null,
          canonUrl: agent.sendDiagram ? truth?.canonUrl : null,
          expectedTotal: agent.sendExpectedCount ? (truth?.expectedTotal || 125) : null,
          assemblyNames: agent.sendDiagram ? truth?.assemblyNames : []
        }
      };

      const res = await fetch("/api/bom/source-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
          <Globe size={14} className="text-blue-500" /> Supplier Agent Matrix
        </h3>
        <div className="text-[10px] font-bold text-neutral-400 uppercase bg-neutral-100 px-2 py-0.5 rounded">
          Model: {model || "NONE"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {agents.map((agent) => (
          <motion.div
            key={agent.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${
              agent.status === "running" ? "border-blue-200 bg-blue-50/30" :
              agent.status === "success" ? "border-emerald-200 bg-emerald-50/30" :
              agent.status === "error" ? "border-red-200 bg-red-50/30" :
              "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-md"
            }`}
          >
            {/* Status Bar */}
            {agent.status !== "idle" && (
              <div className={`h-1 w-full absolute top-0 left-0 ${
                agent.status === "running" ? "bg-blue-500 animate-pulse" :
                agent.status === "success" ? "bg-emerald-500" :
                "bg-red-500"
              }`} />
            )}

            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    agent.status === "success" ? "bg-emerald-100 text-emerald-600" :
                    agent.status === "error" ? "bg-red-100 text-red-600" :
                    "bg-neutral-100 text-neutral-500 group-hover:bg-blue-100 group-hover:text-blue-600"
                  }`}>
                    {agent.status === "running" ? <Loader2 size={16} className="animate-spin" /> :
                     agent.status === "success" ? <CheckCircle2 size={16} /> :
                     agent.status === "error" ? <AlertCircle size={16} /> :
                     <Globe size={16} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-800">{agent.name}</h4>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">
                      {agent.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <a 
                    href={agent.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-all"
                    title="Open URL"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* URL Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Input URL
                  </label>
                  {editingId !== agent.id ? (
                    <button 
                      onClick={() => setEditingId(agent.id)}
                      className="text-[10px] font-bold text-blue-600 hover:underline uppercase"
                    >
                      [Edit]
                    </button>
                  ) : (
                    <button 
                      onClick={() => setEditingId(null)}
                      className="text-[10px] font-bold text-emerald-600 hover:underline uppercase"
                    >
                      [Save]
                    </button>
                  )}
                </div>
                <div className="relative group/url">
                  <input
                    type="text"
                    value={agent.url}
                    readOnly={editingId !== agent.id}
                    onChange={(e) => updateAgentUrl(agent.id, e.target.value)}
                    className={`w-full text-[11px] font-mono px-3 py-2 rounded-lg border transition-all ${
                      editingId === agent.id 
                        ? "bg-white border-blue-300 ring-2 ring-blue-50 text-neutral-900" 
                        : "bg-neutral-50 border-neutral-100 text-neutral-500 cursor-default"
                    }`}
                  />
                </div>
              </div>

              {/* Context Selection */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => toggleAgentContext(agent.id, "sendDiagram")}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${
                    agent.sendDiagram 
                      ? "border-blue-100 bg-blue-50/50 text-blue-700 shadow-sm" 
                      : "border-neutral-100 bg-neutral-50/30 text-neutral-400"
                  }`}
                >
                  {agent.sendDiagram ? <CheckSquare size={14} /> : <Square size={14} />}
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase leading-none">Diagram</span>
                    <span className="text-[8px] font-medium opacity-70">Send Encompass Truth</span>
                  </div>
                </button>

                <button
                  onClick={() => toggleAgentContext(agent.id, "sendExpectedCount")}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${
                    agent.sendExpectedCount 
                      ? "border-emerald-100 bg-emerald-50/50 text-emerald-700 shadow-sm" 
                      : "border-neutral-100 bg-neutral-50/30 text-neutral-400"
                  }`}
                >
                  {agent.sendExpectedCount ? <CheckSquare size={14} /> : <Square size={14} />}
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase leading-none">Count</span>
                    <span className="text-[8px] font-medium opacity-70">Expected: {truth?.expectedTotal || 125}</span>
                  </div>
                </button>
              </div>

              {/* Action Button */}
              <button
                onClick={() => runAgent(agent)}
                disabled={agent.status === "running" || !model}
                className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm ${
                  agent.status === "running" ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" :
                  agent.status === "success" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                  agent.status === "error" ? "bg-red-600 text-white hover:bg-red-700" :
                  "bg-neutral-900 text-white hover:bg-black hover:shadow-md transform active:scale-[0.98]"
                }`}
              >
                {agent.status === "running" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run {agent.name.split(" ")[0]} Agent
              </button>
            </div>
            
            {/* Error Message */}
            <AnimatePresence>
              {agent.error && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-red-50 border-t border-red-100 px-4 py-2"
                >
                  <p className="text-[9px] font-bold text-red-600 uppercase flex items-center gap-1">
                    <AlertCircle size={10} /> {agent.error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
