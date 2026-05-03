import { NextRequest, NextResponse } from "next/server";
import { runEncompassSupervisor } from "@/browser-agent/encompass-supervisor.mjs";

export const runtime = "nodejs"; // Playwright requires Node.js runtime

export async function POST(req: NextRequest) {
  try {
    const { model, url } = await req.json();

    if (!model && !url) {
      return NextResponse.json({ error: "Model or URL is required" }, { status: 400 });
    }

    console.log(`[API] Triggering Encompass Supervisor for ${model || url}`);

    const result = await runEncompassSupervisor({
      model,
      url,
      headless: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Supervisor error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
