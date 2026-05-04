"use client";

import { ExternalLink, Image as ImageIcon, ListChecks } from "lucide-react";

type EncompassSourceSummaryProps = {
  model: string;
  truth?: Record<string, unknown> | null;
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function EncompassEvidenceSummary({ model, truth }: EncompassSourceSummaryProps) {
  const canonUrl = text(truth?.canonUrl);
  const expectedTotal = text(truth?.expectedTotal);
  const assemblyNames = arrayValue(truth?.assemblyNames);
  const screenshot =
    text(truth?.storedImageUrl) ||
    (text(truth?.base64) ? `data:image/png;base64,${text(truth?.base64)}` : "") ||
    text(truth?.screenshotBase64);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-blue-600" />
          <div>
            <div className="text-sm font-black uppercase tracking-wide text-neutral-800">
              Visual Source Summary
            </div>
            <div className="font-mono text-[10px] font-bold text-neutral-400">
              {model || "No model loaded"}
            </div>
          </div>
        </div>
        {canonUrl ? (
          <a
            href={canonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700 hover:bg-blue-100"
          >
            Canon URL
            <ExternalLink size={12} />
          </a>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="aspect-video overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {screenshot ? (
            <img
              src={screenshot.startsWith("data:") ? screenshot : `data:image/png;base64,${screenshot}`}
              alt="Captured source screenshot"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
              <ImageIcon size={28} className="opacity-40" />
              <div className="text-[10px] font-black uppercase tracking-widest">
                No persisted screenshot
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Canonical URL
            </div>
            <div className="mt-1 break-all font-mono text-xs text-neutral-800">
              {canonUrl || "Waiting for captured provider URL"}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Expected Total
              </div>
              <div className="mt-1 text-lg font-black text-neutral-900">
                {expectedTotal || "---"}
              </div>
            </div>
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Assemblies
              </div>
              <div className="mt-1 text-lg font-black text-neutral-900">
                {assemblyNames.length}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              <ListChecks size={12} />
              Assembly Names
            </div>
            <div className="max-h-36 overflow-auto text-xs font-semibold text-neutral-700">
              {assemblyNames.length ? assemblyNames.join(", ") : "Waiting for assembly capture"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
