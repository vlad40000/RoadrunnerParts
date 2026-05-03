import { neon } from "@neondatabase/serverless";
import { load } from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

const sql = neon(databaseUrl);
const workerId = process.env.WORKER_ID || `encompass-worker-${process.pid}`;
const pollMs = Number.parseInt(process.env.WORKER_POLL_MS || "5000", 10);
const once = process.argv.includes("--once");
const capturesDir = process.env.WORKER_CAPTURE_DIR || "captures/encompass";

function cleanText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeModel(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9./-]/g, "");
}

function parseMoney(raw) {
  const text = cleanText(raw);
  if (!text || /\bCALL\b/i.test(text)) return null;
  const match = text.match(/\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function priceStatus(raw) {
  const text = cleanText(raw);
  if (!text) return "missing_price";
  if (/\bCALL\b/i.test(text)) return "call_for_price";
  return parseMoney(text) === null ? "invalid_price" : "priced";
}

async function claimJob() {
  const rows = await sql`
    UPDATE bom_retrieval_jobs
    SET
      status = 'running',
      attempts = attempts + 1,
      locked_by = ${workerId},
      locked_at = now(),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    WHERE id = (
      SELECT id
      FROM bom_retrieval_jobs
      WHERE status IN ('pending', 'retry')
        AND attempts < max_attempts
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    )
    RETURNING *
  `;

  return rows[0] || null;
}

async function markJob(job, patch) {
  await sql`
    UPDATE bom_retrieval_jobs
    SET
      status = ${patch.status},
      result_summary = ${JSON.stringify(patch.resultSummary || {})}::jsonb,
      error_text = ${patch.errorText || null},
      finished_at = ${patch.finishedAt || null},
      locked_by = ${patch.clearLock ? null : workerId},
      locked_at = ${patch.clearLock ? null : new Date().toISOString()},
      updated_at = now()
    WHERE id = ${job.id}
  `;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return {
    html: await response.text(),
    finalUrl: response.url || url,
  };
}

async function resolveEncompassUrl(job) {
  if (job.source_url) return job.source_url;

  const model = normalizeModel(job.model);
  const brand = (job.brand || "").trim();

  // Try to find the ABV in encompass_brand_routes
  const routes = await sql`
    SELECT abv, target_brand 
    FROM encompass_brand_routes 
    WHERE brand ILIKE ${brand} 
       OR target_brand ILIKE ${brand}
    LIMIT 1
  `;

  if (routes.length > 0) {
    const { abv, target_brand } = routes[0];
    return `https://encompass.com/model/${abv.toUpperCase()}/${target_brand}/${model}`;
  }

  // Fallback to search
  return `https://encompass.com/search?searchTerm=${encodeURIComponent(model)}`;
}

async function persistRenderedHtml({ model, url, html }) {
  const safeModel = normalizeModel(model) || "UNKNOWN";
  const safeUrl = Buffer.from(url).toString("base64url").slice(0, 16);
  const dir = path.join(process.cwd(), capturesDir, safeModel);
  await mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `rendered-${safeUrl}-${Date.now()}.html`);
  await writeFile(outPath, html, "utf8");
  return outPath;
}

async function scrollRenderedPage(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve(undefined);
        }
      }, 150);
    });
  });
}

async function renderHtml(url, { model } = {}) {
  if (process.env.WORKER_PLAYWRIGHT !== "1") return null;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // Detect and wait for Cloudflare challenge
    const challengeTitle = await page.title();
    if (challengeTitle.includes("Just a moment") || challengeTitle.includes("Cloudflare")) {
      console.log(`[${workerId}] Cloudflare challenge detected. Waiting for solver...`);
      try {
        await page.waitForFunction(() => {
          const title = document.title;
          return !title.includes("Just a moment") && !title.includes("Cloudflare");
        }, { timeout: 45000 });
        console.log(`[${workerId}] Cloudflare challenge cleared.`);
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch (err) {
        console.warn(`[${workerId}] Cloudflare challenge timeout: ${err.message}`);
      }
    }

    // Handle cookie banner if it appears
    try {
      const cookieBtn = await page.waitForSelector("#onetrust-accept-btn-handler, .onetrust-close-btn-handler", { timeout: 5000 });
      if (cookieBtn) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Banner didn't appear
    }

    try {
      // Wait for any of these indicators that the page has loaded results
      await Promise.race([
        page.waitForSelector("table", { timeout: 20000 }),
        page.waitForSelector(".MuiGrid-item", { timeout: 20000 }),
        page.waitForSelector("[role='row']", { timeout: 20000 }),
        page.waitForSelector("main", { timeout: 20000 }),
      ]);
    } catch {
      // Proceed with what we have
    }
    await scrollRenderedPage(page);
    await page.waitForTimeout(2000); // Give it a bit more time for MUI to settle
    const html = await page.content();
    const artifactPath = await persistRenderedHtml({
      model: model || "UNKNOWN",
      url: page.url(),
      html,
    });
    return {
      html,
      finalUrl: page.url(),
      artifactPath,
    };
  } finally {
    await browser.close();
  }
}

function parseRowsFromHtml({ html, sourceUrl, model }) {
  const $ = load(html);
  const rows = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((__, cell) => cleanText($(cell).text()).toLowerCase())
      .get();

    const headerText = headers.join(" | ");
    if (!/part\s*(number|#)|model part/i.test(headerText)) return;
    if (!/description|part name|desc/i.test(headerText)) return;

    const refIdx = headers.findIndex((h) => /ref|image|callout|diagram/.test(h));
    const partIdx = headers.findIndex((h) => /part\s*(number|#)|model part/.test(h));
    const descIdx = headers.findIndex((h) => /description|part name|desc/.test(h));
    const priceIdx = headers.findIndex((h) => /price|our price|sale/.test(h));

    let sectionName = cleanText($(table).prevAll("h1,h2,h3,h4").first().text()) || "All Model Parts";

    $(table)
      .find("tr")
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => cleanText($(td).text()))
          .get();

        const partNumber = cleanText(cells[partIdx]).toUpperCase();
        const description = cleanText(cells[descIdx]);
        if (!partNumber || !description) return;
        if (!/^[A-Z0-9][A-Z0-9./-]{2,}$/.test(partNumber)) return;

        const diagramNumber = refIdx >= 0 ? cleanText(cells[refIdx]) : "";
        const priceRaw = priceIdx >= 0 ? cleanText(cells[priceIdx]) : "";
        const retailPrice = parseMoney(priceRaw);
        const status = priceStatus(priceRaw);

        rows.push({
          part_number: partNumber,
          description,
          callout_number: diagramNumber || null,
          quantity: 1,
          price_cents: retailPrice === null ? null : Math.round(retailPrice * 100),
          currency: retailPrice === null ? null : "USD",
          availability_status: null,
          mapped_encompass_assembly: sectionName,
          mapping_status: "verified",
          confidence: 0.99,
          evidence_text: `Encompass table row for ${model} at ${sourceUrl}`,
          section: sectionName,
          diagramNumber: diagramNumber || null,
          originalPartNumber: partNumber,
          currentServicePartNumber: partNumber,
          sourceUrl,
          sourceType: "distributor",
          provider: "encompass",
          nlaStatus: /\b(no longer|discontinued|unavailable)\b/i.test(cells.join(" ")),
          replacementNote: null,
          retailPrice,
          retailPriceText: retailPrice === null ? null : `$${retailPrice.toFixed(2)}`,
          retailAvailability: null,
          retailPricingUrl: sourceUrl,
          retailPriceSource: "encompass.com",
          retailPriceVerified: status === "priced",
          retailPriceStatus: status,
          retailPricedAt: status === "priced" ? new Date().toISOString() : null,
        });
      });
  });

  return rows;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = `${row.section}|${row.currentServicePartNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function persistRows({ job, rows, sourceUrl }) {
  for (const row of rows) {
    await sql`
      INSERT INTO provider_part_seed_rows (
        model,
        provider,
        provider_model_url,
        provider_assembly_url,
        diagram_url,
        section_name_clean,
        normalized_section,
        diagram_number,
        original_part_number,
        current_service_part_number,
        description,
        nla_status,
        source_status
      ) VALUES (
        ${job.model},
        'encompass',
        ${sourceUrl},
        ${sourceUrl},
        ${sourceUrl},
        ${row.section},
        ${row.section},
        ${row.diagramNumber || null},
        ${row.originalPartNumber},
        ${row.currentServicePartNumber},
        ${row.description},
        ${Boolean(row.nlaStatus)},
        'worker_verified'
      )
      ON CONFLICT DO NOTHING
    `;

    const status = row.retailPriceVerified ? "verified_price" : "exact_part_found_no_price";
    await sql`
      INSERT INTO part_price_snapshot (
        part_number,
        normalized_model,
        primary_source,
        listed_price,
        currency,
        availability,
        product_url,
        product_title,
        match_type,
        price_status,
        raw
      ) VALUES (
        ${row.currentServicePartNumber},
        ${job.model},
        'encompass.com',
        ${row.retailPriceVerified ? row.retailPrice : null},
        'USD',
        ${row.retailAvailability || null},
        ${row.retailPricingUrl},
        ${row.description},
        'exact_part_number',
        ${status},
        ${JSON.stringify({ workerId, sourceUrl, retailPriceStatus: row.retailPriceStatus })}::jsonb
      )
    `;
  }
}

async function updateBomJobFromWorker({ job, rows, sourceUrl }) {
  const [bomJob] = await sql`
    SELECT *
    FROM bom_jobs
    WHERE id = ${job.bom_job_id}
    LIMIT 1
  `;

  if (!bomJob) throw new Error(`BOM job not found: ${job.bom_job_id}`);

  const existingRows = Array.isArray(bomJob.final_rows) ? bomJob.final_rows : [];
  const finalRows = dedupeRows([...existingRows, ...rows]);
  const actualPartCount = finalRows.length;
  const verifiedPriceCount = finalRows.filter((row) => row.retailPriceVerified === true).length;
  const requiredPriceCount = actualPartCount;
  const expected =
    bomJob.trusted_total_part_count ||
    bomJob.expected_part_count ||
    bomJob.expected_parts_total ||
    null;
  const partsComplete = expected ? actualPartCount >= Number(expected) : false;
  const pricingComplete =
    partsComplete && actualPartCount > 0 && verifiedPriceCount >= requiredPriceCount;
  const retrievalState = pricingComplete
    ? "bom_complete"
    : partsComplete
      ? verifiedPriceCount > 0
        ? "parts_complete_pricing_partial"
        : "parts_complete_pricing_missing"
      : actualPartCount > 0
        ? "parts_partial"
        : "no_result";

  await sql`
    UPDATE bom_jobs
    SET
      job_stage = 'encompass_worker_complete',
      result_status = ${retrievalState},
      retrieval_state = ${retrievalState},
      source_strategy = 'db-first-worker:encompass',
      actual_part_count = ${actualPartCount},
      actual_canonical_part_count = ${actualPartCount},
      actual_unique_parts = ${actualPartCount},
      raw_row_count = ${actualPartCount},
      unique_row_count = ${actualPartCount},
      required_price_count = ${requiredPriceCount},
      verified_price_count = ${verifiedPriceCount},
      unpriced_count = ${Math.max(0, requiredPriceCount - verifiedPriceCount)},
      parts_complete = ${partsComplete},
      pricing_complete = ${pricingComplete},
      bom_complete = ${String(partsComplete && pricingComplete)},
      truth_source = ${sourceUrl},
      retrieved_sources = ${JSON.stringify([
        ...(Array.isArray(bomJob.retrieved_sources) ? bomJob.retrieved_sources : []),
        {
          sourceUrl,
          sourceType: 'distributor',
          provider: 'encompass',
          text: undefined,
          workerId,
        },
      ])}::jsonb,
      extracted_rows_raw = ${JSON.stringify(rows)}::jsonb,
      final_rows = ${JSON.stringify(finalRows)}::jsonb,
      issues = ${JSON.stringify(
        retrievalState === "bom_complete"
          ? []
          : [`Encompass worker state: ${retrievalState}`],
      )}::jsonb,
      error_text = null,
      updated_at = now()
    WHERE id = ${job.bom_job_id}
  `;

  return {
    actualPartCount,
    verifiedPriceCount,
    requiredPriceCount,
    partsComplete,
    pricingComplete,
    retrievalState,
  };
}

async function processJob(job) {
  const model = normalizeModel(job.model);
  const targetUrl = await resolveEncompassUrl(job);

  console.log(`[${workerId}] Initializing retrieval for ${model} (${job.brand}) -> ${targetUrl}`);

  await sql`
    UPDATE bom_jobs
    SET job_stage = 'encompass_worker_running',
        source_strategy = 'db-first-worker:encompass',
        updated_at = now()
    WHERE id = ${job.bom_job_id}
  `;

  let page;
  let rows = [];
  try {
    page = await fetchHtml(targetUrl);
    rows = parseRowsFromHtml({
      html: page.html,
      sourceUrl: page.finalUrl,
      model,
    });
  } catch (err) {
    console.warn(`[${workerId}] initial fetch failed, will try rendering: ${err.message}`);
    // page remains undefined, trigger fallback below
  }

  if (!rows.length) {
    const rendered = await renderHtml(targetUrl, { model });
    if (rendered) {
      page = rendered;
      rows = parseRowsFromHtml({
        html: rendered.html,
        sourceUrl: rendered.finalUrl,
        model,
      });
    }
  }

  if (!page) {
    throw new Error(`Failed to retrieve content from ${targetUrl}`);
  }

  rows = dedupeRows(rows);
  await persistRows({ job, rows, sourceUrl: page.finalUrl });
  const summary = await updateBomJobFromWorker({
    job,
    rows,
    sourceUrl: page.finalUrl,
  });

  await markJob(job, {
    status: "succeeded",
    resultSummary: {
      ...summary,
      sourceUrl: page.finalUrl,
      renderedArtifactPath: page.artifactPath || null,
      rowCount: rows.length,
      workerId,
    },
    finishedAt: new Date().toISOString(),
    clearLock: true,
  });

  console.log(
    `[${workerId}] completed ${job.id}: ${rows.length} rows from ${page.finalUrl}`,
  );
}

async function failJob(job, error) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = job.attempts < job.max_attempts;

  await markJob(job, {
    status: retry ? "retry" : "failed",
    errorText: message.slice(0, 1000),
    resultSummary: { workerId },
    finishedAt: retry ? null : new Date().toISOString(),
    clearLock: true,
  });

  await sql`
    UPDATE bom_jobs
    SET job_stage = ${retry ? "encompass_worker_retry" : "encompass_worker_failed"},
        error_text = ${message.slice(0, 1000)},
        updated_at = now()
    WHERE id = ${job.bom_job_id}
  `;

  console.error(`[${workerId}] failed ${job.id}:`, message);
}

async function tick() {
  const job = await claimJob();
  if (!job) return false;

  try {
    await processJob(job);
  } catch (error) {
    await failJob(job, error);
  }

  return true;
}

console.log(`[${workerId}] Encompass worker started`);

do {
  const hadJob = await tick();
  if (once) break;
  if (!hadJob) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
} while (true);
