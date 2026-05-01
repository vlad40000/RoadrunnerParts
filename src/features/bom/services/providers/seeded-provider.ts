import "server-only";
import { db } from "@/server/db";
import { getSeedPartsForModel, getSeedSectionsForModel, getSeedRoutesForModel } from "../seed-store";
import { eq, and, sql } from "drizzle-orm";
import type { RetrievedSource, SourceProvider, ProviderInput } from "./types";
import { normalizeModel } from "./utils";
import { getSourceTypeForProvider } from "./source-type-map";

function getSourceType(provider: string): "oem" | "distributor" {
  return getSourceTypeForProvider(provider);
}

export const seededProvider: SourceProvider = {
  name: "seeded-provider",
  priority: 0, // Highest priority

  supports(input: ProviderInput): boolean {
    return !!input.model;
  },

  async fetchSources(input: ProviderInput): Promise<RetrievedSource[]> {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const sources: RetrievedSource[] = [];

    // 1. Fetch Part Seed Rows
    const partRows = await getSeedPartsForModel(model);

    if (partRows.length > 0) {
      // Group by provider and section
      const sectionsMap = new Map<string, typeof partRows>();
      for (const row of partRows) {
        const key = `${row.provider}|${row.sectionNameClean || "UNKNOWN"}`;
        if (!sectionsMap.has(key)) sectionsMap.set(key, []);
        sectionsMap.get(key)!.push(row);
      }

      for (const [key, rows] of sectionsMap.entries()) {
        const [provider, sectionName] = key.split("|");
        const lines = [
          `SOURCE_PROVIDER: ${provider}`,
          `MODEL: ${model}`,
          `SECTION: ${sectionName}`,
          `SECTION_ORIGINAL: ${rows[0].sectionLabelRaw || sectionName}`,
          `SOURCE_STATUS: parts_seed`,
        ];

        for (const row of rows) {
          const rowLine = [
            "ROW",
            `diagram_number=${row.diagramNumber || ""}`,
            `description=${row.description || ""}`,
            `original_part_number=${row.originalPartNumber || ""}`,
            `current_service_part_number=${row.currentServicePartNumber || ""}`,
            `nla_status=${row.nlaStatus ? "true" : "false"}`,
            `replacement_note=${row.replacementNote || ""}`,
          ].join("|");
          lines.push(rowLine);
        }

        sources.push({
          sourceUrl: rows[0].providerAssemblyUrl || `seed://${provider}/${model}/${sectionName}`,
          sourceType: getSourceType(provider),
          provider: provider,
          sectionName: sectionName,
          text: lines.join("\n"),
          meta: {
            isSeed: true,
            sourceFile: rows[0].sourceFile,
          },
        });
      }
    }

    // 2. Fetch Assembly Sections (NO_PART_ROWS: TRUE)
    const assemblySections = await getSeedSectionsForModel(model);

    for (const section of assemblySections) {
      const provider = section.provider;
      const sectionName = section.sectionNameClean || "UNKNOWN";
      
      const lines = [
        `SOURCE_PROVIDER: ${provider}`,
        `MODEL: ${model}`,
        `SECTION: ${sectionName}`,
        `SECTION_ORIGINAL: ${section.sectionLabelRaw || sectionName}`,
        `ASSEMBLY_URL: ${section.providerAssemblyUrl || ""}`,
        `IMAGE_SMALL_URL: ${section.imageUrl || ""}`,
        `SOURCE_STATUS: sections_only`,
        `NO_PART_ROWS: TRUE`,
      ];

      sources.push({
        sourceUrl: section.providerAssemblyUrl || `seed://${provider}/${model}/${sectionName}`,
        sourceType: getSourceType(provider),
        provider: provider,
        sectionName: sectionName,
        text: lines.join("\n"),
        meta: {
          isSeed: true,
          sourceFile: section.sourceFile,
        },
      });
    }

    // 3. Fetch Model Routes (NO_PART_ROWS: TRUE)
    const modelRoutes = await getSeedRoutesForModel(model);

    for (const route of modelRoutes) {
      const provider = route.provider;
      const lines = [
        `SOURCE_PROVIDER: ${provider}`,
        `MODEL: ${model}`,
        `ASSEMBLY_URL: ${route.providerAssemblyUrl || route.providerModelUrl || ""}`,
        `SOURCE_STATUS: route_only`,
        `NO_PART_ROWS: TRUE`,
      ];

      sources.push({
        sourceUrl: route.providerModelUrl || `seed://${provider}/${model}/route`,
        sourceType: getSourceType(provider),
        provider: provider,
        sectionName: "Model Route",
        text: lines.join("\n"),
        meta: {
          isSeed: true,
          sourceFile: route.sourceFile,
          isRouteOnly: true,
        },
      });
    }

    return sources;
  },
};
