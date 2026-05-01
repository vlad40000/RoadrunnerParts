import { listBomJobs } from "@/features/bom/services/job-store";
import { BomJobsTable } from "@/features/bom/components/bom-jobs-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BomJobsPage() {
  const jobs = await listBomJobs(100);

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">BOM Jobs</h1>
        <p className="text-sm text-neutral-500">
          Internal extraction history, retry, and CSV export.
        </p>
      </div>

      <BomJobsTable jobs={jobs} />
    </main>
  );
}

