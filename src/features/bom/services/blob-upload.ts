import "server-only";
import { put } from "@vercel/blob";
import type { UploadedBomFile } from "./job-store";

function sanitizeFilename(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function uploadBomFileToBlob(input: {
  jobId: string;
  file: File;
  category: "identity" | "diagram";
}): Promise<UploadedBomFile> {
  const safeName = sanitizeFilename(input.file.name || "upload.bin");
  const pathname = `bom-jobs/${input.jobId}/${input.category}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, input.file, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    originalName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    size: input.file.size,
    category: input.category,
  };
}
