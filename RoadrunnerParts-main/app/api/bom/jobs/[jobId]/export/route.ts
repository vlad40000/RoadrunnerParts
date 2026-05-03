import { NextRequest, NextResponse } from "next/server";
import { getBomJob } from "@/src/features/bom/services/job-store";
import { bomRowsToCsv } from "@/src/features/bom/services/csv-export";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "BOM job not found" },
      { status: 404 },
    );
  }

  const selectedSections = req.nextUrl.searchParams
    .getAll("section")
    .map((value) => cleanText(value))
    .filter(Boolean);

  const searchQuery = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const selectedRowIds = req.nextUrl.searchParams.getAll("part");

  const wanted = new Set(selectedSections.map((value) => value.toLowerCase()));

  const rows = job.finalRows.filter((row: any) => {
    if (selectedRowIds.length > 0) {
      return (
        selectedRowIds.includes(row.currentServicePartNumber) ||
        selectedRowIds.includes(row.originalPartNumber)
      );
    }

    const matchesSection =
      wanted.size === 0 || wanted.has(cleanText(row.section).toLowerCase());
      
    const matchesSearch =
      !searchQuery ||
      (row.description?.toLowerCase().includes(searchQuery) ||
        (row.currentServicePartNumber || "").toLowerCase().includes(searchQuery) ||
        (row.originalPartNumber || "").toLowerCase().includes(searchQuery));

    return matchesSection && matchesSearch;
  });

  const csv = bomRowsToCsv(rows as any);

  const safeModel = cleanText(job.model || "UnknownModel").replace(/[^A-Za-z0-9._-]+/g, "_");
  const filename = `${safeModel}_BOM.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
