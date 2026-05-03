import { chromium } from "playwright";
import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/blob";
import { resolveEncompassExplodedViewUrl } from "@/src/features/bom/services/encompass-model-index";
import { buildKnownEncompassAssemblyUrl } from "@/src/features/bom/services/source-tier-policy";
import { normalizeModelNumber } from "@/lib/encompass-routes";
import { recordCaptureArtifact } from "@/features/bom/services/retrieval-job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/encompass/assembly-overview-capture
 * 
 * Captures a full-page screenshot of an Encompass assembly overview page.
 * Stores the image in Vercel Blob by default to keep response payloads light.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      model?: string;
      canonUrl?: string;
      immediate?: boolean;
    };
    const { model, canonUrl, immediate = false } = body;

    const resolvedUrl = canonUrl?.trim()
      ? canonUrl
      : model?.trim()
        ? buildKnownEncompassAssemblyUrl(model) ||
          (await resolveEncompassExplodedViewUrl({ model })).selected?.url
        : null;

    if (!resolvedUrl) {
      return NextResponse.json({ error: "Missing canonUrl or model" }, { status: 400 });
    }

    // Launch browser with specific viewport for high-fidelity capture
    const browser = await chromium.launch({ headless: true });
    
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1400 },
        deviceScaleFactor: 1,
      });

      // Provider pages can keep background requests open, so do not wait on networkidle.
      await page.goto(resolvedUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => undefined);
      await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(3000);

      const buffer = await page.screenshot({
        fullPage: true,
        animations: "disabled",
      });

      let storedImageUrl = null;
      let base64 = null;

      // Rule: Use stored image URL by default. 
      // Rule: Use base64 only for immediate one-off calls because it makes payloads heavy.
      if (!immediate) {
        // Sanitize filename or use a hash to avoid collisions
        const safeId = Buffer.from(resolvedUrl)
          .toString("base64")
          .substring(0, 10)
          .replace(/[^a-zA-Z0-9]/g, "");
        const filename = `encompass/captures/${safeId}_${Date.now()}.png`;

        try {
          const blob = await uploadFile(filename, buffer, { access: "public" });
          storedImageUrl = blob.url;
        } catch (error) {
          console.warn("[Encompass Capture Blob Fallback]", error);
          base64 = buffer.toString("base64");
        }
      } else {
        base64 = buffer.toString("base64");
      }

      const inferredModel = (() => {
        if (model?.trim()) return normalizeModelNumber(model);
        try {
          const parsed = new URL(resolvedUrl);
          const parts = parsed.pathname.split("/").filter(Boolean);
          const maybeModel = parts[parts.length - 1] ?? "";
          return normalizeModelNumber(maybeModel);
        } catch {
          return "";
        }
      })();

      if (inferredModel) {
        await recordCaptureArtifact({
          normalizedModel: inferredModel,
          sourceUrl: resolvedUrl,
          artifactType: immediate ? "screenshot_inline" : "screenshot_blob",
          storagePath: storedImageUrl,
          metadata: {
            immediate,
            viewport: { width: 1600, height: 1400 },
            byteLength: buffer.byteLength,
            capturedBy: "api:assembly-overview-capture",
          },
        });
      }

      return NextResponse.json({
        status: "captured",
        mimeType: "image/png",
        storedImageUrl,
        base64: immediate ? base64 : undefined,
        context: {
          canonUrl: resolvedUrl,
          capturedAt: new Date().toISOString(),
        },
        canonUrl: resolvedUrl,
      });
    } finally {
      await browser.close();
    }
  } catch (error: unknown) {
    console.error("[Encompass Capture Error]", error);
    return NextResponse.json({
      error: "Failed to capture assembly overview",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
