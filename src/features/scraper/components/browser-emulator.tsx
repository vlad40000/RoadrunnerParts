'use client';

import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  Search, 
  MoreVertical,
  ShieldCheck,
  Lock,
  ExternalLink
} from 'lucide-react';

export function BrowserEmulator() {
  const [url, setUrl] = useState('https://encompass.com/appliance/SAMSUNG/RF28R7351SR/AA-01');
  const [status, setStatus] = useState<'ok' | 'blocked' | 'loading'>('ok');

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Browser Chrome (Address Bar & Controls) */}
      <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/50">
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors">
            <ChevronLeft size={18} />
          </button>
          <button className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors">
            <ChevronRight size={18} />
          </button>
          <button className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-white transition-colors">
            <RotateCw size={16} />
          </button>
        </div>

        <div className="flex-1 flex items-center gap-2 px-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded-full group focus-within:ring-1 focus-within:ring-blue-500/50 transition-all">
          {status === 'blocked' ? (
            <ShieldCheck size={12} className="text-red-500" />
          ) : (
            <Lock size={12} className="text-green-500" />
          )}
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`flex-1 bg-transparent text-sm focus:outline-none ${status === 'blocked' ? 'text-red-400' : 'text-zinc-300'}`}
          />
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-zinc-600" />
            <Search size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium text-zinc-200 transition-colors">
            <ExternalLink size={14} />
            <span>Pop out</span>
          </button>
          <button className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Browser Viewport */}
      <div className="flex-1 relative overflow-auto bg-white overflow-hidden">
        {/* Security Gate Overlay */}
        {status === 'blocked' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="max-w-md p-8 bg-zinc-900 border border-red-500/30 rounded-2xl shadow-2xl text-center space-y-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Security Gate Triggered</h3>
              <p className="text-sm text-zinc-400">
                The provider has detected automated traffic (403 Forbidden). 
                The agent is preparing to switch to <span className="text-blue-400 font-bold underline">Visual Loop</span> mode to bypass.
              </p>
              <button 
                onClick={() => setStatus('ok')}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-black uppercase tracking-widest text-white transition-all"
              >
                Dismiss & Re-run
              </button>
            </div>
          </div>
        )}

        {/* Skeleton/Placeholder of the Target Site */}
        <div className="absolute inset-0 bg-zinc-50 flex flex-col">
          {/* Mock Header */}
          <div className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 justify-between">
            <div className="w-32 h-6 bg-zinc-100 rounded" />
            <div className="flex gap-4">
              <div className="w-16 h-4 bg-zinc-100 rounded" />
              <div className="w-16 h-4 bg-zinc-100 rounded" />
              <div className="w-16 h-4 bg-zinc-100 rounded" />
            </div>
          </div>

          {/* Mock Body */}
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex gap-8">
                <div className="w-64 h-64 bg-zinc-200 rounded-xl animate-pulse" />
                <div className="flex-1 space-y-4 pt-4">
                  <div className="h-8 bg-zinc-200 rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-zinc-100 rounded w-1/2" />
                  <div className="h-4 bg-zinc-100 rounded w-full" />
                  <div className="h-4 bg-zinc-100 rounded w-full" />
                  <div className="pt-4 flex gap-4">
                    <div className="w-32 h-10 bg-blue-600 rounded-lg" />
                    <div className="w-32 h-10 bg-zinc-200 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* Mock Table */}
              <div className="border border-zinc-200 rounded-xl bg-white overflow-hidden">
                <div className="h-12 bg-zinc-50 border-b border-zinc-200" />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 border-b border-zinc-100 flex items-center px-4 gap-4">
                    <div className="w-12 h-12 bg-zinc-100 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-zinc-100 rounded w-1/3" />
                      <div className="h-3 bg-zinc-50 rounded w-1/4" />
                    </div>
                    <div className="w-24 h-4 bg-zinc-100 rounded" />
                    <div className="w-16 h-6 bg-blue-50 text-blue-600 rounded flex items-center justify-center text-[10px] font-bold">IN STOCK</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Agent Interaction Overlays (Future) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Example Mouse Cursor */}
          <div className="absolute top-1/2 left-1/3 transition-all duration-700">
            <div className="relative">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.65376 12.3673L15.0033 19.1415C15.867 19.7672 17.0707 19.1504 17.0707 18.0874L17.0707 4.14493C17.0707 3.08185 15.867 2.46513 15.0033 3.09083L5.65376 9.86506C4.81188 10.4749 4.81188 11.7574 5.65376 12.3673Z" fill="white" stroke="black" strokeWidth="2"/>
              </svg>
              {/* Click Ripple Effect */}
              <div className="absolute inset-0 w-8 h-8 -left-1 -top-1 border-2 border-blue-500 rounded-full animate-ping opacity-75" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Viewport Footer/Status */}
      <div className="h-6 bg-zinc-900 border-t border-zinc-800/50 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">1920 x 1080</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Rendered via Playwright</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-zinc-400 font-medium tracking-tight">Operator: Gemini 3 Flash</span>
        </div>
      </div>
    </div>
  );
}
