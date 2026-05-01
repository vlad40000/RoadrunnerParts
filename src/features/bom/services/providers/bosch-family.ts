import "server-only";
import { load } from "cheerio";
import type {
  ProviderInput,
  RetrievedSource,
  SourceProvider,
} from "./types";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";
import {
  searchExistingGroundingLayer,
  dedupeSearchHits,
} from "../search/search-adapter";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import { buildBoschSupportUrl } from "./deterministic-urls";

const BOSCH_ONLY_BRANDS = new Set(["bosch"]);

type ParsedBoschRow = {
  positionNumber: string;
  partNumber: string;
  description: string;
  nlaStatus: boolean;
  replacementNote: string | null;
};

function baseEnr(model: string) {
  return normalizeModel(model).split("/")[0] ?? normalizeModel(model);
}

function boschModelTokens(model: string) {
  const normalized = normalizeModel(model);
  const base = baseEnr(normalized);
  return uniqueBy([normalized, base], (v) => v);
}

function looksLikeBoschSupportDetailUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.bosch-home.com" ||
        parsed.hostname === "bosch-home.com" ||
        parsed.hostname.endsWith(".bosch-home.com")) &&
      parsed.pathname.includes("/supportdetail/product/")
    );
  } catch {
    return false;
  }
}

function looksLikeBoschPartsUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    return (
      (parsed.hostname === "www.bosch-home.com" ||
        parsed.hostname === "bosch-home.com" ||
        parsed.hostname.endsWith(".bosch-home.com")) &&
      (
        path.includes("/owner-support/spare-parts") ||
        path.includes("/shop/spare-parts") ||
        path.includes("/spareparts/search")
      )
    );
  } catch {
    return false;
  }
}

function containsBoschPartsMarkers(text: string) {
  const upper = text.toUpperCase();

  return (
    upper.includes("MODEL NUMBER (E-NR)") &&
    (
      upper.includes("POSITION NUMBER") ||
      upper.includes("ENTER PART NUMBER") ||
      upper.includes("LOOK FOR THE POSITION NUMBER IN THE TABLE BELOW") ||
      upper.includes("LIST OF PARTS")
    )
  );
}

function containsBoschSupportMarkers(text: string) {
  const upper = text.toUpperCase();

  return (
    upper.includes("MODEL NUMBER (E-NR)") &&
    upper.includes("PARTS")
  );
}

function containsTargetModel(text: string, model: string) {
  const upper = text.toUpperCase();

  return boschModelTokens(model).some((token) => upper.includes(token));
}

function classifyBoschSection(text: string) {
  const t = cleanText(text).toLowerCase();

  if (t.includes("pump")) return "Pump";
  if (t.includes("filter")) return "Filter";
  if (t.includes("valve")) return "Valve & Float";
  if (t.includes("sensor") || t.includes("thermistor")) {
    return "Sensor & Thermistor";
  }
  if (t.includes("board") || t.includes("module") || t.includes("control")) {
    return "Circuit Board & Timer";
  }
  if (t.includes("door")) return "Door";
  if (t.includes("seal") || t.includes("gasket")) return "Gasket & Seal";
  if (t.includes("basket") || t.includes("rack")) return "Dishrack";
  if (t.includes("spray")) return "Wash Arm & Wash Arm Support";
  if (t.includes("hose") || t.includes("tube")) return "Hose, Tube & Fitting";
  if (t.includes("motor")) return "Motor";
  if (t.includes("heater") || t.includes("heating")) return "Heating Element";

  return "Official Parts List";
}

function buildBoschSupportQueries(model: string) {
  const normalized = normalizeModel(model);
  const base = baseEnr(normalized);

  return uniqueBy(
    [
      `site:bosch-home.com/us/supportdetail/product "${normalized}" "Model Number (E-Nr)"`,
      `site:bosch-home.com/us/supportdetail/product "${base}" "Model Number (E-Nr)"`,
      `site:bosch-home.com/us "${normalized}" "Spare parts, accessories & online support"`,
    ],
    (value) => value.toLowerCase(),
  );
}

function buildBoschPartsQueries(model: string) {
  const normalized = normalizeModel(model);
  const base = baseEnr(normalized);

  return uniqueBy(
    [
      `site:bosch-home.com/us "${normalized}" "Position number" "Model Number (E-Nr)"`,
      `site:bosch-home.com/us "${normalized}" "Enter part number" "Model Number (E-Nr)"`,
      `site:bosch-home.com/us "${base}" "Position number" "Model Number (E-Nr)"`,
      `site:bosch-home.com/us "${base}" "Enter part number" "Model Number (E-Nr)"`,
    ],
    (value) => value.toLowerCase(),
  );
}

async function resolveBoschSupportDetailUrl(model: string) {
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: buildBoschSupportQueries(model),
      domain: "bosch-home.com",
      maxResults: 20,
    }),
  );

  for (const hit of hits) {
    if (!looksLikeBoschSupportDetailUrl(hit.url)) continue;

    try {
      const html = await fetchHtml(hit.url);
      const text = htmlToText(html);

      if (!containsBoschSupportMarkers(text)) continue;
      if (!containsTargetModel(text, model)) continue;

      return {
        url: hit.url,
        html,
        text,
      };
    } catch {
      // continue
    }
  }

  return null;
}

function extractBoschPartsLinksFromHtml(html: string, supportUrl: string) {
  const $ = load(html);
  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href) return null;
      const abs = absoluteUrl(supportUrl, href);

      if (!looksLikeBoschPartsUrl(abs)) return null;

      return {
        url: abs,
        label: text || "Bosch Parts",
      };
    })
    .get()
    .filter(Boolean) as Array<{ url: string; label: string }>;

  return uniqueBy(links, (item) => item.url);
}

async function searchBoschPartsPages(model: string) {
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: buildBoschPartsQueries(model),
      domain: "bosch-home.com",
      maxResults: 20,
    }),
  );

  return hits
    .filter((hit) => looksLikeBoschPartsUrl(hit.url))
    .map((hit) => ({
      url: hit.url,
      label: hit.title || "Bosch Parts",
    }));
}

function parseBoschRowsFromText(pageText: string): ParsedBoschRow[] {
  const rows: ParsedBoschRow[] = [];
  const normalizedText = cleanText(pageText);

  const patterns = [
    /Position\s*number\s*[:#]?\s*([A-Z0-9-]{1,8})[\s\S]{0,140}?Material\s*number\s*[:#]?\s*([A-Z0-9-]{5,})[\s\S]{0,220}?Description\s*[:#]?\s*([A-Z][A-Za-z0-9/&,'().\- ]{3,120})/gi,
    /([A-Z][A-Za-z0-9/&,'().\- ]{4,120})[\s\S]{0,120}?Position\s*number\s*[:#]?\s*([A-Z0-9-]{1,8})[\s\S]{0,120}?Material\s*number\s*[:#]?\s*([A-Z0-9-]{5,})/gi,
    /(\d{2,5})\s+([A-Z0-9-]{5,})\s+([A-Z][A-Za-z0-9/&,'().\- ]{4,120})(?=\s+\d{2,5}\s+[A-Z0-9-]{5,}|\s*$)/g,
  ];

  for (const pattern of patterns) {
    for (const match of Array.from(normalizedText.matchAll(pattern))) {
      if (pattern === patterns[0]) {
        rows.push({
          positionNumber: cleanText(match[1]),
          partNumber: cleanText(match[2]).toUpperCase(),
          description: cleanText(match[3]),
          nlaStatus: false,
          replacementNote: null,
        });
      } else if (pattern === patterns[1]) {
        rows.push({
          positionNumber: cleanText(match[2]),
          partNumber: cleanText(match[3]).toUpperCase(),
          description: cleanText(match[1]),
          nlaStatus: false,
          replacementNote: null,
        });
      } else {
        rows.push({
          positionNumber: cleanText(match[1]),
          partNumber: cleanText(match[2]).toUpperCase(),
          description: cleanText(match[3]),
          nlaStatus: false,
          replacementNote: null,
        });
      }
    }
  }

  return uniqueBy(
    rows.filter(
      (row) =>
        row.positionNumber &&
        row.partNumber &&
        row.description &&
        row.description.length >= 4,
    ),
    (row) => `${row.positionNumber}|${row.partNumber}`,
  );
}

function boschRowsToStructuredText(input: {
  model: string;
  sectionName: string;
  rows: ParsedBoschRow[];
}) {
  const lines = [
    `SOURCE_PROVIDER: bosch-family`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
  ];

  for (const row of input.rows) {
    lines.push(
      [
        "ROW",
        `diagram_number=${row.positionNumber}`,
        `description=${row.description}`,
        `original_part_number=${row.partNumber}`,
        `current_service_part_number=${row.partNumber}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

async function fetchBoschPartsSource(input: {
  model: string;
  url: string;
  label: string;
}): Promise<RetrievedSource | null> {
  const html = await fetchHtml(input.url);
  const text = htmlToText(html);

  if (!containsTargetModel(text, input.model)) {
    return null;
  }

  if (!containsBoschPartsMarkers(text)) {
    return null;
  }

  const rows = parseBoschRowsFromText(text);

  if (!rows.length) {
    return null;
  }

  const sectionName = classifyBoschSection(input.label);

  return {
    sourceUrl: input.url,
    sourceType: "oem",
    provider: "bosch-family",
    sectionName,
    text: boschRowsToStructuredText({
      model: input.model,
      sectionName,
      rows,
    }),
    meta: {
      rowCount: rows.length,
      enrValidated: true,
    },
  };
}

export const boschFamilyProvider: SourceProvider = {
  name: "bosch-family",
  priority: 20,

  supports(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return false;

    const brand = normalizeBrand(input.brand);
    return !brand || BOSCH_ONLY_BRANDS.has(brand);
  },

  async fetchSources(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    // Stage 1: Official E-Nr Validation via Support Portal
    const supportLandingUrl = buildBoschSupportUrl();
    const support = await resolveBoschSupportDetailUrl(model);
    
    // If we have FD number, include it in the validation context
    const fdMatch = input.model.match(/FD\s*[:#]?\s*(\d{4})/i);
    const fd = fdMatch ? fdMatch[1] : null;

    if (!support) {
       // Try a more aggressive exact model search if the support detail isn't found via normal hits
       const exactSearch = await resolveExactModelUrl({
         model,
         domain: "bosch-home.com",
         preferredQueries: [
           `site:bosch-home.com/us/owner-support/spare-parts "${model}"`,
           `site:bosch-home.com/us/shop/spare-parts "${model}"`
         ]
       });
       
       if (!exactSearch?.url) return [];
       // continue with the resolved URL if found
    }

    const discoveredLinks = extractBoschPartsLinksFromHtml(
      support.html,
      support.url,
    );

    const searchedLinks = await searchBoschPartsPages(model);

    const candidates = uniqueBy(
      [...discoveredLinks, ...searchedLinks],
      (item) => item.url,
    );

    const sources: RetrievedSource[] = [];

    for (const candidate of candidates.slice(0, 12)) {
      try {
        const source = await fetchBoschPartsSource({
          model,
          url: candidate.url,
          label: candidate.label,
        });

        if (source) {
          sources.push(source);
        }
      } catch {
        // continue
      }
    }

    return uniqueBy(sources, (s) => `${s.sectionName}|${s.sourceUrl}`);
  },
};
