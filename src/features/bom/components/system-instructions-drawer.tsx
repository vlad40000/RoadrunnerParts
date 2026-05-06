"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, Check, Settings2, ArrowUp, ArrowDown, AlertTriangle, Bot } from "lucide-react";

export type SystemInstruction = {
  id: string;
  name: string;
  content: string;
};

const STORAGE_KEY = "roadrunner:system-instructions";

const IMMUTABLE_ROADRUNNER_BASE = [
  "Identity, source-of-truth, output-format, and no-hallucinated-BOM-truth rules are hard guardrails.",
  "Architecture or CoVe reviewer prompts can guide missing-system review only; they are not source evidence.",
  "Final OEM part rows, part numbers, prices, and completeness claims must come from provider evidence, captured JSON, manuals, or existing database records.",
  "Return valid JSON whenever the selected scenario requires JSON.",
];

export function compileInstructions(items: SystemInstruction[], baseInstruction = "") {
  const preamble = [
    "[SYSTEM INSTRUCTION HIERARCHY]",
    "Read the stack in order, then resolve conflicts by explicit WEIGHT.",
    "Higher WEIGHT wins over lower WEIGHT.",
    "Operator override/user prompt is applied last and wins over presets unless it violates the immutable Roadrunner base.",
    "Do not silently merge conflicting requirements by compromise.",
  ].join("\n");

  const baseBlocks = [
    [
      "[BASE SYSTEM INSTRUCTION | WEIGHT 1000 | IMMUTABLE ROADRUNNER SOURCE-OF-TRUTH]",
      ...IMMUTABLE_ROADRUNNER_BASE.map((rule) => `- ${rule}`),
    ].join("\n"),
    baseInstruction.trim()
      ? ["[SCENARIO BASE INSTRUCTION | WEIGHT 900]", baseInstruction.trim()].join("\n")
      : "",
  ].filter(Boolean).join("\n\n");

  const blocks = items
    .map((item, index) => {
      const weight = 800 - index * 10;
      return [
        `[PRESET: ${item.name} | PRIORITY ${index + 1} | WEIGHT ${weight}]`,
        item.content.trim(),
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [preamble, baseBlocks, blocks].filter(Boolean).join("\n\n");
}

export function getInstructionStackNames(instructionText: string) {
  return Array.from(instructionText.matchAll(/\[PRESET:\s*([^|\]]+)/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

function presetClaimsComputerUseAllowed(content: string) {
  return /(computer use|visual loop|browser)\b[\s\S]{0,80}\b(allow|allowed|enable|enabled|use|run)/i.test(content);
}

function presetClaimsComputerUseBlocked(content: string) {
  return /\b(no|disable|disabled|exclude|excluded|forbid|forbidden|do not|don't)\b[\s\S]{0,80}\bcomputer use/i.test(content);
}

function presetClaimsMarketSignal(content: string, name: string) {
  return /market[-\s]?signal|market intelligence|ebay|listing|pricing|price/i.test(`${name}\n${content}`);
}

function presetClaimsBomTruth(content: string, name: string) {
  return /bom truth|bom extraction|oem part rows|source-backed|source evidence|part numbers/i.test(`${name}\n${content}`);
}

function detectConflicts(items: SystemInstruction[]) {
  const computerUseAllowed = items.filter((item) => presetClaimsComputerUseAllowed(item.content));
  const computerUseBlocked = items.filter((item) => presetClaimsComputerUseBlocked(item.content));
  const marketSignal = items.filter((item) => presetClaimsMarketSignal(item.content, item.name));
  const bomTruth = items.filter((item) => presetClaimsBomTruth(item.content, item.name));
  const warnings: string[] = [];

  if (computerUseAllowed.length && computerUseBlocked.length) {
    warnings.push(
      `Computer Use conflict: ${computerUseAllowed.map((item) => item.name).join(", ")} allows it while ${computerUseBlocked.map((item) => item.name).join(", ")} blocks it. Higher WEIGHT wins.`,
    );
  }

  if (marketSignal.length && bomTruth.length) {
    warnings.push(
      `Market/pricing conflict: ${marketSignal.map((item) => item.name).join(", ")} should only be active for pricing/listing work, not BOM truth extraction.`,
    );
  }

  return warnings;
}

export function SystemInstructionsDrawer({
  isOpen,
  onClose,
  currentInstruction,
  baseInstruction = "",
  jobId,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentInstruction: string;
  baseInstruction?: string;
  jobId?: string;
  onSelect: (content: string) => void;
}) {
  const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
  const [learnedInstructions, setLearnedInstructions] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPromotingLearned, setIsPromotingLearned] = useState(false);

  const fetchPresets = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/agent-presets");
      const data = await res.json();
      if (data.ok && data.presets?.length > 0) {
        setInstructions(data.presets);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.presets));
      }
    } catch (e) {
      console.error("Failed to fetch presets from backend", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLearnedInstructions = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/bom/jobs/${jobId}/instructions`);
      const data = await res.json();
      if (data.ok) {
        setLearnedInstructions(data.instructions || "");
      }
    } catch (e) {
      console.error("Failed to fetch learned instructions", e);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Load from local storage first for immediate UI
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setInstructions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse system instructions", e);
      }
    }
    
    // Then sync from backend
    fetchPresets();
    fetchLearnedInstructions();
  }, [jobId]);

  const promoteLearned = () => {
    if (!learnedInstructions) return;
    setEditingId(`temp-promote-${crypto.randomUUID()}`);
    setEditName(`Learned Rule: ${new Date().toLocaleDateString()}`);
    setEditContent(learnedInstructions);
    setIsPromotingLearned(true);
  };

  useEffect(() => {
    if (!instructions.length) {
      setSelectedIds([]);
      return;
    }

    const activeIds = instructions
      .filter((item) => item.content && (currentInstruction === item.content || currentInstruction.includes(item.content)))
      .sort((a, b) => currentInstruction.indexOf(a.content) - currentInstruction.indexOf(b.content))
      .map((item) => item.id);
    setSelectedIds(activeIds);
  }, [currentInstruction, instructions]);

  const saveToStorage = (list: SystemInstruction[]) => {
    setInstructions(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const selectedItemsFor = (ids: string[], source = instructions) =>
    ids
      .map((id) => source.find((item) => item.id === id))
      .filter((item): item is SystemInstruction => Boolean(item));

  const applySelected = (ids: string[]) => {
    onSelect(compileInstructions(selectedItemsFor(ids), baseInstruction));
  };

  const toggleInstruction = (item: SystemInstruction) => {
    const nextIds = selectedIds.includes(item.id)
      ? selectedIds.filter((id) => id !== item.id)
      : [...selectedIds, item.id];
    setSelectedIds(nextIds);
    applySelected(nextIds);
  };

  const moveSelected = (id: string, direction: -1 | 1, e: React.MouseEvent) => {
    e.stopPropagation();
    const index = selectedIds.indexOf(id);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const nextIds = [...selectedIds];
    [nextIds[index], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[index]];
    setSelectedIds(nextIds);
    applySelected(nextIds);
  };

  const addInstruction = () => {
    setSaveError(null);
    const newItem: SystemInstruction = {
      id: `temp-${crypto.randomUUID()}`,
      name: "New Instruction",
      content: "",
    };
    setInstructions([...instructions, newItem]);
    setEditingId(newItem.id);
    setEditName(newItem.name);
    setEditContent(newItem.content);
  };

  const deleteInstruction = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newList = instructions.filter((i) => i.id !== id);
    setInstructions(newList);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
    const nextSelectedIds = selectedIds.filter((selectedId) => selectedId !== id);
    setSelectedIds(nextSelectedIds);
    onSelect(compileInstructions(selectedItemsFor(nextSelectedIds, newList), baseInstruction));
    
    try {
      await fetch(`/api/agent-presets?id=${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete preset from backend", e);
    }

    if (editingId === id) setEditingId(null);
  };

  const startEditing = (item: SystemInstruction, e: React.MouseEvent) => {
    e.stopPropagation();
    setSaveError(null);
    setEditingId(item.id);
    setEditName(item.name);
    setEditContent(item.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const name = editName.trim();
    const content = editContent.trim();
    if (!name || !content) {
      setSaveError("Preset name and instruction content are required.");
      return;
    }

    const updatedItem = {
      id: editingId.startsWith("temp-") ? undefined : editingId,
      name,
      content,
    };

    try {
      const res = await fetch("/api/agent-presets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedItem),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.preset) {
        throw new Error(data?.error || `Preset save failed (${res.status})`);
      }

      const savedPreset = data.preset as SystemInstruction;
      const exists = instructions.some((i) => i.id === editingId);
      const newList = exists
        ? instructions.map((i) => (i.id === editingId ? savedPreset : i))
        : [...instructions, savedPreset];
      setInstructions(newList);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      setSaveError(null);
      setEditingId(null);
      setIsPromotingLearned(false);
    } catch (e) {
      console.error("Failed to save preset to backend", e);
      setSaveError(e instanceof Error ? e.message : "Failed to save preset.");
    }
  };

  const selectedItems = selectedItemsFor(selectedIds);
  const conflictWarnings = detectConflicts(selectedItems);
  const compiledPreview = compileInstructions(selectedItems, baseInstruction);

  return (
    <div 
      className={`fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      onClick={onClose}
    >
      <div 
        className={`h-full w-full max-w-md border-l border-white/10 bg-[#0f1115] shadow-2xl transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-14 items-center justify-between border-b border-white/10 px-6 bg-[#111317]">
          <div className="flex items-center gap-2">
            <Settings2 size={16} className={`text-amber-400 ${isLoading ? "animate-spin" : ""}`} />
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/90">System Instructions</h2>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="flex h-[calc(100%-3.5rem)] flex-col overflow-hidden p-6 bg-[#0f1115]">
          {learnedInstructions && (
            <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={14} className="text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Learned Behavioral Rules</span>
                </div>
                <button 
                  onClick={promoteLearned}
                  className="rounded bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300 hover:bg-blue-500/30 transition-colors"
                >
                  PROMOTE TO PRESET
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-white/60 italic line-clamp-3">
                "{learnedInstructions}"
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-blue-500/40" />
                </div>
                <span className="text-[9px] font-bold text-white/20 uppercase tracking-tighter">Active for this job</span>
              </div>
            </div>
          )}

          <div className="mb-6 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
              Instruction Presets {selectedIds.length ? `(${selectedIds.length} active)` : ""}
            </span>
            <button 
              onClick={addInstruction}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5 text-[10px] font-bold text-white/70 hover:bg-white/10 hover:border-white/10 transition-all active:scale-95"
            >
              <Plus size={14} /> NEW PRESET
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allIds = instructions.map((item) => item.id);
                setSelectedIds(allIds);
                applySelected(allIds);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:bg-white/10"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                onSelect(compileInstructions([], baseInstruction));
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:bg-white/10"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg bg-blue-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-blue-400"
            >
              Apply Selected
            </button>
          </div>

          {conflictWarnings.length ? (
            <div className="mb-4 grid gap-2">
              {conflictWarnings.map((warning) => (
                <div
                  key={warning}
                  className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-amber-100"
                >
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {instructions.map((item) => {
              const isActive = selectedIds.includes(item.id);
              const priorityIndex = selectedIds.indexOf(item.id);
              const weight = priorityIndex >= 0 ? selectedIds.length - priorityIndex : 0;
              const isEditing = editingId === item.id;

              return (
                <div 
                  key={item.id}
                  className={`group relative rounded-xl border p-4 transition-all duration-300 ${
                    isEditing 
                      ? "border-amber-400/50 bg-amber-400/5" 
                      : isActive 
                        ? "border-blue-500/40 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                        : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60">Preset Name</label>
                        <input 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/20"
                          placeholder="e.g. Data Extraction Specialist"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60">Instructions</label>
                        <textarea 
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[160px] w-full bg-transparent text-xs leading-relaxed text-white/70 outline-none resize-none placeholder:text-white/20 custom-scrollbar"
                          placeholder="You are an expert at..."
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        {saveError ? (
                          <div className="mr-auto rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-[10px] font-semibold text-red-200">
                            {saveError}
                          </div>
                        ) : null}
                        <button 
                          onClick={() => {
                            setEditingId(null);
                            setSaveError(null);
                          }}
                          className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                        >
                          CANCEL
                        </button>
                        <button 
                          onClick={saveEdit} 
                          className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-[10px] font-bold text-black hover:bg-amber-300 transition-colors active:scale-95"
                        >
                          <Save size={14} /> SAVE PRESET
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div 
                          className="min-w-0 flex-1 cursor-pointer" 
                          onClick={() => toggleInstruction(item)}
                        >
                          <div className="flex items-center gap-2">
                            <h3 className={`truncate text-sm font-bold ${isActive ? "text-blue-400" : "text-white/90"}`}>
                              {item.name}
                            </h3>
                            {isActive && (
                              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                            )}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/40 group-hover:text-white/50 transition-colors">
                            {item.content || "No instructions defined..."}
                          </p>
                        </div>
                        <div className="flex gap-3 ml-4 opacity-0 transition-all duration-200 group-hover:opacity-100">
                          {isActive ? (
                            <>
                              <button
                                onClick={(e) => moveSelected(item.id, -1, e)}
                                disabled={priorityIndex <= 0}
                                className="text-white/30 hover:text-blue-300 disabled:opacity-20 p-1 hover:bg-white/5 rounded transition-colors"
                                title="Move higher priority"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={(e) => moveSelected(item.id, 1, e)}
                                disabled={priorityIndex === selectedIds.length - 1}
                                className="text-white/30 hover:text-blue-300 disabled:opacity-20 p-1 hover:bg-white/5 rounded transition-colors"
                                title="Move lower priority"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </>
                          ) : null}
                          <button 
                            onClick={(e) => startEditing(item, e)} 
                            className="text-white/30 hover:text-white p-1 hover:bg-white/5 rounded transition-colors"
                            title="Edit preset"
                          >
                            <Settings2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => deleteInstruction(item.id, e)} 
                            className="text-white/30 hover:text-red-400 p-1 hover:bg-red-400/10 rounded transition-colors"
                            title="Delete preset"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {isActive && (
                        <div className="mt-4 flex items-center gap-2 text-[9px] font-bold tracking-[0.1em] text-blue-400/80">
                          <Check size={12} strokeWidth={3} />
                          <span>PRIORITY {priorityIndex + 1}</span>
                          <span className="rounded bg-blue-400/10 px-1.5 py-0.5">WEIGHT {weight}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            
            {instructions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="rounded-full bg-white/5 p-4 mb-4">
                  <Settings2 size={32} className="text-white/10" />
                </div>
                <h3 className="text-sm font-bold text-white/40">No Presets Found</h3>
                <p className="text-[11px] text-white/20 mt-1 max-w-[200px]">Create your first system instruction set to streamline your workflow.</p>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              <span>Compiled Preview</span>
              <span>{selectedIds.length} presets</span>
            </div>
            <pre className="max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-[10px] leading-relaxed text-white/55 custom-scrollbar">
              {compiledPreview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
