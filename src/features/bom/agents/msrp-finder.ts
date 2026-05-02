import { z } from "zod";
import { runStructuredJson } from "../services/model-runner";
import { logger } from "@/lib/logger";
import { fetchSources } from "../services/source-fetcher";

const msrpResultSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().default("USD"),
  confidence: z.enum(["high", "medium", "low", "none"]),
  evidence: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});

export type MsrpResult = z.infer<typeof msrpResultSchema>;

const WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx";
const WAYBACK_WEB = "https://web.archive.org/web";

async function fetchWaybackSnapshots(url: string, fromDate: string, toDate: string): Promise<Array<{ timestamp: string, originalUrl: string, archiveUrl: string }>> {
  const params = new URLSearchParams({
    url,
    from: fromDate.replace(/-/g, ""),
    to: toDate.replace(/-/g, ""),
    output: "json",
    fl: "timestamp,original",
    filter: "statuscode:200",
    collapse: "digest",
    limit: "5",
  });

  try {
    const res = await fetch(`${WAYBACK_CDX}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || data.length <= 1) return [];

    return data.slice(1).map((row: string[]) => ({
      timestamp: row[0],
      originalUrl: row[1],
      archiveUrl: `${WAYBACK_WEB}/${row[0]}id_/${row[1]}`,
    }));
  } catch (err) {
    logger.error("Wayback CDX fetch failed:", err);
    return [];
  }
}

export async function runMsrpDiscovery(input: {
  brand: string | null;
  model: string | null;
  manufactureDate: string | null;
}): Promise<MsrpResult> {
  if (!input.model || !input.manufactureDate) {
    return { amount: null, currency: "USD", confidence: "none", evidence: "Missing model or manufacture date", sourceUrl: null };
  }

  // 1. Determine manufacturer domain
  const brand = input.brand?.toLowerCase() || "";
  let domain = "";
  if (brand.includes("whirlpool")) domain = "whirlpool.com";
  else if (brand.includes("ge")) domain = "geappliances.com";
  else if (brand.includes("samsung")) domain = "samsung.com";
  else if (brand.includes("lg")) domain = "lg.com";
  else if (brand.includes("bosch")) domain = "bosch-home.com";
  else if (brand.includes("frigidaire")) domain = "frigidaire.com";
  else if (brand.includes("maytag")) domain = "maytag.com";
  else if (brand.includes("kitchenaid")) domain = "kitchenaid.com";
  else if (brand.includes("amana")) domain = "amana.com";
  else if (brand.includes("jennair")) domain = "jennair.com";

  if (!domain) {
    return { amount: null, currency: "USD", confidence: "none", evidence: `No manufacturer domain mapped for brand: ${brand}`, sourceUrl: null };
  }

  // 2. Generate guess URLs
  const model = input.model.toUpperCase();
  const guesses = [
    `https://www.${domain}/search?query=${model}`,
    `https://www.${domain}/p/${model}`,
    `https://www.${domain}/product/${model}`,
  ];

  // 3. Find snapshots
  const [year, month] = input.manufactureDate.split("-");
  const fromDate = `${parseInt(year) - 1}${month}01`;
  const toDate = `${parseInt(year) + 1}${month}01`;

  let bestSnapshot: { timestamp: string, originalUrl: string, archiveUrl: string } | null = null;

  for (const url of guesses) {
    const snaps = await fetchWaybackSnapshots(url, fromDate, toDate);
    if (snaps.length > 0) {
      // Find the one closest to manufacture date
      const targetTs = input.manufactureDate.replace(/-/g, "") + "000000";
      bestSnapshot = snaps.reduce((prev, curr) => {
        return Math.abs(parseInt(curr.timestamp) - parseInt(targetTs)) < Math.abs(parseInt(prev.timestamp) - parseInt(targetTs)) ? curr : prev;
      });
      break;
    }
  }

  if (!bestSnapshot) {
    return { amount: null, currency: "USD", confidence: "none", evidence: "No manufacturer snapshots found in Wayback Machine for the manufacture period.", sourceUrl: null };
  }

  // 4. Fetch HTML and extract MSRP via Gemini
  try {
    const res = await fetch(bestSnapshot.archiveUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const prompt = `
<role>
You are an MSRP Extraction Specialist for appliance manufacturing data.
</role>

<context>
Model: ${model}
Manufacturer Date: ${input.manufactureDate}
Source URL: ${bestSnapshot.originalUrl}
Archived Snapshot: ${bestSnapshot.archiveUrl}
</context>

<instructions>
1. Analyze the provided HTML from a manufacturer's archived product page.
2. Locate the MSRP (Manufacturer Suggested Retail Price), List Price, or "Suggested Price".
3. Distinguish between MSRP and sale/retail prices. We only want the MSRP.
4. If multiple MSRPs are found, pick the one most clearly labeled as "MSRP" or "List Price".
5. If no MSRP is explicitly found, check if a single price is present that likely represents MSRP (usually near the top of the page).
</instructions>

<output_format>
Return a JSON object:
{
  "amount": number or null,
  "currency": "USD",
  "confidence": "high" | "medium" | "low" | "none",
  "evidence": "Brief explanation of where the price was found and the surrounding text context"
}
</output_format>

<html_content>
${html.slice(0, 50000)}
</html_content>
`;

    const result = await runStructuredJson<MsrpResult>({
      prompt,
      text: `HTML length: ${html.length}`,
      temperature: 1.0,
    });

    return {
      ...result,
      sourceUrl: bestSnapshot.originalUrl,
    };
  } catch (err) {
    logger.error("MSRP extraction failed:", err);
    return { amount: null, currency: "USD", confidence: "none", evidence: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`, sourceUrl: bestSnapshot.originalUrl };
  }
}
