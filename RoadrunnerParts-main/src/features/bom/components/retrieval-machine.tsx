"use client";

import { useState, useEffect } from "react";
import { 
  Globe, 
  Camera, 
  Layers, 
  FileText, 
  DollarSign, 
  CheckCircle, 
  ExternalLink,
  ChevronRight,
  Play,
  Loader2,
  AlertCircle
} from "lucide-react";
import { motion } from "motion/react";

type RetrievalMachineProps = {
  modelNumber: string;
  serialNumber?: string;
  onJobCreated?: (jobId: string) => void;
};

export function RetrievalMachine({ modelNumber, serialNumber }: RetrievalMachineProps) {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Poll for status
  useEffect(() => {
    if (!modelNumber) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/bom/model-details?model=${encodeURIComponent(modelNumber)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [modelNumber]);

  const triggerStep = async (step: string) => {
    setIsLoading(step);
    try {
      const res = await fetch("/api/bom/jobs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelNumber, serialNumber, step })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobId) setStatus((s: any) => ({ ...s, currentJobId: data.jobId }));
      }
    } finally {
      setIsLoading(null);
    }
  };

  const steps = [
    { id: "build_urls", label: "Build URLs", icon: Globe, description: "Resolve Encompass & Exploded View URLs" },
    { id: "capture_page", label: "Capture Page", icon: Camera, description: "Save HTML Evidence (Static/Rendered)" },
    { id: "extract_assemblies", label: "Extract Assemblies", icon: Layers, description: "Identify Schematic Groupings" },
    { id: "extract_bom", label: "Extract BOM", icon: FileText, description: "Map Part Numbers & Descriptions" },
    { id: "extract_pricing", label: "Extract Pricing", icon: DollarSign, description: "Capture Real Retail Prices" },
    { id: "validate_bom", label: "Validate BOM", icon: CheckCircle, description: "Audit Integrity & State Machine" },
  ];

  return (
    <div className="bg-neutral-900 text-white rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
      {/* 1. Header & Identity */}
      <div className="p-6 border-b border-neutral-800 bg-neutral-950/50">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Retrieval Machine Active
            </div>
            <h2 className="text-3xl font-black tracking-tight">{modelNumber}</h2>
            {serialNumber && <p className="text-neutral-500 font-mono text-sm mt-1">Serial: {serialNumber}</p>}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-neutral-500 font-bold uppercase mb-1">State</div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${status?.retrievalState === 'bom_complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {status?.retrievalState || "Queued"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50">
            <div className="text-[10px] text-neutral-500 font-bold uppercase mb-1">Assemblies</div>
            <div className="text-xl font-bold">{status?.assemblyCount || 0}</div>
          </div>
          <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50">
            <div className="text-[10px] text-neutral-500 font-bold uppercase mb-1">Parts Found</div>
            <div className="text-xl font-bold">{status?.actualPartCount || 0}</div>
          </div>
          <div className="bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50">
            <div className="text-[10px] text-neutral-500 font-bold uppercase mb-1">Priced Rows</div>
            <div className="text-xl font-bold text-blue-400">{status?.pricedPartCount || 0}</div>
          </div>
        </div>
      </div>

      {/* 2. Granular Controls */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step) => {
          const isDone = false; // Add logic based on status
          const Icon = step.icon;
          
          return (
            <button
              key={step.id}
              onClick={() => triggerStep(step.id)}
              disabled={isLoading !== null}
              className={`
                group relative flex items-center gap-4 p-4 rounded-xl border transition-all text-left
                ${isLoading === step.id ? 'bg-blue-600/20 border-blue-500/50' : 'bg-neutral-800/30 border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800/50'}
              `}
            >
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center transition-colors
                ${isLoading === step.id ? 'bg-blue-500 text-white' : 'bg-neutral-700 text-neutral-400 group-hover:text-white'}
              `}>
                {isLoading === step.id ? <Loader2 size={24} className="animate-spin" /> : <Icon size={24} />}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{step.label}</div>
                <div className="text-[10px] text-neutral-500 line-clamp-1">{step.description}</div>
              </div>
              <ChevronRight size={18} className="text-neutral-600 group-hover:text-white transition-colors" />
            </button>
          );
        })}
      </div>

      {/* 3. Deep Evidence Links */}
      <div className="px-6 py-4 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between">
        <div className="flex gap-4">
          <a href="#" className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 hover:text-white transition-colors">
            <Globe size={14} /> Regular URL <ExternalLink size={10} />
          </a>
          <a href="#" className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 hover:text-white transition-colors">
            <Layers size={14} /> Exploded View <ExternalLink size={10} />
          </a>
        </div>
        <div className="text-[10px] font-mono text-neutral-600">
          Capture Hub: /captures/{modelNumber}/
        </div>
      </div>
    </div>
  );
}
