import "server-only";
import { put, del, list } from "@vercel/blob";

// The '@vercel/blob' package automatically picks up BLOB_READ_WRITE_TOKEN from .env

export async function uploadFile(
  filename: string,
  content: Buffer | string | ReadableStream | Blob,
  options: Parameters<typeof put>[2] = { access: "public" },
) {
  return put(filename, content, options);
}

export async function deleteFile(url: string) {
  return del(url);
}

export async function listFiles() {
  return list();
}
