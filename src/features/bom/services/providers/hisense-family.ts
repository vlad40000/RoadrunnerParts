import "server-only";

import { load } from "cheerio";
import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
  type EncompassParsedRow,
} from "./encompass-backed-family";
import { cleanText, normalizeModel, uniqueBy } from "./utils";

function baseModel(model: string) {
  return normalizeModel(model).split("/")[0] ?? normalizeModel(model);
}

function looksLikeHisenseModelUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "hisense.encompass.com" ||
        parsed.hostname.endsWith(".hisense.encompass.com")) &&
      parsed.pathname.toLowerCase().includes("/model/")
    );
  } catch {
    return false;
  }
}

function isHisenseVariationUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
    return modelIndex !== -1 && parts.length >= modelIndex + 3;
  } catch {
    return false;
  }
}

function extractHisenseVariationCodeFromUrl(url: string) {
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

function buildHisenseQueries(model: string) {
  const normalized = normalizeModel(model);
  const base = baseModel(normalized);

  return uniqueBy(
    [
      `site:hisense.encompass.com/model "${normalized}"`,
      `site:hisense.encompass.com/model "${base}"`,
      `site:hisense.encompass.com "${normalized}" "Parts List"`,
      `site:hisense.encompass.com "${base}" "Replacement Parts"`,
    ],
    (value) => value.toLowerCase(),
  );
}

function hisenseLandingHasMultipleVariations(text: string) {
  const upper = text.toUpperCase();
  return (
    upper.includes("THIS MODEL HAS MULTIPLE VARIATIONS") ||
    upper.includes("PLEASE CHOOSE YOUR VERSION")
  );
}

function hisenseLandingHasPartsList(text: string) {
  const upper = text.toUpperCase();
  return (
    upper.includes("PARTS LIST") &&
    upper.includes("PART NUMBER") &&
    upper.includes("DESCRIPTION")
  );
}

function parseHisenseRowsFromTable(html: string): EncompassParsedRow[] {
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
    const looksLikePartsTable =
      headerText.includes("category") &&
      headerText.includes("part number") &&
      headerText.includes("description");

    if (!looksLikePartsTable) return;

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

function parseHisenseRowsFromText(text: string): EncompassParsedRow[] {
  const rows: EncompassParsedRow[] = [];
  const body = cleanText(text);

  const tableStart = body.indexOf("Parts List");
  const aboutStart = body.indexOf("About Hisense");
  const window =
    tableStart !== -1
      ? body.slice(tableStart, aboutStart !== -1 ? aboutStart : undefined)
      : body;

  const pattern =
    /([A-Za-z][A-Za-z,&/ \-]+?)\s+([A-Z0-9-]{4,})\s+([A-Za-z0-9"&,'().\/ \-]{5,}?)(?=\s+[A-Za-z][A-Za-z,&/ \-]+?\s+[A-Z0-9-]{4,}\s+[A-Za-z0-9"&,'().\/ \-]{5,}|\s+About Hisense|$)/g;

  for (const match of window.matchAll(pattern)) {
    rows.push({
      sectionName: cleanText(match[1]),
      partNumber: cleanText(match[2]).toUpperCase(),
      description: cleanText(match[3]),
      nlaStatus: false,
    });
  }

  return uniqueBy(rows, (row) => `${row.sectionName}|${row.partNumber}`);
}

function parseHisenseRows(input: {
  html: string;
  text: string;
  model: string;
  variationUrl: string;
  variationCode: string | null;
}) {
  const tableRows = parseHisenseRowsFromTable(input.html);
  if (tableRows.length) return tableRows;

  return parseHisenseRowsFromText(input.text);
}

export const hisenseFamilyProvider = createEncompassBackedFamilyProvider({
  name: "hisense-family",
  priority: 20,
  domain: "hisense.encompass.com",
  brandNames: ["Hisense"],
  replacementNoteDefault: "Authorized Hisense Encompass parts list",
  sourceSurfaceLabel: "hisense-encompass",
  buildPreferredQueries: buildHisenseQueries,
  looksLikeModelUrl: looksLikeHisenseModelUrl,
  isVariationUrl: isHisenseVariationUrl,
  extractVariationCodeFromUrl: extractHisenseVariationCodeFromUrl,
  landingHasMultipleVariations: hisenseLandingHasMultipleVariations,
  landingHasPartsList: hisenseLandingHasPartsList,
  parseVariationLinks(input) {
    return defaultParseVariationLinks({
      modelUrl: input.modelUrl,
      html: input.html,
      model: input.model,
      looksLikeModelUrl: looksLikeHisenseModelUrl,
      isVariationUrl: isHisenseVariationUrl,
      extractVariationCodeFromUrl: extractHisenseVariationCodeFromUrl,
    });
  },
  parseRows: parseHisenseRows,
});
