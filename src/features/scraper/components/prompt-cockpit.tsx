'use client';

import React, { useState } from 'react';
import { 
  Save, 
  RotateCcw, 
  Terminal, 
  BookOpen, 
  ShieldCheck, 
  Zap, 
  FileCode,
  Copy,
  Check
} from 'lucide-react';

const BRAND_PRESETS = {
  'general': {
    label: 'General Agent',
    instruction: `System Role: Deterministic supplier-run operator.

Task:
- Use the provided supplier URL and model context to extract source-backed parts source data.

Rules:
1. Use the supplied target URL first.
2. Use visual context only as guidance.
3. Return source-backed part rows only.
4. Keep expected count source data separate.`
  },
  'encompass': {
    label: 'Encompass (Visual)',
    instruction: `System Role: Encompass-specialized visual extractor.

Task:
- Navigate to the Encompass model page.
- Detect the "Parts List" or "Exploded View" table.
- Extract Part Number, Description, and Price.

Encompass Gates:
- If a 403 Forbidden is detected, switch to visual computer-use loop immediately.
- Detect "In Stock" vs "Special Order" status.`
  },
  'marcone': {
    label: 'Marcone (API/DOM)',
    instruction: `System Role: Marcone-specialized DOM extractor.

Task:
- Extract part rows from the Marcone results grid.
- Map internal Marcone IDs to canonical part numbers.`
  }
};

export function PromptCockpit() {
  const [selectedBrand, setSelectedBrand] = useState<keyof typeof BRAND_PRESETS>('general');
  const [instruction, setInstruction] = useState(BRAND_PRESETS['general'].instruction);
  const [isCopied, setIsCopied] = useState(false);

  const handleBrandSelect = (brand: keyof typeof BRAND_PRESETS) => {
    setSelectedBrand(brand);
    setInstruction(BRAND_PRESETS[brand].instruction);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(instruction);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="p-6 border-b border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Terminal size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Prompt Cockpit</h2>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Agent Steering & Instruction Design</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors">
              <RotateCcw size={14} />
              Reset
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
              <Save size={14} />
              Save instruction
            </button>
          </div>
        </div>

        {/* Brand Selector */}
        <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          {(Object.keys(BRAND_PRESETS) as Array<keyof typeof BRAND_PRESETS>).map((brand) => (
            <button
              key={brand}
              onClick={() => handleBrandSelect(brand)}
              className={`
                flex-1 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all
                ${selectedBrand === brand 
                  ? 'bg-zinc-800 text-white shadow-md' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'}
              `}
            >
              {BRAND_PRESETS[brand].label}
            </button>
          ))}
        </div>
      </header>

      {/* Editor Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
              <FileCode size={12} /> System Instruction
            </div>
            <button 
              onClick={copyToClipboard}
              className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors"
            >
              {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
          <div className="relative flex-1 group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="relative w-full h-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 font-mono text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Sidebar / Context */}
        <aside className="w-80 border-l border-zinc-800/50 bg-zinc-900/30 p-6 space-y-6 overflow-y-auto">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-4 flex items-center gap-2">
              <BookOpen size={12} /> Brand Gates
            </h4>
            <div className="space-y-3">
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck size={12} className="text-green-500" />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-tight">403 Shield</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Automatic transition to visual loop when WAF blocks direct access.
                </p>
              </div>
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg opacity-50 grayscale">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={12} className="text-blue-500" />
                  <span className="text-xs font-bold text-zinc-200 uppercase tracking-tight">Price Scraper</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Targeted extraction of pricing data across all variants.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-4">Preview Variables</h4>
            <div className="space-y-2 font-mono text-[10px]">
              <div className="flex justify-between items-center p-2 bg-zinc-900 rounded-md">
                <span className="text-blue-400">MODEL_ID</span>
                <span className="text-zinc-500">"RF28R73..."</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-zinc-900 rounded-md">
                <span className="text-blue-400">SUPPLIER_URL</span>
                <span className="text-zinc-500">"encompass.com/..."</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
