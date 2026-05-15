import { NextResponse } from "next/server";
import { db } from "@/src/server/db";
import { applianceModels } from "@/src/server/db/schema/appliance-models";
import { providerAssemblySections, providerPartSeedRows } from "@/src/server/db/schema/provider-seeds";
import { eq, sql } from "drizzle-orm";
import { normalizeCanonicalModel } from "@/src/features/bom/services/source-tier-policy";

export const runtime = "nodejs";

type SourceTruthSection = {
  provider: string | null;
  sectionSeq: number | null;
  sectionLabelRaw: string | null;
  sectionNameClean: string;
  normalizedSection: string | null;
  sectionFamily: string | null;
  providerAssemblyUrl: string | null;
  diagramUrl: string | null;
  imageUrl: string | null;
  sourceStatus: string | null;
  sourceFile: string | null;
  sourceRow: number | null;
  sourceTable: "provider_assembly_sections" | "provider_part_seed_rows";
  sourceBackedPartCount: number;
};

function cleanSectionName(value: unknown) {
  return String(value || "").trim();
}

function normalizeSectionKey(value: unknown) {
  return cleanSectionName(value)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePartNumber(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

async function loadSourceTruth(normalizedModel: string) {
  const partModelWhere = sql`upper(regexp_replace(${providerPartSeedRows.model}, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}`;
  const sectionModelWhere = sql`upper(regexp_replace(${providerAssemblySections.model}, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}`;

  const [assemblyRows, partRows] = await Promise.all([
    db
      .select({
        provider: providerAssemblySections.provider,
        sectionSeq: providerAssemblySections.sectionSeq,
        sectionLabelRaw: providerAssemblySections.sectionLabelRaw,
        sectionNameClean: providerAssemblySections.sectionNameClean,
        normalizedSection: providerAssemblySections.normalizedSection,
        sectionFamily: providerAssemblySections.sectionFamily,
        providerAssemblyUrl: providerAssemblySections.providerAssemblyUrl,
        diagramUrl: providerAssemblySections.diagramUrl,
        imageUrl: providerAssemblySections.imageUrl,
        sourceStatus: providerAssemblySections.sourceStatus,
        sourceFile: providerAssemblySections.sourceFile,
        sourceRow: providerAssemblySections.sourceRow,
      })
      .from(providerAssemblySections)
      .where(sectionModelWhere)
      .orderBy(
        sql`coalesce(${providerAssemblySections.sectionSeq}, 999999)`,
        providerAssemblySections.sectionNameClean,
      ),
    db
      .select({
        provider: providerPartSeedRows.provider,
        providerModelUrl: providerPartSeedRows.providerModelUrl,
        providerAssemblyUrl: providerPartSeedRows.providerAssemblyUrl,
        diagramUrl: providerPartSeedRows.diagramUrl,
        sectionLabelRaw: providerPartSeedRows.sectionLabelRaw,
        sectionNameClean: providerPartSeedRows.sectionNameClean,
        normalizedSection: providerPartSeedRows.normalizedSection,
        sectionFamily: providerPartSeedRows.sectionFamily,
        diagramNumber: providerPartSeedRows.diagramNumber,
        originalPartNumber: providerPartSeedRows.originalPartNumber,
        currentServicePartNumber: providerPartSeedRows.currentServicePartNumber,
        sourceStatus: providerPartSeedRows.sourceStatus,
        sourceFile: providerPartSeedRows.sourceFile,
        sourceRow: providerPartSeedRows.sourceRow,
      })
      .from(providerPartSeedRows)
      .where(partModelWhere)
      .limit(10000),
  ]);

  const canonicalPartNumbers = new Set<string>();
  const partCountsBySection = new Map<string, number>();
  const fallbackSections = new Map<string, SourceTruthSection>();

  for (const row of partRows) {
    const partNumber = normalizePartNumber(row.currentServicePartNumber || row.originalPartNumber);
    if (partNumber) canonicalPartNumbers.add(partNumber);

    const sectionName = cleanSectionName(row.sectionNameClean || row.sectionLabelRaw || row.normalizedSection);
    const sectionKey = normalizeSectionKey(sectionName);
    if (!sectionKey) continue;

    if (partNumber) {
      partCountsBySection.set(sectionKey, (partCountsBySection.get(sectionKey) || 0) + 1);
    }

    if (!fallbackSections.has(sectionKey)) {
      fallbackSections.set(sectionKey, {
        provider: row.provider,
        sectionSeq: null,
        sectionLabelRaw: row.sectionLabelRaw,
        sectionNameClean: sectionName,
        normalizedSection: row.normalizedSection,
        sectionFamily: row.sectionFamily,
        providerAssemblyUrl: row.providerAssemblyUrl,
        diagramUrl: row.diagramUrl,
        imageUrl: null,
        sourceStatus: row.sourceStatus,
        sourceFile: row.sourceFile,
        sourceRow: row.sourceRow,
        sourceTable: "provider_part_seed_rows",
        sourceBackedPartCount: 0,
      });
    }
  }

  const assemblySections = assemblyRows.flatMap((row): SourceTruthSection[] => {
    const sectionName = cleanSectionName(row.sectionNameClean || row.sectionLabelRaw || row.normalizedSection);
    const sectionKey = normalizeSectionKey(sectionName);
    if (!sectionKey) return [];

    return [{
      provider: row.provider,
      sectionSeq: row.sectionSeq,
      sectionLabelRaw: row.sectionLabelRaw,
      sectionNameClean: sectionName,
      normalizedSection: row.normalizedSection,
      sectionFamily: row.sectionFamily,
      providerAssemblyUrl: row.providerAssemblyUrl,
      diagramUrl: row.diagramUrl,
      imageUrl: row.imageUrl,
      sourceStatus: row.sourceStatus,
      sourceFile: row.sourceFile,
      sourceRow: row.sourceRow,
      sourceTable: "provider_assembly_sections",
      sourceBackedPartCount: partCountsBySection.get(sectionKey) || 0,
    }];
  });

  const fallbackAssemblySections = Array.from(fallbackSections.values()).map((section) => ({
    ...section,
    sourceBackedPartCount: partCountsBySection.get(normalizeSectionKey(section.sectionNameClean)) || 0,
  }));

  const selectedSections = assemblySections.length > 0 ? assemblySections : fallbackAssemblySections;

  return {
    sectionSource: assemblySections.length > 0
      ? "provider_assembly_sections"
      : fallbackAssemblySections.length > 0
        ? "provider_part_seed_rows"
        : "none",
    assemblySections: selectedSections,
    sourceBackedCanonicalPartCount: canonicalPartNumbers.size,
    sourceBackedRowCount: partRows.length,
    hasProviderAssemblySections: assemblySections.length > 0,
    hasProviderPartRows: partRows.length > 0,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");

  if (!model) {
    return NextResponse.json({ error: "Model parameter is required" }, { status: 400 });
  }

  const normalized = normalizeCanonicalModel(model);

  try {
    const [existingRows, sourceTruth] = await Promise.all([
      db
        .select()
        .from(applianceModels)
        .where(eq(applianceModels.normalizedModel, normalized))
        .limit(1),
      loadSourceTruth(normalized),
    ]);

    const existing = existingRows[0];

    if (!existing) {
      if (!sourceTruth.hasProviderPartRows && !sourceTruth.hasProviderAssemblySections) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }

      const firstSection = sourceTruth.assemblySections[0];
      return NextResponse.json({
        normalizedModel: normalized,
        model,
        brand: null,
        applianceType: null,
        fuelType: null,
        source: sourceTruth.sectionSource,
        sourceStatus: firstSection?.sourceStatus || null,
        sourceFile: firstSection?.sourceFile || null,
        provider: firstSection?.provider || null,
        providerModelUrl: null,
        providerAssemblyUrl: firstSection?.providerAssemblyUrl || null,
        trustedTotalPartCount: null,
        trustedTotalCountSource: null,
        trustedTotalCountSourceUrl: null,
        trustedTotalCountCheckedAt: null,
        actualCanonicalPartCount: sourceTruth.sourceBackedCanonicalPartCount,
        actualPartCount: sourceTruth.sourceBackedRowCount,
        partsComplete: false,
        retrievalState: "parts_seeded_pricing_needed",
        diagramAssemblySections: sourceTruth.assemblySections,
        sourceTruth: {
          ...sourceTruth,
          expectedCountIsTrusted: false,
          expectedPartCount: null,
          currentSourceBackedPartCount: sourceTruth.sourceBackedCanonicalPartCount,
        },
      });
    }

    const trustedTotalPartCount = existing.trustedTotalPartCount ?? existing.expectedPartCount ?? null;

    return NextResponse.json({
      ...existing,
      trustedTotalPartCount,
      actualCanonicalPartCount: existing.actualCanonicalPartCount || sourceTruth.sourceBackedCanonicalPartCount,
      actualPartCount: existing.actualPartCount || sourceTruth.sourceBackedRowCount,
      diagramAssemblySections: sourceTruth.assemblySections,
      sourceTruth: {
        ...sourceTruth,
        expectedCountIsTrusted: typeof trustedTotalPartCount === "number" && trustedTotalPartCount > 0,
        expectedPartCount: trustedTotalPartCount,
        currentSourceBackedPartCount: sourceTruth.sourceBackedCanonicalPartCount,
        trustedTotalCountSource: existing.trustedTotalCountSource,
        trustedTotalCountSourceUrl: existing.trustedTotalCountSourceUrl,
        trustedTotalCountCheckedAt: existing.trustedTotalCountCheckedAt,
      },
    });
  } catch (error) {
    console.error("[Model Details API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
