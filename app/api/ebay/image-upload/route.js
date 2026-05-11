import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

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

    const uploaded = [];
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

      const fileName = `${partNumber}-${stamp}-${cleanFileStem(file.name)}${extension}`;
      const pathname = `ebay/detail-editor-images/${partNumber}/${fileName}`;
      const blob = await put(pathname, file, {
        access: "public",
        contentType: mimeType,
        allowOverwrite: true,
      });

      uploaded.push({
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
      });
    }

    return NextResponse.json({
      ok: true,
      uploaded,
      skipped,
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
