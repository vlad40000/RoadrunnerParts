import { runAgentLoop, AgentConfig } from "./agent-loop";
import { CORE_BOM_TOOLS } from "./tool-definitions";
import { dispatchBomToolCall } from "./bom-agent-dispatcher";
import { buildSourceResolverPrompt } from "../../prompts/engine";
import { identityExtractionPrompt } from "../../prompts/identity";
import { partsExtractionPrompt } from "../../prompts/parts";

export async function orchestrateAgentPipeline(input: {
  model: string;
  brand?: string | null;
  imageAssetIds?: string[];
}) {
  console.log(`[BOM Agent] Starting pipeline for ${input.model}...`);

  // STAGE 1: Identity & Cache Check
  const identityAgent: AgentConfig = {
    stage: "ocr_ingest",
    systemInstruction: identityExtractionPrompt,
    tools: CORE_BOM_TOOLS.filter(t => ["ocr_extract_nameplate", "normalize_appliance_identity", "db_get_model_record", "db_get_model_part_count", "validate_cached_bom_completeness"].includes(t.name)),
    mode: "AUTO"
  };

  const identityResponse = await runAgentLoop({
    config: identityAgent,
    prompt: `Analyze the following appliance data. Model: ${input.model}. Brand: ${input.brand || 'unknown'}. Images: ${input.imageAssetIds?.join(', ') || 'none'}.`,
    dispatcher: dispatchBomToolCall
  });

  console.log(`[BOM Agent] Identity Phase Complete:`, identityResponse);

  // If identity response indicates we can serve from cache, we stop here.
  if (identityResponse.includes("bom_complete") || identityResponse.includes("serve from cache")) {
    return { status: "complete", source: "cache" };
  }

  // STAGE 2: Source Resolution
  const resolverAgent: AgentConfig = {
    stage: "source_resolution",
    systemInstruction: buildSourceResolverPrompt({ brand: input.brand }),
    tools: CORE_BOM_TOOLS.filter(t => ["resolve_distributor_sources", "accept_trusted_total_part_count", "db_upsert_model_sources"].includes(t.name)),
    mode: "ANY"
  };

  const resolverResponse = await runAgentLoop({
    config: resolverAgent,
    prompt: `Find sources for the normalized model established in the previous phase. ${identityResponse}`,
    dispatcher: dispatchBomToolCall
  });

  console.log(`[BOM Agent] Source Resolution Complete:`, resolverResponse);

  // STAGE 3: Parts Extraction
  const extractionAgent: AgentConfig = {
    stage: "parts_extraction",
    systemInstruction: partsExtractionPrompt,
    tools: CORE_BOM_TOOLS.filter(t => [
      "fetch_source_page",
      "extract_diagram_sections",
      "extract_full_diagram_manifest",
      "extract_diagram_section_rows",
      "extract_parts_from_section",
      "synthesize_bom",
      "db_upsert_bom_parts",
      "map_found_parts_to_diagram_manifest",
      "validate_manifest_coverage",
      "validate_parts_completeness_against_manifest",
    ].includes(t.name)),
    mode: "ANY"
  };

  const extractionResponse = await runAgentLoop({
    config: extractionAgent,
    prompt: `Extract parts using the resolved sources. ${resolverResponse}`,
    dispatcher: dispatchBomToolCall
  });

  console.log(`[BOM Agent] Extraction Phase Complete:`, extractionResponse);

  return {
    status: "extraction_finished",
    summary: extractionResponse
  };
}

