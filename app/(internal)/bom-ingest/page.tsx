"use client";

import { useState } from "react";
import { EncompassSupervisorPanel } from "@/src/features/bom/components/encompass-supervisor-panel";
import { SupplierAgentMatrix } from "@/src/features/bom/components/supplier-agent-matrix";
import { ArrowRight, Settings, ShieldCheck, Database } from "lucide-react";

export default function BomIngestPage() {
  const [model, setModel] = useState("");
  const [truth, setTruth] = useState<any>(null);

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

          <SupplierAgentMatrix model={model} truth={truth} />
        </div>

        {/* Right Column: Supervisor Panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Establish Visual Truth
            </label>
            <EncompassSupervisorPanel 
              model={model} 
              onTruthCaptured={(data) => setTruth(data)}
            />
          </div>

          {truth && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-100">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                   <Database size={16} />
                 </div>
                 <div>
                   <div className="text-sm font-bold text-emerald-900">Visual Truth Locked</div>
                   <div className="text-xs text-emerald-700">{truth.assemblyNames.length} assemblies ready for reconciliation.</div>
                 </div>
               </div>
               <button className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors shadow-sm">
                 Run Supplier Agents
               </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
