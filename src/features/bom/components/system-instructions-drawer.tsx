"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, Check, Settings2, ArrowUp, ArrowDown } from "lucide-react";

type SystemInstruction = {
  id: string;
  name: string;
  content: string;
};

const STORAGE_KEY = "roadrunner:system-instructions";

function compileInstructions(items: SystemInstruction[]) {
  if (!items.length) return "";
  const preamble = [
    "[SYSTEM INSTRUCTION HIERARCHY]",
    "Apply the selected presets in priority order from top to bottom.",
    "If any selected presets conflict, obey the higher-priority preset with the larger weight.",
    "Do not merge conflicting requirements by compromise; yield to the higher placed instruction.",
  ].join("\n");

  const blocks = items
    .map((item, index) => {
      const weight = items.length - index;
      return [
        `[PRESET PRIORITY ${index + 1} | WEIGHT ${weight}: ${item.name}]`,
        item.content.trim(),
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return `${preamble}\n\n${blocks}`;
}

export function SystemInstructionsDrawer({
  isOpen,
  onClose,
  currentInstruction,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentInstruction: string;
  onSelect: (content: string) => void;
}) {
  const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
  }, []);

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
    onSelect(compileInstructions(selectedItemsFor(ids)));
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
    onSelect(compileInstructions(selectedItemsFor(nextSelectedIds, newList)));
    
    try {
      await fetch(`/api/agent-presets?id=${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete preset from backend", e);
    }

    if (editingId === id) setEditingId(null);
  };

  const startEditing = (item: SystemInstruction, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditName(item.name);
    setEditContent(item.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    
    const updatedItem = {
      id: editingId.startsWith("temp-") ? undefined : editingId,
      name: editName,
      content: editContent
    };

    try {
      const res = await fetch("/api/agent-presets", {
        method: "POST",
        body: JSON.stringify(updatedItem),
      });
      const data = await res.json();
      
      if (data.ok) {
        const savedPreset = data.preset;
        const newList = instructions.map((i) =>
          i.id === editingId ? savedPreset : i
        );
        setInstructions(newList);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      }
    } catch (e) {
      console.error("Failed to save preset to backend", e);
      // Fallback: update locally anyway
      const updated = instructions.map((i) =>
        i.id === editingId ? { ...i, name: editName, content: editContent } : i
      );
      setInstructions(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    
    setEditingId(null);
  };

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
                onSelect("");
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
                        <button 
                          onClick={() => setEditingId(null)} 
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
        </div>
      </div>
    </div>
  );
}
