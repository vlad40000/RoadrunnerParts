import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
]);

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase()
    .slice(0, 48);
}

function cleanFileStem(value) {
  return (
    String(value || "image")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "image"
  );
}

function cleanText(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

async function upsertImageCandidates(partNumber, records) {
  let upserted = 0;
  for (const record of records) {
    const c = record.candidate || {};
    const imageUrl = cleanText(c.imageUrl, 1200);
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
        cleanText(c.thumbnailUrl || imageUrl, 1200),
        cleanText(c.pageUrl || imageUrl, 1200),
        cleanText(c.title, 220),
        cleanText(c.sourceDomain, 120),
        cleanText(c.source, 120),
        cleanText(c.reviewStatus, 160),
        Number.isFinite(Number(c.score)) ? Number(c.score) : 0,
        cleanText(c.blobPathname, 500),
        cleanText(c.remoteImageUrl, 1200),
        cleanText(c.localImagePath, 500),
        cleanText(record.mimeType || c.mimeType, 120),
        Number.isFinite(Number(record.byteLength || c.byteLength)) ? Number(record.byteLength || c.byteLength) : 0,
        JSON.stringify({
          uploader: "detail_editor_file_upload",
          originalName: cleanText(record.originalName, 260),
          uploadedAt: new Date().toISOString(),
        }),
      ],
    );

    upserted += 1;
  }

  return { upserted };
}

export async function POST(request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Image upload is not configured. Missing BLOB_READ_WRITE_TOKEN." },
        { status: 501 },
      );
    }

    const formData = await request.formData();
    const partNumber = cleanPartNumber(formData.get("partNumber"));
    const files = formData
      .getAll("images")
      .filter((item) => item && typeof item === "object" && typeof item.arrayBuffer === "function");

    if (!partNumber) {
      return NextResponse.json({ error: "Missing partNumber" }, { status: 400 });
    }

    if (!files.length) {
      return NextResponse.json({ error: "No images supplied" }, { status: 400 });
    }

    const uploadRecords = [];
    const skipped = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const file of files.slice(0, 24)) {
      const mimeType = String(file.type || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES.get(mimeType);
      if (!extension) {
        skipped.push({ name: file.name, reason: "unsupported_type", mimeType });
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skipped.push({ name: file.name, reason: "too_large", byteLength: file.size });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = `${partNumber}-${stamp}-${cleanFileStem(file.name)}${extension}`;
      const pathname = `ebay/detail-editor-images/${partNumber}/${fileName}`;
      const blob = await put(pathname, buffer, {
        access: "public",
        contentType: mimeType,
        allowOverwrite: true,
      });

      const candidate = {
        title: file.name,
        imageUrl: blob.url,
        thumbnailUrl: blob.url,
        pageUrl: blob.url,
        sourceDomain: "operator-upload",
        source: "detail_editor_file_upload",
        reviewStatus: "operator_uploaded_sale_photo",
        score: 1000,
        blobPathname: blob.pathname,
        byteLength: file.size,
        mimeType,
      };

      uploadRecords.push({
        candidate,
        fileName,
        originalName: file.name,
        byteLength: file.size,
        mimeType,
      });
    }

    if (uploadRecords.length) {
      try {
        const dbResult = await upsertImageCandidates(partNumber, uploadRecords);
        return NextResponse.json({
          ok: true,
          uploaded: uploadRecords.map((record) => record.candidate),
          skipped,
          dbPersist: {
            persisted: true,
            upserted: dbResult.upserted,
          },
        });
      } catch (error) {
        const cleanup = [];
        for (const record of uploadRecords) {
          try {
            await del(record.candidate.imageUrl);
            cleanup.push({ imageUrl: record.candidate.imageUrl, deleted: true });
          } catch (cleanupError) {
            cleanup.push({
              imageUrl: record.candidate.imageUrl,
              deleted: false,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        }

        return NextResponse.json(
          {
            error: "Image upload metadata persistence failed",
            details: error instanceof Error ? error.message : String(error),
            rollback: cleanup,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      uploaded: [],
      skipped,
      dbPersist: {
        persisted: true,
        upserted: 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Image upload failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
