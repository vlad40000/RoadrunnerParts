import crypto from "crypto";

/**
 * Simple in-memory store for agent assets (HTML pages, partial JSONs).
 * In a production scenario, this could be backed by Vercel Blob or Redis.
 */
class AssetStore {
  private assets = new Map<string, string>();

  save(content: string): string {
    const id = crypto.randomUUID();
    this.assets.set(id, content);
    return id;
  }

  get(id: string): string | null {
    return this.assets.get(id) || null;
  }

  delete(id: string) {
    this.assets.delete(id);
  }
}

export const agentAssetStore = new AssetStore();
