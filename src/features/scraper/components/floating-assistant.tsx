'use client';

import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  History, 
  Settings, 
  Layers, 
  Activity,
  Terminal,
  ChevronRight
} from 'lucide-react';

interface FloatingAssistantProps {
  onClose: () => void;
}

const BRAND_BADGES = {
  encompass: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Encompass' },
  marcone: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Marcone' },
  sears: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Sears' },
};

export function FloatingAssistant({ onClose }: FloatingAssistantProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'logs' | 'data'>('chat');
  const [activeBrand, setActiveBrand] = useState<keyof typeof BRAND_BADGES>('encompass');
  const [inputValue, setInputValue] = useState('');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-tight">Assistant</h2>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${BRAND_BADGES[activeBrand].color}`}>
                {BRAND_BADGES[activeBrand].label}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Agent Active</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-500 hover:text-zinc-300"
        >
          <X size={18} />
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex items-center gap-1 p-2 bg-zinc-900/50">
        {[
          { id: 'chat', label: 'Assistant', icon: Sparkles },
          { id: 'logs', label: 'Telemetry', icon: Activity },
          { id: 'data', label: 'Extracted', icon: Layers },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all duration-200
              ${activeTab === tab.id 
                ? 'bg-zinc-800 text-white shadow-lg' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}
            `}
          >
            <tab.icon size={14} />
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'chat' && (
          <>
            <div className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-1 rounded-full bg-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Source Note</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                I've detected a list of <span className="text-blue-400 font-semibold">12 OEM parts</span>. 
                <span className="ml-1 text-zinc-500 italic text-xs">Evidence captured from Encompass DOM results table.</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="text-[10px] bg-zinc-900 hover:bg-zinc-950 border border-zinc-700 px-2 py-1 rounded-full text-zinc-400 transition-colors">
                  Extract Prices
                </button>
                <button className="text-[10px] bg-zinc-900 hover:bg-zinc-950 border border-zinc-700 px-2 py-1 rounded-full text-zinc-400 transition-colors">
                  Check Availability
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex-shrink-0" />
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 max-w-[85%]">
                  <p className="text-sm text-zinc-400">Can you find the schematic for the control board?</p>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'logs' && (
          <div className="font-mono text-[11px] space-y-1">
            <div className="flex items-center gap-2 text-zinc-500">
              <Terminal size={12} />
              <span>[13:24:01] Initializing visual loop...</span>
            </div>
            <div className="flex items-center gap-2 text-green-500">
              <ChevronRight size={12} />
              <span>[13:24:05] Viewport captured (1920x1080)</span>
            </div>
            <div className="flex items-center gap-2 text-blue-400">
              <ChevronRight size={12} />
              <span>[13:24:08] Element detected: .part-row-v2</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <footer className="p-4 border-t border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md">
        <div className="relative group">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask the assistant..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <button className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:grayscale">
            <Send size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <button className="hover:text-zinc-300 flex items-center gap-1">
              <History size={12} /> History
            </button>
            <button className="hover:text-zinc-300 flex items-center gap-1">
              <Settings size={12} /> Settings
            </button>
          </div>
          <span>Gemini 3 Pro</span>
        </div>
      </footer>
    </div>
  );
}
