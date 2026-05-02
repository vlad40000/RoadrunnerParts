import { NextRequest, NextResponse } from "next/server";
import {
  getBomJob,
  getBomSupplierRun,
  saveBomSupplierRunInput,
} from "@/features/bom/services/job-store";

type Params = { params: Promise<{ jobId: string; supplierId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { jobId, supplierId } = await params;
  const body = await req.json();
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (!String(job.model || "").trim()) {
    return NextResponse.json({ ok: false, error: "Persisted model is required before supplier runs." }, { status: 400 });
  }

  const persistedInput = {
    task: String(body.task || "load_supplier_index"),
    tierKey: String(body.tierKey || "tier0"),
    supplierId,
    supplier: String(body.supplier || supplierId),
    sourceUrl: String(body.sourceUrl || body.searchUrl || "").trim(),
    searchUrl: String(body.searchUrl || body.sourceUrl || "").trim(),
    includeDiagram: body.includeDiagram !== false,
    includeExpectedCount: body.includeExpectedCount !== false,
    canonUrlUsed: body.canonUrl || null,
    diagramImageUrlUsed: body.diagramImageUrl || null,
    expectedTotalUsed:
      typeof body.expectedTotal === "number" ? body.expectedTotal : null,
    assemblyNamesUsed: Array.isArray(body.assemblyNames) ? body.assemblyNames : [],
    normalizedModel: String(job.model || ""),
    promptVersion: body.promptVersion || "manual-source-ui-v1",
    functionVersion: body.functionVersion || "supplier-run-route-v1",
    status: "input_saved",
    updatedAt: new Date().toISOString(),
  };

  await saveBomSupplierRunInput(jobId, supplierId, persistedInput);
  return NextResponse.json({ ok: true, supplierRun: await getBomSupplierRun(jobId, supplierId) });
}
