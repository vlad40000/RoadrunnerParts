import React from "react";

interface Job {
  id: string;
  modelNumber: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export function RetrievalStatusTable({ jobs }: { jobs: Job[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Model</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Started</th>
            <th className="px-3 py-2">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="px-3 py-2 font-medium">{job.modelNumber}</td>
              <td className="px-3 py-2">
                <span
                  className={[
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    job.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : job.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : job.status === "blocked"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700",
                  ].join(" ")}
                >
                  {job.status}
                </span>
              </td>
              <td className="px-3 py-2">{job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : "-"}</td>
              <td className="px-3 py-2">
                {job.finishedAt && job.startedAt 
                  ? `${Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s` 
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
