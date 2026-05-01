"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBomStatusMeta } from "../core/bom-status";

type BomJobRow = {
  id: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  jobStage: string;
  resultStatus: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  productType: string | null;
  coverageScore: number;
  rawRowCount: number;
  uniqueRowCount: number;
  expectedPartsTotal: number | null;
  actualUniqueParts: number | null;
  coveragePct: number | null;
  issues: string[];
  errorText: string | null;
  retrievalState: string | null;
  expectedPartCount: number | null;
  actualPartCount: number | null;
  requiredPriceCount: number | null;
  verifiedPriceCount: number | null;
  unpricedCount: number | null;
  bomComplete: boolean | null;
  partsComplete: boolean | null;
  pricingComplete: boolean | null;
};

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function toneClasses(tone: "neutral" | "red" | "amber" | "green") {
  if (tone === "green") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (tone === "red") {
    return "bg-red-50 text-red-700 border-red-100";
  }
  if (tone === "amber") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  return "bg-neutral-50 text-neutral-700 border-neutral-100";
}

function getJobIssueText(job: BomJobRow) {
  if (job.errorText) return job.errorText;

  if (job.issues?.length) return null;

  if (job.uniqueRowCount > 0) return null;

  if (["uploaded", "extracting_identity", "identity_review", "discovering_diagram_groups", "group_ready", "extracting_group", "awaiting_next_group"].includes(job.jobStage)) {
    return "Job is still in progress. Zero-row messaging is suppressed until extraction is actually complete.";
  }

  if (job.jobStage === "complete") {
    return "Sources were retrieved, but zero accepted BOM rows were extracted.";
  }

  return null;
}

function ReasonModal({ 
  job, 
  onClose 
}: { 
  job: BomJobRow; 
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">BOM Completion Reasons</h2>
          <button 
            onClick={onClose}
            className="rounded-full p-1 hover:bg-neutral-100 text-neutral-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 p-3 border border-neutral-100">
            <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-1">State Machine Status</div>
            <div className="font-mono text-sm font-bold text-neutral-800">{job.retrievalState || "unknown"}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-neutral-100 p-3">
              <div className="text-xs text-neutral-500 mb-1">Parts Coverage</div>
              <div className="text-lg font-bold">
                {job.actualPartCount ?? 0} / {job.expectedPartCount ?? "?"}
              </div>
              <div className="text-[10px] text-neutral-400">
                {job.partsComplete ? "✓ Complete" : "⚠ Incomplete"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-100 p-3">
              <div className="text-xs text-neutral-500 mb-1">Verified Pricing</div>
              <div className="text-lg font-bold">
                {job.verifiedPriceCount ?? 0} / {job.actualPartCount ?? 0}
              </div>
              <div className="text-[10px] text-neutral-400">
                {job.pricingComplete ? "✓ Complete" : "⚠ Missing Prices"}
              </div>
            </div>
          </div>

          {job.issues?.length ? (
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Detected Issues</div>
              <ul className="space-y-1.5">
                {job.issues.map((issue, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-neutral-700 bg-red-50/50 p-2 rounded border border-red-100/50">
                    <span className="text-red-500 mt-1">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-sm text-neutral-500 italic bg-emerald-50/30 p-3 rounded border border-emerald-100/30 text-center">
              No specific extraction issues found.
            </div>
          )}

          {!job.bomComplete && !job.pricingComplete && job.partsComplete && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
              <strong>Note:</strong> All parts were found, but verified retail pricing is required for BOM completion.
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-neutral-900 py-2.5 font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function BomJobsTable({ jobs }: { jobs: BomJobRow[] }) {
  const router = useRouter();
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BomJobRow | null>(null);

  async function handleRetry(jobId: string) {
    try {
      setRetryingJobId(jobId);

      const res = await fetch(`/api/bom/jobs/${jobId}/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userHints: {},
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Retry failed");
      }

      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Retry failed";
      window.alert(message);
    } finally {
      setRetryingJobId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr className="border-b border-neutral-200">
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Brand</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Raw</th>
            <th className="px-3 py-2 font-medium text-center">Target</th>
            <th className="px-3 py-2 font-medium text-center">Unique</th>
            <th className="px-3 py-2 font-medium text-center">Coverage</th>
            <th className="px-3 py-2 font-medium">Issues</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => {
            const canExport = job.uniqueRowCount > 0;
            const statusMeta = getBomStatusMeta(
              job.resultStatus,
              job.uniqueRowCount,
            );

            return (
              <tr key={job.id} className="border-b border-neutral-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div>{formatDate(job.createdAt)}</div>
                  <div className="text-xs text-neutral-500">{job.id}</div>
                </td>

                <td className="px-3 py-2">
                  <div className="font-medium">{job.model || "-"}</div>
                  {job.serial ? (
                    <div className="text-xs text-neutral-500">{job.serial}</div>
                  ) : null}
                </td>

                <td className="px-3 py-2">{job.brand || "-"}</td>
                <td className="px-3 py-2">{job.productType || "-"}</td>
                <td className="px-3 py-2">{job.jobStage}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses(statusMeta.tone)}`}
                    >
                      {statusMeta.label}
                    </span>
                    <button 
                      onClick={() => setSelectedJob(job)}
                      className="p-1 text-neutral-400 hover:text-neutral-600 rounded hover:bg-neutral-100 transition-colors"
                      title="View completion details"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {job.rawRowCount}
                </td>
                <td className="px-3 py-2 text-center font-bold text-neutral-400">
                  {job.expectedPartsTotal ?? "-"}
                </td>
                <td className="px-3 py-2 text-center font-bold">
                  {job.uniqueRowCount}
                </td>
                <td className="px-3 py-2 text-center">
                  {job.expectedPartsTotal ? (
                    <div className="flex flex-col items-center">
                      <div className={`font-bold ${(job.coveragePct ?? 0) >= 0.9 ? 'text-emerald-600' : (job.coveragePct ?? 0) < 0.75 ? 'text-amber-600' : 'text-blue-600'}`}>
                        {((job.coveragePct ?? 0) * 100).toFixed(0)}%
                      </div>
                      <div className="w-12 h-1 bg-neutral-100 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${(job.coveragePct ?? 0) >= 0.9 ? 'bg-emerald-500' : (job.coveragePct ?? 0) < 0.75 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, (job.coveragePct ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-neutral-400 italic">No Target</div>
                  )}
                </td>

                <td className="px-3 py-2">
                  {getJobIssueText(job) ? (
                    <div className={`max-w-xs text-xs ${job.errorText || job.jobStage === "complete" ? "text-red-600" : "text-neutral-500"}`}>
                      {getJobIssueText(job)}
                    </div>
                  ) : job.issues?.length ? (
                    <ul className="max-w-xs list-disc pl-4 text-xs text-neutral-600">
                      {job.issues.slice(0, 3).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-neutral-500">-</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  <JobActions jobId={job.id} canExport={canExport} />
                </td>
              </tr>
            );
          })}

          {jobs.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-8 text-center text-sm text-neutral-500"
              >
                No BOM jobs yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {selectedJob && (
        <ReasonModal 
          job={selectedJob} 
          onClose={() => setSelectedJob(null)} 
        />
      )}
    </div>
  );
}

function JobActions({
  jobId,
  canExport,
}: {
  jobId: string;
  canExport: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "recover" | null>(null);

  async function runAction(kind: "retry" | "recover") {
    try {
      setBusy(kind);

      const url =
        kind === "retry"
          ? `/api/bom/jobs/${jobId}/retry`
          : `/api/bom/jobs/${jobId}/recover`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `${kind} failed`);
      }

      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${kind} failed`;
      window.alert(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => runAction("recover")}
        disabled={busy !== null}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-left hover:bg-neutral-50 disabled:opacity-50 text-neutral-900"
      >
        {busy === "recover" ? "Recovering..." : "Recover Missing"}
      </button>

      <button
        type="button"
        onClick={() => runAction("retry")}
        disabled={busy !== null}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-left hover:bg-neutral-50 disabled:opacity-50 text-neutral-900"
      >
        {busy === "retry" ? "Retrying..." : "Full Retry"}
      </button>

      {canExport ? (
        <a
          href={`/api/bom/jobs/${jobId}/export`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 text-neutral-900 text-center"
        >
          Export CSV
        </a>
      ) : (
        <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-400 text-center">
          Export CSV
        </span>
      )}
    </div>
  );
}
