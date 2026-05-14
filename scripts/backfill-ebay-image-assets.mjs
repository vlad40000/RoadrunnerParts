import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { list, put } from "@vercel/blob";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");
}

const sql = neon(DATABASE_URL);
const args = new Set(process.argv.slice(2));
const migrateLocalApproved = args.has("--migrate-local-approved");
const deleteLocalApproved = args.has("--delete-local-approved");
const requireBlobForLocal = migrateLocalApproved || deleteLocalApproved;
const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

if (requireBlobForLocal && !hasBlobToken) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required for --migrate-local-approved / --delete-local-approved");
}

const root = process.cwd();
const listingsPath = path.join(root, "scratch", "ebay-html-current", "listings.normalized.json");

function cleanText(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase()
    .slice(0, 48);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function upsertCandidate(partNumber, candidate, metadata = {}) {
  const imageUrl = cleanText(candidate.imageUrl || candidate.thumbnailUrl, 1200);
  if (!imageUrl) return false;

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
      JSON.stringify(metadata || {}),
    ],
  );

  return true;
}

async function loadListingsCandidates() {
  if (!(await fileExists(listingsPath))) return [];
  const parsed = JSON.parse(await fs.readFile(listingsPath, "utf8"));
  const listings = Array.isArray(parsed?.listings) ? parsed.listings : [];
  const out = [];
  for (const listing of listings) {
    const partNumber = cleanPartNumber(listing?.partNumber);
    if (!partNumber) continue;
    const candidates = Array.isArray(listing?.imageCandidates) ? listing.imageCandidates : [];
    for (const c of candidates) {
      out.push({ partNumber, candidate: c, source: "listings.normalized" });
    }
  }
  return out;
}

async function loadBlobStateCandidates() {
  if (!hasBlobToken) return [];
  try {
    const result = await list({ prefix: "ebay/detail-editor-state/current.json", limit: 1 });
    const stateBlob = result.blobs.find((item) => item.pathname === "ebay/detail-editor-state/current.json");
    if (!stateBlob?.url) return [];
    const stateUrl = new URL(stateBlob.url);
    stateUrl.searchParams.set("ts", String(Date.now()));
    const response = await fetch(stateUrl.toString(), { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json();
    const edits = payload && typeof payload.edits === "object" ? payload.edits : {};
    const out = [];
    for (const [key, edit] of Object.entries(edits)) {
      const partNumber = cleanPartNumber(key);
      if (!partNumber) continue;
      const candidates = Array.isArray(edit?.imageCandidates) ? edit.imageCandidates : [];
      for (const c of candidates) {
        out.push({ partNumber, candidate: c, source: "detail-editor-state" });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function migrateLocalApprovedImages() {
  const approvedRoot = path.join(root, "scratch", "approved-images");
  if (!(await fileExists(approvedRoot))) {
    return { scanned: 0, uploaded: 0, upserted: 0, deleted: 0, skipped: 0 };
  }

  const files = await walkFiles(approvedRoot);
  let uploaded = 0;
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) {
      skipped += 1;
      continue;
    }

    const rel = path.relative(approvedRoot, fullPath);
    const segments = rel.split(path.sep);
    const partNumber = cleanPartNumber(segments[0]);
    if (!partNumber) {
      skipped += 1;
      continue;
    }

    if (!migrateLocalApproved) {
      skipped += 1;
      continue;
    }

    const content = await fs.readFile(fullPath);
    const fileName = path.basename(fullPath);
    const mimeType = ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".avif"
          ? "image/avif"
          : "image/jpeg";
    const pathname = `ebay/migrated-approved-images/${partNumber}/${fileName}`;
    const blob = await put(pathname, content, {
      access: "public",
      contentType: mimeType,
      allowOverwrite: true,
    });
    uploaded += 1;

    const ok = await upsertCandidate(
      partNumber,
      {
        title: fileName,
        imageUrl: blob.url,
        thumbnailUrl: blob.url,
        pageUrl: blob.url,
        sourceDomain: "operator-upload",
        source: "approved_images_backfill",
        reviewStatus: "operator_approved_sale_photo",
        score: 1000,
        blobPathname: blob.pathname,
        mimeType,
        byteLength: content.length,
      },
      {
        backfillSource: "scratch/approved-images",
        localOriginalPath: fullPath,
        migratedAt: new Date().toISOString(),
      },
    );

    if (ok) {
      upserted += 1;
      if (deleteLocalApproved) {
        await fs.rm(fullPath, { force: true });
        deleted += 1;
      }
    }
  }

  return { scanned: files.length, uploaded, upserted, deleted, skipped };
}

async function main() {
  const sources = [
    ...(await loadListingsCandidates()),
    ...(await loadBlobStateCandidates()),
  ];

  const dedup = new Map();
  for (const entry of sources) {
    const partNumber = cleanPartNumber(entry.partNumber);
    const imageUrl = cleanText(entry?.candidate?.imageUrl || entry?.candidate?.thumbnailUrl, 1200).toLowerCase();
    if (!partNumber || !imageUrl) continue;
    const key = `${partNumber}::${imageUrl}`;
    if (!dedup.has(key)) dedup.set(key, entry);
  }

  let upserted = 0;
  let skipped = 0;
  for (const entry of dedup.values()) {
    const ok = await upsertCandidate(entry.partNumber, entry.candidate, {
      backfillSource: entry.source,
      migratedAt: new Date().toISOString(),
    });
    if (ok) upserted += 1;
    else skipped += 1;
  }

  const localResult = await migrateLocalApprovedImages();

  const [counts] = await sql.query(
    `SELECT count(*)::int AS total FROM ebay_listing_image_asset`,
  );

  console.log(JSON.stringify({
    ok: true,
    fromListingsAndState: {
      scanned: dedup.size,
      upserted,
      skipped,
    },
    localApproved: localResult,
    tableCount: Number(counts?.total || 0),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
