import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

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

function safeSegment(value, fallback) {
  const segment = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .slice(0, 120);
  return segment || fallback;
}

function vaultRoot() {
  const configured = String(process.env.OBSIDIAN_VAULT_PATH || "").trim();
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  if (process.env.VERCEL) return "";
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "obsidian");
}

function slashPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

async function mirrorImagesToVault({ partNumber, stamp, records }) {
  const root = vaultRoot();
  if (!root) {
    return {
      persisted: false,
      warning: "OBSIDIAN_VAULT_PATH is not configured for this server.",
      files: [],
    };
  }

  const folderSegments = ["eBay Related", "Listing Images", partNumber].map((segment, index) =>
    safeSegment(segment, index === 2 ? "PART" : "eBay Related"),
  );
  const targetDir = path.join(/*turbopackIgnore: true*/ root, ...folderSegments);
  const savedFiles = [];

  await mkdir(targetDir, { recursive: true });

  for (const [index, record] of records.entries()) {
    const vaultFileName = safeSegment(record.fileName, `${partNumber}-${stamp}-${index + 1}`);
    const targetPath = path.join(/*turbopackIgnore: true*/ targetDir, vaultFileName);
    await writeFile(targetPath, record.buffer);
    savedFiles.push({
      fileName: vaultFileName,
      path: targetPath,
      relativePath: slashPath(path.relative(root, targetPath)),
      originalName: record.originalName,
      blobUrl: record.candidate.imageUrl,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
    });
  }

  const noteName = safeSegment(`${partNumber}-${stamp}-images.md`, `${partNumber}-images.md`);
  const notePath = path.join(/*turbopackIgnore: true*/ targetDir, noteName);
  const noteLines = [
    "---",
    `title: ${yamlString(`${partNumber} listing image upload`)}`,
    `created: ${yamlString(new Date().toISOString())}`,
    `source: ${yamlString("ebay-detail-editor")}`,
    `kind: ${yamlString("ebay-listing-images")}`,
    `partNumber: ${yamlString(partNumber)}`,
    `tags: [${["roadrunner", "ebay", "listing-images", partNumber.toLowerCase()].map(yamlString).join(", ")}]`,
    "---",
    "",
    `# ${partNumber} Listing Images`,
    "",
    "Uploaded through the Roadrunner eBay detail editor.",
    "",
    ...savedFiles.flatMap((file, index) => [
      `## Image ${index + 1}`,
      "",
      `![[${file.fileName}]]`,
      "",
      `- Original file: ${file.originalName || file.fileName}`,
      `- Live URL: ${file.blobUrl}`,
      `- Vault path: ${file.relativePath}`,
      "",
    ]),
  ];
  await writeFile(notePath, `${noteLines.join("\n")}\n`, "utf8");

  return {
    persisted: true,
    root,
    notePath,
    noteRelativePath: slashPath(path.relative(root, notePath)),
    files: savedFiles,
  };
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
        buffer,
        fileName,
        originalName: file.name,
        byteLength: file.size,
        mimeType,
      });
    }

    let vaultMirror = { persisted: false, files: [] };
    if (uploadRecords.length) {
      try {
        vaultMirror = await mirrorImagesToVault({ partNumber, stamp, records: uploadRecords });
        for (const [index, file] of vaultMirror.files.entries()) {
          if (!uploadRecords[index]) continue;
          uploadRecords[index].candidate.vaultPath = file.path;
          uploadRecords[index].candidate.vaultRelativePath = file.relativePath;
          uploadRecords[index].candidate.vaultNotePath = vaultMirror.notePath || "";
          uploadRecords[index].candidate.vaultNoteRelativePath = vaultMirror.noteRelativePath || "";
        }
      } catch (error) {
        vaultMirror = {
          persisted: false,
          warning: error instanceof Error ? error.message : String(error),
          files: [],
        };
      }
    }

    return NextResponse.json({
      ok: true,
      uploaded: uploadRecords.map((record) => record.candidate),
      skipped,
      vaultMirror,
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
