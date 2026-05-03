import "server-only";

import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
} from "./encompass-backed-family";
import { parseEncompassRowsFromTable } from "./encompass-family";

export const hisenseFamilyProvider = createEncompassBackedFamilyProvider({
  name: "hisense-family",
  priority: 20,
  domain: "hisense.encompass.com",
  brandNames: ["Hisense"],
  replacementNoteDefault: "Hisense authorized Encompass parts surface",
  sourceSurfaceLabel: "hisense-encompass",
  buildPreferredQueries: (model: string) => [
    `site:hisense.encompass.com/model "${model}"`,
    `site:hisense.encompass.com "${model}" "Parts List"`,
  ],
  looksLikeModelUrl: (url: string) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "hisense.encompass.com" &&
        parsed.pathname.toLowerCase().includes("/model/")
      );
    } catch {
      return false;
    }
  },
  isVariationUrl: (url: string) => {
    try {
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
      return modelIndex !== -1 && parts.length >= modelIndex + 2;
    } catch {
      return false;
    }
  },
  extractVariationCodeFromUrl: (url: string) => {
    try {
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
      if (modelIndex !== -1 && parts.length >= modelIndex + 3) {
        return parts[modelIndex + 2].toUpperCase();
      }
    } catch {
      // ignore
    }
    return null;
  },
  landingHasMultipleVariations: (text: string) => {
    const upper = text.toUpperCase();
    return (
      upper.includes("THIS MODEL HAS MULTIPLE VARIATIONS") ||
      upper.includes("PLEASE CHOOSE YOUR VERSION")
    );
  },
  landingHasPartsList: (text: string) => {
    const upper = text.toUpperCase();
    return (
      upper.includes("PARTS LIST") &&
      upper.includes("PART NUMBER") &&
      upper.includes("DESCRIPTION")
    );
  },
  parseVariationLinks(input) {
    return defaultParseVariationLinks({
      modelUrl: input.modelUrl,
      html: input.html,
      model: input.model,
      looksLikeModelUrl: (url: string) => {
        try {
          const parsed = new URL(url);
          return parsed.hostname === "hisense.encompass.com" && parsed.pathname.toLowerCase().includes("/model/");
        } catch { return false; }
      },
      isVariationUrl: (url: string) => {
        try {
          const parts = new URL(url).pathname.split("/").filter(Boolean);
          const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
          return modelIndex !== -1 && parts.length >= modelIndex + 2;
        } catch { return false; }
      },
      extractVariationCodeFromUrl: (url: string) => {
        try {
          const parts = new URL(url).pathname.split("/").filter(Boolean);
          const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
          if (modelIndex !== -1 && parts.length >= modelIndex + 3) {
            return parts[modelIndex + 2].toUpperCase();
          }
        } catch { }
        return null;
      },
    });
  },
  parseRows: (input) => {
    return parseEncompassRowsFromTable(input.html);
  },
});
