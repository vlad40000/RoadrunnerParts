import { put, del, list } from '@vercel/blob';

// The '@vercel/blob' package automatically picks up BLOB_READ_WRITE_TOKEN from .env

export async function uploadFile(filename, content, options = { access: 'public' }) {
  return put(filename, content, options);
}

export async function deleteFile(url) {
  return del(url);
}

export async function listFiles() {
  return list();
}
