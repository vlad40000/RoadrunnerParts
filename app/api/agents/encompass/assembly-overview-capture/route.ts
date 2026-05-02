import { chromium } from "playwright";
import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/blob";

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
      canonUrl?: string;
      immediate?: boolean;
    };
    const { canonUrl, immediate = false } = body;

    if (!canonUrl) {
      return NextResponse.json({ error: "Missing canonUrl" }, { status: 400 });
    }

    // Launch browser with specific viewport for high-fidelity capture
    const browser = await chromium.launch({ headless: true });
    
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1400 },
        deviceScaleFactor: 1,
      });

      // Navigate to Encompass canonical URL
      await page.goto(canonUrl, {
        waitUntil: "networkidle",
        timeout: 45000,
      });

      // Brief wait for any client-side hydration or lazy-loaded assets
      await page.waitForTimeout(2000);

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
        const safeId = Buffer.from(canonUrl)
          .toString("base64")
          .substring(0, 10)
          .replace(/[^a-zA-Z0-9]/g, "");
        const filename = `encompass/captures/${safeId}_${Date.now()}.png`;

        const blob = await uploadFile(filename, buffer, { access: "public" });
        storedImageUrl = blob.url;
      } else {
        base64 = buffer.toString("base64");
      }

      return NextResponse.json({
        status: "captured",
        mimeType: "image/png",
        storedImageUrl,
        base64: immediate ? base64 : undefined,
        context: {
          canonUrl,
          capturedAt: new Date().toISOString(),
        },
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
