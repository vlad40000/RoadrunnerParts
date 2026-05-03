"use client";

import { useState } from "react";
import { Camera, RefreshCw, List, ExternalLink, Edit2, Check, FileText, Save } from "lucide-react";

interface EncompassSupervisorProps {
  jobId?: string | null;
  model: string;
  onTruthCaptured?: (data: any) => void;
}

export function EncompassSupervisorPanel({ jobId, model, onTruthCaptured }: EncompassSupervisorProps) {
  const [loading, setLoading] = useState(false);
  const [truth, setTruth] = useState<any>(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const [manualTotal, setManualTotal] = useState<number | string>("");
  const [instructions, setInstructions] = useState("");
  const [instructionName, setInstructionName] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  async function persistVisualTruth(patch: Record<string, unknown>) {
    const nextTruth = {
      ...(truth || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    setTruth(nextTruth);
    if (jobId) {
      const res = await fetch(`/api/bom/jobs/${jobId}/visual-truth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextTruth),
      });
      if (!res.ok) throw new Error("Visual truth save failed");
    }
    onTruthCaptured?.(nextTruth);
  }

  async function saveInstructions(nextInstructions = instructions, nextName = instructionName) {
    setSavingInstructions(true);
    try {
      await persistVisualTruth({
        operatorInstructions: nextInstructions,
        operatorInstructionName: nextName || "manual",
        operatorInstructionsUploadedAt: new Date().toISOString(),
      });
    } finally {
      setSavingInstructions(false);
    }
  }

  async function handleInstructionFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setInstructions(text);
    setInstructionName(file.name);
    await saveInstructions(text, file.name);
    event.target.value = "";
  }

  async function handleCapture() {
    try {
      setLoading(true);
      const res = await fetch("/api/agents/encompass/assembly-overview-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, canonUrl: truth?.canonUrl || undefined, immediate: false }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.details || payload?.error || "Capture failed");
      }
      
      const data = await res.json();
      const normalizedTruth = {
        ...data,
        operatorInstructions: instructions || truth?.operatorInstructions || "",
        operatorInstructionName: instructionName || truth?.operatorInstructionName || "",
        canonUrl: data.canonUrl || data.context?.canonUrl || null,
      };
      setTruth(normalizedTruth);
      setManualTotal(data.expectedTotal || "");
      if (jobId) {
        await fetch(`/api/bom/jobs/${jobId}/visual-truth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedTruth),
        });
      }
      if (onTruthCaptured) onTruthCaptured(normalizedTruth);
    } catch (err) {
      console.error(err);
      alert(`Supervisor capture failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="font-semibold text-neutral-800 uppercase tracking-tight text-sm">
            Encompass Visual Supervisor
          </h2>
        </div>
        {truth && (
          <a 
            href={truth.canonUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Canon URL <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div className="p-4 space-y-6">
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  Build Instructions
                </div>
                <div className="text-[10px] font-semibold text-blue-500">
                  {instructionName || truth?.operatorInstructionName || "Manual paste or upload .txt/.md"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 hover:bg-blue-50">
                <List size={12} />
                Upload
                <input
                  type="file"
                  accept=".txt,.md,.json,text/plain,text/markdown,application/json"
                  className="hidden"
                  onChange={handleInstructionFile}
                />
              </label>
              <button
                type="button"
                onClick={() => saveInstructions().catch((err) => alert(err instanceof Error ? err.message : "Instruction save failed"))}
                disabled={savingInstructions}
                className="inline-flex items-center gap-1 rounded-md border border-blue-600 bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {savingInstructions ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
            </div>
          </div>
          <textarea
            value={instructions || truth?.operatorInstructions || ""}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Paste the instructions that should travel with this job build and supplier-agent preflight."
            className="min-h-24 w-full resize-y rounded-md border border-blue-100 bg-white p-2 font-mono text-xs text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Actions Row */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handleCapture}
            disabled={loading}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 transition-all group disabled:opacity-50"
          >
            <Camera className={`text-neutral-400 group-hover:text-blue-500 ${loading ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-medium text-neutral-600 group-hover:text-blue-700">
              {loading ? "Capturing..." : "Capture Overview"}
            </span>
          </button>

          <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all group opacity-50 cursor-not-allowed">
            <List className="text-neutral-400" />
            <span className="text-xs font-medium text-neutral-600">Upload Image</span>
          </button>

          <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all group opacity-50 cursor-not-allowed">
            <ExternalLink className="text-neutral-400" />
            <span className="text-xs font-medium text-neutral-600">Paste URL</span>
          </button>
        </div>

        {/* Metadata Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Expected Total
            </label>
            <div className="flex items-center gap-2">
              {editingTotal ? (
                <input
                  type="number"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  className="w-20 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
              ) : (
                <div className="text-xl font-bold text-neutral-900 tabular-nums">
                  {truth?.expectedTotal || manualTotal || "---"}
                </div>
              )}
              <button 
                onClick={() => setEditingTotal(!editingTotal)}
                className="p-1 text-neutral-400 hover:text-blue-600 transition-colors"
              >
                {editingTotal ? <Check size={16} /> : <Edit2 size={16} />}
              </button>
              <button className="p-1 text-neutral-400 hover:text-blue-600 transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Assembly Names
            </label>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-neutral-600">
                {truth?.assemblyNames?.length || 0} Identified
              </div>
              <button className="px-2 py-0.5 rounded border border-neutral-200 text-[10px] font-bold hover:bg-neutral-50 transition-colors">
                EXTRACT
              </button>
              <button className="px-2 py-0.5 rounded border border-neutral-200 text-[10px] font-bold hover:bg-neutral-50 transition-colors">
                EDIT
              </button>
            </div>
          </div>
        </div>

        {/* Viewport */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
            Visual Truth Viewport
          </label>
          <div className="aspect-video rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-50 flex items-center justify-center overflow-hidden relative group">
            {truth?.storedImageUrl || truth?.base64 || truth?.screenshotBase64 ? (
              <img 
                src={
                  truth?.storedImageUrl ||
                  (truth?.base64 ? `data:image/png;base64,${truth.base64}` : truth.screenshotBase64)
                }
                alt="Encompass Assembly Overview" 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="text-center space-y-2">
                <Camera size={32} className="mx-auto text-neutral-300" />
                <p className="text-xs text-neutral-400">No screenshot captured yet</p>
              </div>
            )}
            
            {truth && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-semibold px-3 py-1.5 bg-black/60 rounded-full backdrop-blur-md">
                  View Full Resolution
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
