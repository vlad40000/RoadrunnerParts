import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAIL_STATE_PATH = "ebay/detail-editor-state/current.json";

function cleanText(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

async function upsertImageCandidates(partNumber, candidates) {
  let upserted = 0;
  for (const rawCandidate of Array.isArray(candidates) ? candidates : []) {
    const candidate = rawCandidate && typeof rawCandidate === "object" ? rawCandidate : {};
    const imageUrl = cleanText(candidate.imageUrl || candidate.thumbnailUrl, 1200);
    if (!imageUrl) continue;

    await sql.query(
      `
      INSERT INTO ebay_listing_image_asset (
        part_number,
        image_url,
        thumbnail_url,
        page_url,
        title,
        source_domain,
        source,
        review_status,
        score,
        blob_pathname,
        remote_image_url,
        local_image_path,
        mime_type,
        byte_length,
        metadata,
        first_seen_at,
        last_seen_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15::jsonb,
        now(),
        now(),
        now()
      )
      ON CONFLICT (part_number, image_url)
      DO UPDATE SET
        thumbnail_url = EXCLUDED.thumbnail_url,
        page_url = EXCLUDED.page_url,
        title = EXCLUDED.title,
        source_domain = EXCLUDED.source_domain,
        source = EXCLUDED.source,
        review_status = EXCLUDED.review_status,
        score = EXCLUDED.score,
        blob_pathname = EXCLUDED.blob_pathname,
        remote_image_url = EXCLUDED.remote_image_url,
        local_image_path = EXCLUDED.local_image_path,
        mime_type = EXCLUDED.mime_type,
        byte_length = EXCLUDED.byte_length,
        metadata = EXCLUDED.metadata,
        last_seen_at = now(),
        updated_at = now()
    `,
      [
        partNumber,
        imageUrl,
        cleanText(candidate.thumbnailUrl || imageUrl, 1200),
        cleanText(candidate.pageUrl || imageUrl, 1200),
        cleanText(candidate.title, 220),
        cleanText(candidate.sourceDomain, 120),
        cleanText(candidate.source, 120),
        cleanText(candidate.reviewStatus, 160),
        Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : 0,
        cleanText(candidate.blobPathname, 500),
        cleanText(candidate.remoteImageUrl, 1200),
        cleanText(candidate.localImagePath, 500),
        cleanText(candidate.mimeType, 120),
        Number.isFinite(Number(candidate.byteLength)) ? Number(candidate.byteLength) : 0,
        JSON.stringify({
          uploader: "detail_editor_save",
          savedAt: new Date().toISOString(),
        }),
      ],
    );
    upserted += 1;
  }

  return { upserted };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase()
    .slice(0, 48);
}

function cleanUpdates(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const updates = {};

  // Only include fields that are explicitly present in the input
  if (Object.prototype.hasOwnProperty.call(input, "title"))
    updates.title = String(input.title || "").slice(0, 220);
  if (Object.prototype.hasOwnProperty.call(input, "ebayBuyNow"))
    updates.ebayBuyNow = String(input.ebayBuyNow || "").slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(input, "description"))
    updates.description = String(input.description || "").slice(0, 5000);
  if (Object.prototype.hasOwnProperty.call(input, "specs"))
    updates.specs = input.specs && typeof input.specs === "object" && !Array.isArray(input.specs) ? input.specs : {};
  if (Object.prototype.hasOwnProperty.call(input, "condition"))
    updates.condition = String(input.condition || "").slice(0, 120);
  if (Object.prototype.hasOwnProperty.call(input, "quantity")) {
    const quantity = Number(input.quantity || 1);
    updates.quantity = Number.isFinite(quantity) ? Math.max(1, quantity) : 1;
  }
  if (Object.prototype.hasOwnProperty.call(input, "shipping"))
    updates.shipping = String(input.shipping || "").slice(0, 120);
  if (Object.prototype.hasOwnProperty.call(input, "packageDetails"))
    updates.packageDetails = cleanPackageDetails(input.packageDetails);
  if (Object.prototype.hasOwnProperty.call(input, "returns"))
    updates.returns = input.returns !== false;
  if (Object.prototype.hasOwnProperty.call(input, "status"))
    updates.status = String(input.status || "draft").slice(0, 40);
  if (Object.prototype.hasOwnProperty.call(input, "imageCandidates"))
    updates.imageCandidates = cleanImageCandidates(input.imageCandidates);

  return updates;
}


function cleanPackageNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  return String(number).slice(0, 12);
}

function cleanPackageDetails(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    weightLb: cleanPackageNumber(input.weightLb),
    weightOz: cleanPackageNumber(input.weightOz),
    lengthIn: cleanPackageNumber(input.lengthIn),
    widthIn: cleanPackageNumber(input.widthIn),
    heightIn: cleanPackageNumber(input.heightIn),
  };
}

function cleanImageCandidates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((candidate) => {
      const input = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
      const imageUrl = String(input.imageUrl || input.thumbnailUrl || "").trim().slice(0, 1200);
      if (!imageUrl) return null;
      return {
        title: String(input.title || "").trim().slice(0, 220),
        imageUrl,
        thumbnailUrl: String(input.thumbnailUrl || imageUrl).trim().slice(0, 1200),
        pageUrl: String(input.pageUrl || imageUrl).trim().slice(0, 1200),
        sourceDomain: String(input.sourceDomain || "operator-added").trim().slice(0, 120),
        source: String(input.source || "detail_editor").trim().slice(0, 120),
        reviewStatus: String(input.reviewStatus || "operator_added_needs_review").trim().slice(0, 160),
        score: Number(input.score || 0),
        blobPathname: String(input.blobPathname || "").trim().slice(0, 500),
        remoteImageUrl: String(input.remoteImageUrl || "").trim().slice(0, 1200),
        localImagePath: String(input.localImagePath || "").trim().slice(0, 500),
        vaultPath: String(input.vaultPath || "").trim().slice(0, 1200),
        vaultRelativePath: String(input.vaultRelativePath || "").trim().slice(0, 500),
        vaultNotePath: String(input.vaultNotePath || "").trim().slice(0, 1200),
        vaultNoteRelativePath: String(input.vaultNoteRelativePath || "").trim().slice(0, 500),
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

async function readBlobState() {
  const result = await list({ prefix: DETAIL_STATE_PATH, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === DETAIL_STATE_PATH);
  if (!blob) return null;
  const stateUrl = new URL(blob.url);
  stateUrl.searchParams.set("rrpStateTs", String(Date.now()));
  const response = await fetch(stateUrl.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  return readJsonResponse(response);
}

function saveLocal(partNumber, updates) {
  const filePath = path.join(process.cwd(), "scratch/ebay-html-current/listings.normalized.json");
  if (!fs.existsSync(filePath)) return null;

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const listings = data.listings || [];
  const index = listings.findIndex(
    (listing) => cleanPartNumber(listing.partNumber) === partNumber,
  );

  if (index === -1) return null;

  listings[index] = {
    ...listings[index],
    ...updates,
    lastModified: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify({ ...data, listings }, null, 2));
  return listings[index];
}

function readLocalListing(partNumber) {
  const filePath = path.join(process.cwd(), "scratch/ebay-html-current/listings.normalized.json");
  if (!fs.existsSync(filePath)) return null;

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const listings = Array.isArray(data.listings) ? data.listings : [];
  return listings.find((listing) => cleanPartNumber(listing.partNumber) === partNumber) || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const partNumber = cleanPartNumber(body.partNumber);
    const updates = cleanUpdates(body.updates);
    const imageSaveMode = String(body.imageSaveMode || "").trim();

    if (!partNumber) {
      return NextResponse.json({ error: "Missing partNumber" }, { status: 400 });
    }

    const savedAt = new Date().toISOString();
    const previous = process.env.BLOB_READ_WRITE_TOKEN ? await readBlobState().catch(() => null) : null;
    const edits = previous && typeof previous.edits === "object" && !Array.isArray(previous.edits)
      ? previous.edits
      : {};
    const previousPartEdit = edits[partNumber] || {};
    const previousImages = Array.isArray(previousPartEdit.imageCandidates)
      ? previousPartEdit.imageCandidates
      : [];
    const nextPartEdit = {
      ...previousPartEdit,
      ...updates,
      partNumber,
      lastModified: savedAt,
    };
    if (
      !Object.prototype.hasOwnProperty.call(updates, "imageCandidates") &&
      previousImages.length
    ) {
      nextPartEdit.imageCandidates = previousImages;
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, "imageCandidates") &&
      imageSaveMode !== "replace" &&
      previousImages.length > updates.imageCandidates.length
    ) {
      nextPartEdit.imageCandidates = previousImages;
    }
    edits[partNumber] = nextPartEdit;

    let dbPersist = { persisted: false, upserted: 0, warning: "" };
    if (Array.isArray(nextPartEdit.imageCandidates) && nextPartEdit.imageCandidates.length) {
      try {
        const result = await upsertImageCandidates(partNumber, nextPartEdit.imageCandidates);
        dbPersist = { persisted: true, upserted: result.upserted, warning: "" };
      } catch (error) {
        dbPersist = {
          persisted: false,
          upserted: 0,
          warning: error instanceof Error ? error.message : String(error),
        };
      }
    }

    let blobUrl = "";
    let blobError = "";
    let localListing = null;
    let localError = "";

    try {
      localListing = saveLocal(partNumber, updates);
    } catch (error) {
      localError = error instanceof Error ? error.message : String(error);
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(
          DETAIL_STATE_PATH,
          JSON.stringify({
            source: "roadrunner-ebay-detail-editor",
            savedAt,
            editCount: Object.keys(edits).length,
            edits,
          }, null, 2),
          {
            access: "public",
            contentType: "application/json",
            allowOverwrite: true,
            addRandomSuffix: false,
          },
        );
        blobUrl = blob.url;
      } catch (error) {
        blobError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!blobUrl && !localListing) {
      return NextResponse.json(
        {
          error: "Save failed",
          details: blobError || localError || `No editable listing found for ${partNumber}`,
          blobError,
          localError,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      ok: true,
      persisted: Boolean(blobUrl || localListing),
      storage: blobUrl ? "vercel-blob" : localListing ? "local-file" : "memory-only",
      warning: !blobUrl && blobError ? `Blob save skipped: ${blobError}` : "",
      stateUrl: blobUrl,
      listing: edits[partNumber],
      imageCount: edits[partNumber].imageCandidates?.length || 0,
      leadImageUrl: edits[partNumber].imageCandidates?.[0]?.imageUrl || "",
      dbPersist,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Save error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const partNumber = cleanPartNumber(searchParams.get("partNumber"));
    if (!partNumber) {
      return NextResponse.json({ error: "Missing partNumber" }, { status: 400 });
    }

    const state = process.env.BLOB_READ_WRITE_TOKEN ? await readBlobState().catch(() => null) : null;
    const edits = state && typeof state.edits === "object" && !Array.isArray(state.edits)
      ? state.edits
      : {};
    const listing = edits[partNumber] || readLocalListing(partNumber);

    return NextResponse.json({
      ok: true,
      persisted: Boolean(listing),
      listing,
      imageCount: listing?.imageCandidates?.length || 0,
      leadImageUrl: listing?.imageCandidates?.[0]?.imageUrl || "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Save state read error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
