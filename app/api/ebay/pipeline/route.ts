import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/src/server/db";
import { generateEbayDescription, generateEbayTitle } from "@/src/lib/ebay-listing-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function rowNumber(row: Record<string, unknown>, key: string) {
  const parsed = Number(row[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLimit(value: unknown, fallback = 25) {
  return Math.max(1, Math.min(100, Math.floor(asNumber(value, fallback))));
}

function marketDemand(activeCount: number | null, soldCount: number | null) {
  const active = activeCount ?? 0;
  const sold = soldCount ?? 0;
  if (sold >= 20 && active <= 10) return "critical";
  if (sold >= 10) return "high";
  if (sold >= 3) return "medium";
  return "low";
}

async function loadPipelineSnapshot(limit: number) {
  const [statsRows, signalRows, draftRows] = await Promise.all([
    sql.query(`
      SELECT
        (SELECT count(*)::int FROM appliance_inventory_queue WHERE ebay_survey_status = 'pending') AS pending_survey,
        (SELECT count(*)::int FROM appliance_inventory_queue WHERE ebay_survey_status IN ('complete', 'surveyed')) AS surveyed,
        (SELECT count(*)::int FROM part_market_signal) AS market_signals,
        (SELECT count(*)::int FROM channel_listing WHERE channel = 'ebay' AND listing_status = 'draft') AS draft_listings
    `),
    sql.query(
      `
      SELECT DISTINCT ON (s.part_number, s.normalized_model)
        s.part_number,
        s.normalized_model,
        coalesce(b.part_name, s.raw->>'partName', 'Appliance Part') AS part_name,
        s.ebay_active_count,
        s.ebay_sold_count,
        s.sell_through_rate,
        s.median_sold_price,
        s.average_sold_price,
        s.net_expected,
        s.confidence,
        s.checked_at
      FROM part_market_signal s
      LEFT JOIN bom_part b
        ON b.part_number = s.part_number
       AND (b.normalized_model = s.normalized_model OR s.normalized_model IS NULL)
      ORDER BY s.part_number, s.normalized_model, s.net_expected DESC NULLS LAST, s.checked_at DESC
      LIMIT $1
    `,
      [limit],
    ),
    sql.query(
      `
      SELECT
        l.id::text,
        l.title,
        l.listing_price,
        l.listing_status,
        l.raw,
        i.part_number,
        i.part_name,
        i.normalized_model
      FROM channel_listing l
      LEFT JOIN part_inventory i ON i.id = l.part_inventory_id
      WHERE l.channel = 'ebay'
      ORDER BY l.id DESC
      LIMIT $1
    `,
      [limit],
    ),
  ]);

  const stats = statsRows[0] || {};
  const signalRecords = signalRows as Array<Record<string, unknown>>;
  const draftRecords = draftRows as Array<Record<string, unknown>>;
  const signals = signalRecords.map((row) => {
    const activeCount = rowNumber(row, "ebay_active_count");
    const soldCount = rowNumber(row, "ebay_sold_count");
    return {
      partNumber: String(row.part_number || ""),
      normalizedModel: row.normalized_model || null,
      name: String(row.part_name || "Appliance Part"),
      active: activeCount ?? 0,
      sold: soldCount ?? 0,
      sellThrough: rowNumber(row, "sell_through_rate"),
      medianPrice: rowNumber(row, "median_sold_price"),
      averagePrice: rowNumber(row, "average_sold_price"),
      netExpected: rowNumber(row, "net_expected"),
      demand: marketDemand(activeCount, soldCount),
      confidence: row.confidence || null,
      checkedAt: row.checked_at || null,
    };
  });

  return {
    stats: {
      pendingSurvey: Number(stats.pending_survey || 0),
      surveyed: Number(stats.surveyed || 0),
      marketSignals: Number(stats.market_signals || 0),
      draftListings: Number(stats.draft_listings || 0),
    },
    signals,
    drafts: draftRecords.map((row) => ({
      id: String(row.id || ""),
      partNumber: row.part_number || null,
      partName: row.part_name || null,
      normalizedModel: row.normalized_model || null,
      title: row.title || null,
      listingPrice: rowNumber(row, "listing_price"),
      listingStatus: row.listing_status || null,
      description: row.raw && typeof row.raw === "object" ? (row.raw as any).description || null : null,
    })),
  };
}

async function prepareDraftListings(input: {
  limit: number;
  minNetExpected: number;
  dryRun: boolean;
}) {
  const rows = (await sql.query(
    `
    SELECT DISTINCT ON (s.part_number, s.normalized_model, m.id)
      s.part_number,
      s.normalized_model,
      s.median_sold_price,
      s.net_expected,
      m.id AS machine_id,
      m.brand,
      coalesce(b.part_name, s.raw->>'partName', 'Appliance Part') AS part_name
    FROM part_market_signal s
    JOIN machine_inventory m ON s.normalized_model = m.normalized_model
    LEFT JOIN bom_part b
      ON s.part_number = b.part_number
     AND s.normalized_model = b.normalized_model
    LEFT JOIN part_inventory i
      ON s.part_number = i.part_number
     AND m.id = i.machine_id
    WHERE s.net_expected >= $1
      AND i.id IS NULL
    ORDER BY s.part_number, s.normalized_model, m.id, s.net_expected DESC NULLS LAST
    LIMIT $2
  `,
    [input.minNetExpected, input.limit],
  )) as Array<Record<string, unknown>>;

  const drafts = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    const partNumber = String(row.part_number || "").trim().toUpperCase();
    const partName = String(row.part_name || "Appliance Part").trim();
    const normalizedModel = String(row.normalized_model || "").trim().toUpperCase();
    const price = asMoney(row.median_sold_price) ?? asMoney(row.net_expected) ?? 0;
    const title = generateEbayTitle({
      brand: String(row.brand || "OEM"),
      partNumber,
      partName,
      condition: "used",
      model: normalizedModel,
    });
    const description = generateEbayDescription({
      brand: String(row.brand || "OEM"),
      partNumber,
      partName,
      condition: "used",
      model: normalizedModel,
    });

    const draft = {
      partNumber,
      partName,
      normalizedModel,
      machineId: String(row.machine_id || ""),
      title,
      listingPrice: price,
      netExpected: asMoney(row.net_expected),
      description,
    };
    drafts.push(draft);

    if (input.dryRun) continue;

    const partInventoryRows = (await sql.query(
      `
      WITH inserted AS (
        INSERT INTO part_inventory (
          machine_id, normalized_model, part_number, part_name, condition, tested_status, quantity
        )
        SELECT $1, $2, $3, $4, 'used', 'pending', 1
        WHERE NOT EXISTS (
          SELECT 1 FROM part_inventory WHERE machine_id = $1 AND part_number = $3
        )
        RETURNING id
      )
      SELECT id FROM inserted
      UNION ALL
      SELECT id FROM part_inventory WHERE machine_id = $1 AND part_number = $3
      LIMIT 1
    `,
      [draft.machineId, normalizedModel, partNumber, partName],
    )) as Array<Record<string, unknown>>;
    const partInventory = partInventoryRows[0];

    if (!partInventory?.id) continue;

    await sql.query(
      `
      INSERT INTO channel_listing (
        part_inventory_id, channel, title, listing_price, listing_status, raw
      )
      SELECT $1, 'ebay', $2, $3, 'draft', $4::jsonb
      WHERE NOT EXISTS (
        SELECT 1
        FROM channel_listing
        WHERE part_inventory_id = $1
          AND channel = 'ebay'
          AND listing_status IN ('draft', 'active')
      )
    `,
      [
        partInventory.id,
        title,
        price,
        JSON.stringify({
          description,
          generated_at: new Date().toISOString(),
          generated_by: "ebay_pipeline_api",
          source: "part_market_signal",
          net_expected: draft.netExpected,
        }),
      ],
    );
  }

  return {
    dryRun: input.dryRun,
    preparedCount: drafts.length,
    drafts,
  };
}

export async function GET(req: NextRequest) {
  try {
    const limit = normalizeLimit(req.nextUrl.searchParams.get("limit"), 25);
    return NextResponse.json({
      ok: true,
      ...(await loadPipelineSnapshot(limit)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load eBay pipeline state.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "prepare_drafts");

    if (action !== "prepare_drafts") {
      return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
    }

    const result = await prepareDraftListings({
      limit: normalizeLimit(body?.limit, 25),
      minNetExpected: Math.max(0, asNumber(body?.minNetExpected, 15)),
      dryRun: body?.dryRun === true,
    });

    return NextResponse.json({
      ok: true,
      action,
      ...result,
      ...(await loadPipelineSnapshot(25)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to run eBay pipeline action.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
