'use client';

import React, { useState } from 'react';
import { FloatingAssistant } from './floating-assistant';
import { BrowserEmulator } from './browser-emulator';
import { PromptCockpit } from './prompt-cockpit';
import { PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, Monitor, Code2 } from 'lucide-react';

export function ScraperCockpit() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'browser' | 'prompt'>('browser');

  return (
    <div className={`relative flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Main Content Area: Browser Emulator */}
      <main className="relative flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
        {/* Toolbar */}
        <header className="h-14 border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAssistantOpen(!isAssistantOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
              title={isAssistantOpen ? "Close Assistant" : "Open Assistant"}
            >
              {isAssistantOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/50 rounded-full border border-zinc-800 min-w-[300px]">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-zinc-400">
                {viewMode === 'browser' ? 'https://encompass.com/search?q=part...' : 'System Instruction Editor'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
              <button
                onClick={() => setViewMode('browser')}
                className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'browser' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Monitor size={14} />
                Live View
              </button>
              <button
                onClick={() => setViewMode('prompt')}
                className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'prompt' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Code2 size={14} />
                Prompt Cockpit
              </button>
            </div>
            
            <div className="w-px h-6 bg-zinc-800 mx-2" />
            
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'browser' ? <BrowserEmulator /> : <PromptCockpit />}
        </div>
      </main>

      {/* Floating Assistant Side Panel */}
      <aside 
        className={`
          relative h-full border-l border-zinc-800/50 bg-zinc-900/30 backdrop-blur-xl transition-all duration-500 ease-out z-20
          ${isAssistantOpen ? 'w-[400px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-none'}
        `}
      >
        <FloatingAssistant onClose={() => setIsAssistantOpen(false)} />
      </aside>
    </div>
  );
}
