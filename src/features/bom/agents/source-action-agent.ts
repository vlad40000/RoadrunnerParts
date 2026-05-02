import "server-only";

import {
  getBomJob,
  saveBomArtifacts,
  setBomJobStage,
  updateBomJobSummary,
} from "@/features/bom/services/job-store";
import { runPartsExtractor } from "@/features/bom/agents/parts-extractor";
import { enrichBomRowsWithRetailPricing } from "@/features/bom/services/retail-pricing";
import {
  supplierIndexKey,
  type ManualSourceActionTask,
  type SupplierAssemblyIndex,
  type SupplierAssemblyIndexItem,
} from "@/features/bom/services/source-tier-policy";
import { resolveEncompassExplodedViewUrl } from "@/features/bom/services/encompass-model-index";
import {
  buildSupplierIndexFromHtml,
  fetchExactSupplierUrl,
  htmlToReadableText,
  mergeRowsByPartNumber,
  selectedExpectedCount,
} from "@/features/bom/services/manual-source-utils";
import {
  extractSearsCatalogPayload,
  parseSearsCatalogModel,
  parseSearsCatalogDiagrams,
  parseSearsCatalogParts,
} from "@/features/bom/services/providers/sears-catalog-adapter";
import { validate_bom_completion } from "@/features/bom/core/bom-validator";

type SelectedAssemblyInput = {
  id?: string;
  title: string;
  sourceUrl: string;
  supplierCount?: number | null;
  overrideCount?: number | null;
};

type SourceActionInput = {
  jobId: string;
  task: ManualSourceActionTask;
  tierKey: string;
  supplier: string;
  canonicalModel: string;
  formattedModel?: string;
  searchUrl?: string;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
  selectedAssemblies?: SelectedAssemblyInput[];
  pricingSource?: string | null;
};

function assertNonEmpty(value: string | null | undefined, message: string) {
  if (!String(value || "").trim()) throw new Error(message);
}

function getExistingDiagramParse(job: Awaited<ReturnType<typeof getBomJob>>) {
  return ((job?.diagramParse as Record<string, any>) || {}) as Record<string, any>;
}

function updateSupplierIndexInDiagramParse(input: {
  diagramParse: Record<string, any>;
  supplierIndex: SupplierAssemblyIndex;
}) {
  const key = supplierIndexKey(
    input.supplierIndex.supplier,
    input.supplierIndex.canonicalModel,
  );

  return {
    ...input.diagramParse,
    supplierIndexes: {
      ...(input.diagramParse.supplierIndexes || {}),
      [key]: input.supplierIndex,
    },
    activeSupplierIndexKey: key,
    activeSupplierIndex: input.supplierIndex,
  };
}

function mapPricingTaskToSource(
  task: ManualSourceActionTask,
  inputPricingSource?: string | null,
) {
  if (inputPricingSource) return inputPricingSource;

  if (task === "price_encompass") return "encompass-family";
  if (task === "price_backup_1") return "partsdr";
  if (task === "price_backup_2") return "appliancepartspros";

  return null;
}

function countPricedRows(rows: Array<Record<string, any>>) {
  return rows.filter(
    (row) =>
      row.retailPriceVerified === true &&
      row.retailPrice !== null &&
      row.retailPrice !== undefined,
  ).length;
}

function checkPricedRows(rows: Array<Record<string, any>>) {
  return rows.filter(
    (row) =>
      (row.price !== null && row.price !== undefined && row.price > 0) ||
      (row.retailPrice !== null && row.retailPrice !== undefined && row.retailPrice > 0),
  ).length;
}

export async function runSourceActionAgent(input: SourceActionInput) {
  const job = await getBomJob(input.jobId);
  if (!job) throw new Error("BOM job not found");

  assertNonEmpty(input.canonicalModel, "Canonical model is required.");
  assertNonEmpty(input.supplier, "Supplier is required.");

  const formattedModel = input.formattedModel || input.canonicalModel;
  const searchUrl = input.searchUrl || "";
  const isEncompass = input.supplier === "encompass-family";

  async function resolveSupplierUrl() {
    if (!isEncompass) {
      if (!searchUrl) throw new Error("Supplier search URL is required.");
      return searchUrl;
    }

    const resolution = await resolveEncompassExplodedViewUrl({
      model: input.canonicalModel,
      routeHint: input.brand?.toUpperCase().includes("HOT") ? "HOT" : "WHI",
    });

    if (!resolution.selected?.url) {
      throw new Error("No Encompass indexed URL found. Try another supplier or manual URL.");
    }

    return resolution.selected.url;
  }

  // --- SEARS SPECIALIZED TASKS ---
  if (input.task === ("sears_resolve" as any)) {
    const resolvedSearchUrl = await resolveSupplierUrl();
    await setBomJobStage(input.jobId, "sears_resolving");

    const fetched = await fetchExactSupplierUrl(resolvedSearchUrl);
    const payload = extractSearsCatalogPayload(fetched.html);
    if (!payload) throw new Error("No Sears CATALOG_API_RESPONSE found. Use Load Index fallback.");

    const catalogModel = parseSearsCatalogModel(payload);
    if (!catalogModel) throw new Error("Failed to parse Sears model resolution payload.");

    await updateBomJobSummary(input.jobId, {
      jobStage: "sears_resolved",
      brand: catalogModel.brand || input.brand,
      model: catalogModel.modelNumber || input.canonicalModel,
      expectedPartsTotal: catalogModel.partCount || null,
      truthSource: fetched.finalUrl,
    });

    return { status: "sears_resolved", catalogModel };
  }

  if (input.task === ("sears_diagrams" as any)) {
    const resolvedSearchUrl = await resolveSupplierUrl();
    await setBomJobStage(input.jobId, "sears_diagrams_loading");

    const fetched = await fetchExactSupplierUrl(resolvedSearchUrl);
    const payload = extractSearsCatalogPayload(fetched.html);
    if (!payload) throw new Error("No Sears CATALOG_API_RESPONSE found.");

    const diagrams = parseSearsCatalogDiagrams(payload);
    const supplierIndex: SupplierAssemblyIndex = {
      supplier: "sears-partsdirect",
      canonicalModel: input.canonicalModel,
      formattedModel: input.formattedModel || input.canonicalModel,
      sourceUrl: resolvedSearchUrl,
      totalCount: payload.model?.partCount || null,
      totalCountEvidence: "CATALOG_API_RESPONSE",
      totalCountSourceUrl: fetched.finalUrl,
      loadedAt: new Date().toISOString(),
      assemblies: diagrams.map(d => ({
        id: d.id,
        title: d.title,
        sourceUrl: d.sourceUrl || resolvedSearchUrl,
        supplierCount: null,
        countEvidence: null,
        selected: false,
        overrideCount: null,
        status: "pending",
        actualCount: 0
      }))
    };

    const diagramParse = getExistingDiagramParse(job);
    const nextDiagramParse = updateSupplierIndexInDiagramParse({ diagramParse, supplierIndex });

    await saveBomArtifacts(input.jobId, { diagramParse: nextDiagramParse });
    await updateBomJobSummary(input.jobId, { jobStage: "sears_diagrams_loaded" });

    return { status: "sears_diagrams_loaded", supplierIndex };
  }

  if (input.task === ("sears_parts" as any)) {
    const resolvedSearchUrl = await resolveSupplierUrl();
    await setBomJobStage(input.jobId, "sears_parts_extracting");

    const fetched = await fetchExactSupplierUrl(resolvedSearchUrl);
    const payload = extractSearsCatalogPayload(fetched.html);
    if (!payload) throw new Error("No Sears CATALOG_API_RESPONSE found.");

    const catalogParts = parseSearsCatalogParts(payload);
    const extractedRows = catalogParts.map(p => ({
      section: "All Model Parts",
      diagramNumber: p.diagramNumber,
      description: p.description,
      originalPartNumber: p.originalPartNumber,
      currentServicePartNumber: p.currentServicePartNumber,
      price: p.price,
      retailPrice: p.price,
      retailPriceVerified: p.price !== null,
      priceSource: "searspartsdirect.com",
      sourceUrl: fetched.finalUrl,
      sourceType: "distributor",
      supplier: "sears-partsdirect",
    }));

    const existingRows = Array.isArray(job.finalRows) ? (job.finalRows as any[]) : [];
    const mergedRows = mergeRowsByPartNumber(existingRows, extractedRows);

    const pricedCount = checkPricedRows(mergedRows);
    const pricingComplete = pricedCount > 0 && pricedCount >= mergedRows.length;

    await saveBomArtifacts(input.jobId, { finalRows: mergedRows });
    await updateBomJobSummary(input.jobId, {
      jobStage: "sears_parts_extracted",
      actualPartCount: mergedRows.length,
      verifiedPriceCount: pricedCount,
      pricingComplete
    });

    return { status: "sears_parts_extracted", rowCount: mergedRows.length, pricedCount };
  }

  if (input.task === "lock_supplier_target") {
    const resolvedSearchUrl = await resolveSupplierUrl();

    await setBomJobStage(input.jobId, "supplier_target_locked");

    const diagramParse = getExistingDiagramParse(job);

    const supplierTarget = {
      mode: "manual_distributor_control",
      supplier: input.supplier,
      tierKey: input.tierKey,
      canonicalModel: input.canonicalModel,
      formattedModel,
      searchUrl: resolvedSearchUrl,
      lockedAt: new Date().toISOString(),
      nextAction: "load_supplier_index",
    };

    await saveBomArtifacts(input.jobId, {
      diagramParse: {
        ...diagramParse,
        supplierTarget,
      },
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "supplier_target_locked",
      retrievalState: "summary_only",
      brand: input.brand ?? job.brand,
      model: input.canonicalModel,
      serial: input.serial ?? job.serial,
      productType: input.productType ?? job.productType,
      truthSource: resolvedSearchUrl,
      sourceStrategy: `manual-distributor-control:${input.tierKey}:${input.supplier}:lock_supplier_target`,
      bomComplete: false,
    });

    return {
      status: "supplier_target_locked",
      supplierTarget,
    };
  }

  if (input.task === "load_supplier_index") {
    const resolvedSearchUrl = await resolveSupplierUrl();

    await setBomJobStage(input.jobId, "supplier_index_loading");

    const fetched = await fetchExactSupplierUrl(resolvedSearchUrl);

    const supplierIndex = buildSupplierIndexFromHtml({
      supplier: input.supplier,
      canonicalModel: input.canonicalModel,
      formattedModel,
      sourceUrl: resolvedSearchUrl,
      finalUrl: fetched.finalUrl,
      html: fetched.html,
      text: fetched.text,
    });

    const diagramParse = getExistingDiagramParse(job);
    const nextDiagramParse = updateSupplierIndexInDiagramParse({
      diagramParse,
      supplierIndex,
    });

    const expectedTotal =
      (supplierIndex.totalCount ??
        selectedExpectedCount(
          supplierIndex.assemblies.map((item) => ({ ...item, selected: true })),
        )) ||
      null;

    await saveBomArtifacts(input.jobId, {
      diagramParse: nextDiagramParse,
      retrievedSources: [
        ...(Array.isArray(job.retrievedSources) ? job.retrievedSources : []),
        {
          sourceUrl: fetched.finalUrl,
          sourceType: "supplier_index",
          sectionName: "Supplier Index",
          text: fetched.text.slice(0, 25_000),
        },
      ],
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "supplier_index_loaded",
      retrievalState: "summary_only",
      expectedPartsTotal: expectedTotal,
      expectedPartsSource: expectedTotal
        ? `${input.supplier}:supplier_count_indicator`
        : null,
      trustedTotalPartCount: supplierIndex.totalCount,
      trustedTotalCountSource: supplierIndex.totalCount
        ? `${input.supplier}:supplier_count_indicator`
        : null,
      trustedTotalCountSourceUrl: supplierIndex.totalCount
        ? supplierIndex.totalCountSourceUrl
        : null,
      trustedTotalCountCheckedAt: supplierIndex.totalCount ? new Date() : null,
      truthSource: fetched.finalUrl,
      sourceStrategy: `manual-distributor-control:${input.tierKey}:${input.supplier}:load_supplier_index`,
      bomComplete: false,
    });

    return {
      status: "supplier_index_loaded",
      supplierIndex,
    };
  }

  if (input.task === "extract_selected_assemblies") {
    const selectedAssemblies = Array.isArray(input.selectedAssemblies)
      ? input.selectedAssemblies
      : [];

    if (!selectedAssemblies.length) {
      throw new Error("Select at least one assembly before GO.");
    }

    await setBomJobStage(input.jobId, "selected_assemblies_extracting");

    const extractedRows: Array<Record<string, unknown>> = [];
    const issues: string[] = [...((job.issues as string[]) || [])];
    const updatedAssemblyStatus = new Map<string, Partial<SupplierAssemblyIndexItem>>();

    for (const assembly of selectedAssemblies) {
      assertNonEmpty(assembly.title, "Selected assembly title is required.");
      assertNonEmpty(assembly.sourceUrl, "Selected assembly source URL is required.");

      const expected = Number(assembly.overrideCount ?? assembly.supplierCount ?? 0);

      try {
        const fetched = await fetchExactSupplierUrl(assembly.sourceUrl);
        const sourceText = fetched.text || htmlToReadableText(fetched.html);

        const result = await runPartsExtractor({
          sourceText,
          sourceUrl: fetched.finalUrl,
          sourceType: "supplier_assembly" as any,
          provider: input.supplier,
          modelNumber: input.canonicalModel,
        });

        const rows = result.rows.map((row: any) => ({
          ...row,
          section: row.section || assembly.title,
          assemblyTitle: assembly.title,
          sourceUrl: row.sourceUrl || fetched.finalUrl,
          sourceType: row.sourceType || "supplier_assembly",
          supplier: input.supplier,
        }));

        extractedRows.push(...rows);

        const status =
          expected > 0
            ? rows.length >= expected
              ? "complete"
              : "partial"
            : "count_unknown";

        if (expected > 0 && rows.length < expected) {
          issues.push(
            `${input.supplier} ${assembly.title} extracted ${rows.length}/${expected} expected rows.`,
          );
        }

        updatedAssemblyStatus.set(assembly.id || assembly.title, {
          status,
          actualCount: rows.length,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        issues.push(`${input.supplier} ${assembly.title} extraction failed: ${message}`);

        updatedAssemblyStatus.set(assembly.id || assembly.title, {
          status: "failed",
          actualCount: 0,
          error: message,
        });
      }
    }

    const existingRows = Array.isArray(job.finalRows)
      ? (job.finalRows as Array<Record<string, unknown>>)
      : [];

    const mergedRows = mergeRowsByPartNumber(existingRows, extractedRows);

    const diagramParse = getExistingDiagramParse(job);
    const key = supplierIndexKey(input.supplier, input.canonicalModel);
    const existingIndex = (diagramParse.supplierIndexes || {})[key] as
      | SupplierAssemblyIndex
      | undefined;

    let nextIndex = existingIndex;
    if (existingIndex) {
      nextIndex = {
        ...existingIndex,
        assemblies: existingIndex.assemblies.map((item) => {
          const update = updatedAssemblyStatus.get(item.id) || updatedAssemblyStatus.get(item.title);
          const selected = selectedAssemblies.some(
            (assembly) => (assembly.id && assembly.id === item.id) || assembly.title === item.title,
          );

          return {
            ...item,
            selected: selected || item.selected,
            ...(update || {}),
          };
        }),
      };
    }

    const selectedExpected = selectedExpectedCount(
      selectedAssemblies.map((item) => ({
        selected: true,
        supplierCount: item.supplierCount,
        overrideCount: item.overrideCount,
      })),
    );

    const actualCanonicalPartCount = mergedRows.length;
    const partsComplete =
      selectedExpected > 0 && actualCanonicalPartCount >= selectedExpected;

    await saveBomArtifacts(input.jobId, {
      diagramParse:
        nextIndex && existingIndex
          ? updateSupplierIndexInDiagramParse({
              diagramParse,
              supplierIndex: nextIndex,
            })
          : diagramParse,
      extractedRowsRaw: mergedRows,
      finalRows: mergedRows,
      issues,
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "selected_assemblies_extracted",
      retrievalState: partsComplete ? "parts_partial" : "parts_partial",
      expectedPartsTotal: selectedExpected || job.expectedPartsTotal,
      expectedPartsSource: selectedExpected
        ? `${input.supplier}:selected_supplier_assemblies`
        : job.expectedPartsSource,
      expectedPartCount: selectedExpected || job.expectedPartCount,
      actualPartCount: actualCanonicalPartCount,
      actualCanonicalPartCount,
      actualUniqueParts: actualCanonicalPartCount,
      rawRowCount: mergedRows.length,
      uniqueRowCount: mergedRows.length,
      coveragePct:
        selectedExpected > 0 ? Math.min(1, actualCanonicalPartCount / selectedExpected) : null,
      partsComplete,
      pricingComplete: false,
      bomComplete: false,
      truthSource: selectedAssemblies[0]?.sourceUrl ?? job.truthSource,
      sourceStrategy: `manual-distributor-control:${input.tierKey}:${input.supplier}:extract_selected_assemblies`,
    });

    return {
      status: "selected_assemblies_extracted",
      extractedThisRun: extractedRows.length,
      totalRows: mergedRows.length,
      expectedSelectedCount: selectedExpected,
      partsComplete,
      selectedAssemblies,
    };
  }

  if (
    input.task === "price_encompass" ||
    input.task === "price_backup_1" ||
    input.task === "price_backup_2"
  ) {
    const pricingSource = mapPricingTaskToSource(input.task, input.pricingSource);
    if (!pricingSource) throw new Error("Pricing source is required.");

    await setBomJobStage(input.jobId, `${input.task}_running`);

    const rows = Array.isArray(job.finalRows)
      ? (job.finalRows as Array<Record<string, unknown>>)
      : [];
    const expected = Number(job.expectedPartsTotal || job.expectedPartCount || 0);

    if (!rows.length) {
      await updateBomJobSummary(input.jobId, {
        jobStage: `${input.task}_locked`,
        retrievalState: "summary_only",
        errorText: "Pricing locked. No BOM rows exist.",
        bomComplete: false,
      });

      return {
        status: "pricing_locked",
        reason: "No BOM rows exist.",
      };
    }

    if (expected > 0 && rows.length < expected) {
      await updateBomJobSummary(input.jobId, {
        jobStage: `${input.task}_locked`,
        retrievalState: "parts_partial",
        errorText: `Pricing locked. Found ${rows.length}/${expected} expected parts.`,
        bomComplete: false,
      });

      return {
        status: "pricing_locked",
        reason: `Found ${rows.length}/${expected} expected parts.`,
      };
    }

    const priced = await enrichBomRowsWithRetailPricing({
      brand: input.brand,
      model: input.canonicalModel,
      rows: rows as any,
      pricingOrder: [pricingSource],
    });

    const completion = validate_bom_completion({
      rows: priced.rows as any,
      trustedTotalPartCount: job.trustedTotalPartCount ?? job.expectedPartCount,
      identityResolved: true,
    });

    const verifiedPriceCount = countPricedRows(priced.rows as any);
    const requiredPriceCount = rows.length;
    const pricingComplete = requiredPriceCount > 0 && verifiedPriceCount >= requiredPriceCount;

    await saveBomArtifacts(input.jobId, {
      finalRows: priced.rows as any,
      issues: [...((job.issues as string[]) || []), ...priced.issues],
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: `${input.task}_complete`,
      retrievalState: pricingComplete ? "parts_partial" : "parts_partial",
      actualPartCount: completion.actualPartCount,
      actualCanonicalPartCount: completion.actualCanonicalPartCount,
      requiredPriceCount,
      verifiedPriceCount,
      unpricedCount: Math.max(0, requiredPriceCount - verifiedPriceCount),
      partsComplete: job.partsComplete ?? completion.partsComplete,
      pricingComplete,
      bomComplete: false,
      sourceStrategy: `manual-distributor-control:${input.tierKey}:${input.supplier}:${input.task}:${pricingSource}`,
    });

    return {
      status: pricingComplete ? "pricing_complete" : "pricing_partial",
      pricingSource,
      requiredPriceCount,
      verifiedPriceCount,
      unpricedCount: Math.max(0, requiredPriceCount - verifiedPriceCount),
    };
  }

  throw new Error(`Unsupported source action: ${input.task}`);
}
