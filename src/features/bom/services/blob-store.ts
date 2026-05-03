import "server-only";
import { put } from "@vercel/blob";
import crypto from "crypto";

/**
 * Uploads raw source evidence (HTML/Text) to Vercel Blob to save DB space.
 * Path: /sources/{jobId}/{sourceHash}.html
 */
export async function uploadSourceEvidence(
  jobId: string, 
  content: string, 
  options: { contentType?: string } = {}
): Promise<string> {
  const hash = crypto.createHash("md5").update(content).digest("hex");
  const filename = `sources/${jobId}/${hash}.html`;

  try {
    const { url } = await put(filename, content, {
      access: "public",
      contentType: options.contentType || "text/html",
      addRandomSuffix: false, // Stable URLs based on content hash
    });

    return url;
  } catch (error) {
    console.error("[BlobStore] Failed to upload source evidence:", error);
    // Fallback to null - we'd rather lose the evidence than crash the job
    throw error;
  }
}
