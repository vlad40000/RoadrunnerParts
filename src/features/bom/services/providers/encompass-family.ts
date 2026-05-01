import "server-only";

import { load } from "cheerio";
import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
  type EncompassParsedRow,
} from "./encompass-backed-family";
import { cleanText, normalizeModel, uniqueBy } from "./utils";

function looksLikeEncompassModelUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "encompass.com" ||
        parsed.hostname === "www.encompass.com") &&
      parsed.pathname.toLowerCase().includes("/model/")
    );
  } catch {
    return false;
  }
}

function isEncompassVariationUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
    return modelIndex !== -1 && parts.length >= modelIndex + 2;
  } catch {
    return false;
  }
}

function extractEncompassVariationCodeFromUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
    if (modelIndex !== -1 && parts.length >= modelIndex + 3) {
      return cleanText(parts[modelIndex + 2]).toUpperCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function buildEncompassQueries(model: string) {
  const normalized = normalizeModel(model);
  return [
    `site:encompass.com/model "${normalized}"`,
    `site:encompass.com "${normalized}" "Parts List"`,
    `site:encompass.com "${normalized}" "Exploded View"`,
  ];
}

function encompassLandingHasMultipleVariations(text: string) {
  const upper = text.toUpperCase();
  return (
    upper.includes("THIS MODEL HAS MULTIPLE VARIATIONS") ||
    upper.includes("PLEASE CHOOSE YOUR VERSION")
  );
}

function encompassLandingHasPartsList(text: string) {
  const upper = text.toUpperCase();
  return (
    upper.includes("PARTS LIST") &&
    upper.includes("PART NUMBER") &&
    upper.includes("DESCRIPTION")
  );
}

function parseEncompassRowsFromTable(html: string): EncompassParsedRow[] {
  const $ = load(html);
  const rows: EncompassParsedRow[] = [];

  $("table").each((_, table) => {
    const headerCells = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((__, cell) => cleanText($(cell).text()).toLowerCase())
      .get();

    const headerText = headerCells.join(" | ");
    const hasPartNumber = headerText.includes("part number") || headerText.includes("part #") || headerText.includes("model part");
    const hasDescription = headerText.includes("description") || headerText.includes("desc") || headerText.includes("part name");

    if (!hasPartNumber || !hasDescription) return;

    $(table)
      .find("tr")
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => cleanText($(td).text()))
          .get();

        if (cells.length < 3) return;

        const sectionName = cells[0] || "Miscellaneous";
        const partNumber = (cells[1] || "").toUpperCase();
        const description = cells[2] || "";
        const tail = cells.slice(3).join(" ");

        if (!partNumber || !description) return;
        if (!/^[A-Z0-9-]{4,}$/.test(partNumber)) return;

        rows.push({
          sectionName,
          partNumber,
          description,
          nlaStatus: /\bNo\b/i.test(tail) && !/\bIn Stock\b/i.test(tail),
        });
      });
  });

  return uniqueBy(rows, (row) => `${row.sectionName}|${row.partNumber}`);
}

function parseEncompassRows(input: {
  html: string;
  text: string;
  model: string;
  variationUrl: string;
  variationCode: string | null;
}) {
  return parseEncompassRowsFromTable(input.html);
}

export const encompassFamilyProvider = createEncompassBackedFamilyProvider({
  name: "encompass-family",
  priority: 25,
  domain: "encompass.com",
  brandNames: [
    "Haier",
    "Samsung",
    "LG",
    "Sony",
    "Panasonic",
    "Vizio",
    "Toshiba",
    "Sharp",
    "Kenmore",
    "Whirlpool",
    "Maytag",
    "KitchenAid",
    "Amana",
    "Jenn-Air",
    "Magic Chef",
    "Admiral",
    "Norge",
    "Roper",
  ],
  replacementNoteDefault: "Authorized Encompass parts list",
  sourceSurfaceLabel: "encompass-distributor",
  buildPreferredQueries: buildEncompassQueries,
  looksLikeModelUrl: looksLikeEncompassModelUrl,
  isVariationUrl: isEncompassVariationUrl,
  extractVariationCodeFromUrl: extractEncompassVariationCodeFromUrl,
  landingHasMultipleVariations: encompassLandingHasMultipleVariations,
  landingHasPartsList: encompassLandingHasPartsList,
  parseVariationLinks(input) {
    return defaultParseVariationLinks({
      modelUrl: input.modelUrl,
      html: input.html,
      model: input.model,
      looksLikeModelUrl: looksLikeEncompassModelUrl,
      isVariationUrl: isEncompassVariationUrl,
      extractVariationCodeFromUrl: extractEncompassVariationCodeFromUrl,
    });
  },
  parseRows: parseEncompassRows,
});
