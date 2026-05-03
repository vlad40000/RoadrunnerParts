"use client";

import React, { useMemo } from "react";
import { buildEncompassUrls } from "@/lib/encompass-routes";

type EncompassUrlPanelProps = {
  modelNumber: string;
  serialNumber?: string;
};

export function EncompassUrlPanel({
  modelNumber,
  serialNumber,
}: EncompassUrlPanelProps) {
  const resolved = useMemo(
    () => buildEncompassUrls(modelNumber),
    [modelNumber]
  );

  const openUrl = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!modelNumber) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Model
          </div>
          <div className="font-mono text-sm font-bold text-slate-900">
            {resolved.model || "N/A"}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Serial
          </div>
          <div className="font-mono text-sm font-bold text-slate-900">
            {serialNumber || "N/A"}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Resolved Brand
          </div>
          <div className="font-mono text-sm font-bold text-slate-900">
            {resolved.brand || "Unresolved"}
          </div>
        </div>
      </div>

      {resolved.error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {resolved.error}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <input
            readOnly
            value={resolved.regularModelUrl}
            placeholder="Regular Encompass model URL"
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 focus:outline-none"
          />
          <button
            type="button"
            disabled={!resolved.regularModelUrl}
            onClick={() => openUrl(resolved.regularModelUrl)}
            className="h-11 rounded-lg bg-slate-950 px-4 text-xs font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Model Page
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <input
            readOnly
            value={resolved.explodedViewUrl}
            placeholder="Encompass exploded-view URL"
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 focus:outline-none"
          />
          <button
            type="button"
            disabled={!resolved.explodedViewUrl}
            onClick={() => openUrl(resolved.explodedViewUrl)}
            className="h-11 rounded-lg bg-blue-700 px-4 text-xs font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Exploded View
          </button>
        </div>
      </div>
    </section>
  );
}
