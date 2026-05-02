import { NextRequest, NextResponse } from "next/server";
import { getBomJob, saveBomArtifacts } from "@/src/features/bom/services/job-store";
import { enrichBomRowsWithRetailPricing } from "@/src/features/bom/services/retail-pricing";
import { bomRowSchema, type BomRow } from "@/src/features/bom/schemas/bom";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function rowKey(row: BomRow) {
  return [
    cleanText(row.section).toLowerCase(),
    cleanText(row.currentServicePartNumber || row.originalPartNumber).toLowerCase(),
    cleanText(String(row.diagramNumber ?? "")).toLowerCase(),
    cleanText(row.description).toLowerCase(),
  ].join("|");
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function parseBomRows(rows: unknown): BomRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => bomRowSchema.parse(row));
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const body = await req.json();

    const selectedSections = Array.isArray(body.selectedSections)
      ? body.selectedSections.map((value: string) => cleanText(value)).filter(Boolean)
      : [];

    const searchQuery = typeof body.searchQuery === 'string' ? body.searchQuery.trim().toLowerCase() : '';
    const selectedRowIds = Array.isArray(body.selectedRowIds) ? body.selectedRowIds : [];

    const job = await getBomJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: "BOM job not found" },
        { status: 404 },
      );
    }

    const allRows = parseBomRows(job.finalRows);
    const totalRowCount = allRows.length;
    const wantedSections = new Set(selectedSections.map((value: string) => value.toLowerCase()));

    const filteredRows = allRows.filter((row) => {
      // Manual selection takes priority
      if (selectedRowIds.length > 0) {
        return selectedRowIds.includes(row.currentServicePartNumber) || selectedRowIds.includes(row.originalPartNumber);
      }

      // Filter by section and search query
      const matchesSection = selectedSections.length === 0 || wantedSections.has(cleanText(row.section).toLowerCase());
      const matchesSearch = !searchQuery || (
        row.description?.toLowerCase().includes(searchQuery) ||
        (row.currentServicePartNumber || "").toLowerCase().includes(searchQuery) ||
        (row.originalPartNumber || "").toLowerCase().includes(searchQuery)
      );

      return matchesSection && matchesSearch;
    });

    if (filteredRows.length === 0) {
      return NextResponse.json(
        { error: "Narrowing yielded 0 rows. Adjust filters or search to enable pricing." },
        { status: 400 },
      );
    }

    const { enrichBomRowsWithRetailPricing } = await import("@/src/features/bom/services/retail-pricing");
    const pricingResults = await enrichBomRowsWithRetailPricing({
      brand: job.brand,
      model: job.model,
      rows: filteredRows,
      maxTargetedLookups: Math.min(filteredRows.length, 24),
    });

    const pricingMap = new Map();
    pricingResults.rows.forEach(r => {
      const pn = r.currentServicePartNumber || r.originalPartNumber;
      if (pn) pricingMap.set(pn, r);
    });

    const mergedRows = allRows.map((row) => {
      const partNumber = row.currentServicePartNumber || row.originalPartNumber;
      if (!partNumber) return row;
      const snapshot = pricingMap.get(partNumber);
      if (!snapshot) return row;

      return {
        ...row,
        retailPrice: snapshot.retailPrice,
        retailPriceText: snapshot.retailPriceText,
        retailAvailability: snapshot.retailAvailability,
        retailPricingUrl: snapshot.retailPricingUrl,
        retailPriceSource: snapshot.retailPriceSource,
        retailPriceVerified: snapshot.retailPriceVerified,
        retailPricedAt: snapshot.retailPricedAt,
      };
    });

    const pricedRowCount = pricingResults.pricedRowCount;
    const pricedSubsetRows = mergedRows.filter(r => {
      const pn = r.currentServicePartNumber || r.originalPartNumber;
      return pn && pricingMap.has(pn) && typeof pricingMap.get(pn).retailPrice === 'number';
    });

    const issues = unique([
      ...(Array.isArray(job.issues) ? job.issues : []),
      ...pricingResults.issues,
    ]);

    await saveBomArtifacts(jobId, {
      finalRows: mergedRows as any,
      issues: issues,
    });

    return NextResponse.json({
      ok: true,
      selectedSections,
      filteredRowCount: filteredRows.length,
      pricedRowCount: pricedRowCount,
      pricedSubsetRows: pricedSubsetRows,
      rows: mergedRows,
      issues: issues,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Filtered pricing failed";

    return NextResponse.json(
      { error: "Filtered pricing failed.", detail: message },
      { status: 500 },
    );
  }
}
