import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAIL_STATE_PATH = "ebay/detail-editor-state/current.json";

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase()
    .slice(0, 48);
}

function cleanUpdates(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const quantity = Number(input.quantity || 1);
  return {
    title: String(input.title || "").slice(0, 220),
    ebayBuyNow: String(input.ebayBuyNow || "").slice(0, 80),
    description: String(input.description || "").slice(0, 5000),
    specs: input.specs && typeof input.specs === "object" && !Array.isArray(input.specs) ? input.specs : {},
    condition: String(input.condition || "").slice(0, 120),
    quantity: Number.isFinite(quantity) ? Math.max(1, quantity) : 1,
    shipping: String(input.shipping || "").slice(0, 120),
    packageDetails: cleanPackageDetails(input.packageDetails),
    returns: input.returns !== false,
    status: String(input.status || "draft").slice(0, 40),
    imageCandidates: cleanImageCandidates(input.imageCandidates),
  };
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
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
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

export async function POST(request) {
  try {
    const body = await request.json();
    const partNumber = cleanPartNumber(body.partNumber);
    const updates = cleanUpdates(body.updates);

    if (!partNumber) {
      return NextResponse.json({ error: "Missing partNumber" }, { status: 400 });
    }

    const savedAt = new Date().toISOString();
    const previous = process.env.BLOB_READ_WRITE_TOKEN ? await readBlobState().catch(() => null) : null;
    const edits = previous && typeof previous.edits === "object" && !Array.isArray(previous.edits)
      ? previous.edits
      : {};
    edits[partNumber] = {
      ...(edits[partNumber] || {}),
      ...updates,
      partNumber,
      lastModified: savedAt,
    };

    let blobUrl = "";
    if (process.env.BLOB_READ_WRITE_TOKEN) {
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
        },
      );
      blobUrl = blob.url;
    }

    const localListing = saveLocal(partNumber, updates);

    return NextResponse.json({
      success: true,
      ok: true,
      persisted: Boolean(blobUrl || localListing),
      storage: blobUrl ? "vercel-blob" : localListing ? "local-file" : "memory-only",
      stateUrl: blobUrl,
      listing: edits[partNumber],
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
