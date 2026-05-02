"use client";

import { useEffect, useState } from "react";
import { EncompassSupervisorPanel } from "@/src/features/bom/components/encompass-supervisor-panel";
import { SupplierAgentMatrix } from "@/src/features/bom/components/supplier-agent-matrix";
import { ArrowRight, Settings, ShieldCheck } from "lucide-react";

export default function BomIngestPage() {
  const [model, setModel] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [truth, setTruth] = useState<any>(null);

  useEffect(() => {
    const normalized = model.trim().toUpperCase();
    if (!normalized) {
      setJobId(null);
      setTruth(null);
      return;
    }

    const timer = setTimeout(async () => {
      const res = await fetch("/api/bom/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: normalized }),
      });
      const data = await res.json();
      if (data?.job?.id) {
        setJobId(data.job.id);
        const truthRes = await fetch(`/api/bom/jobs/${data.job.id}/visual-truth`);
        const truthData = await truthRes.json();
        setTruth(truthData.visualTruth || null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [model]);

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">UI Control Panel</h1>
          <p className="text-neutral-500 text-sm mt-1">
            BOM Ingestion Pipeline: Establish Visual Truth before extraction.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Input & Configuration */}
        <div className="md:col-span-1 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                1. Entry & Identification
              </label>
              <input
                type="text"
                placeholder="Enter Model Number (e.g. GTDX180ED3WW)"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all font-mono uppercase"
              />
            </div>

            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-3">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs uppercase">
                <ShieldCheck size={14} /> Pipeline Rules
              </div>
              <ul className="text-xs text-blue-600 space-y-2">
                <li className="flex gap-2">
                  <ArrowRight size={12} className="shrink-0 mt-0.5" />
                  Encompass is the Visual Supervisor
                </li>
                <li className="flex gap-2">
                  <ArrowRight size={12} className="shrink-0 mt-0.5" />
                  Capture Overview before running agents
                </li>
                <li className="flex gap-2">
                  <ArrowRight size={12} className="shrink-0 mt-0.5" />
                  Supplier agents act as witnesses
                </li>
              </ul>
            </div>
          </div>

          <SupplierAgentMatrix jobId={jobId} model={model} truth={truth} />
        </div>

        {/* Right Column: Supervisor Panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Establish Visual Truth
            </label>
            <EncompassSupervisorPanel 
              jobId={jobId}
              model={model} 
              onTruthCaptured={(data) => setTruth(data)}
            />
          </div>

          {truth && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-100">
               <div className="flex items-center gap-3">
                 <div>
                   <div className="text-sm font-bold text-emerald-900">Visual Truth Locked</div>
                   <div className="text-xs text-emerald-700">{truth.assemblyNames.length} assemblies ready for reconciliation.</div>
                 </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
