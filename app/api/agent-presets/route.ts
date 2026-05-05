import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/server/db";
import { agentPresets } from "@/src/server/db/schema/agent-presets";
import { eq, desc } from "drizzle-orm";

export const runtime = "edge"; // Use Edge Runtime as per global rules
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const presets = await db
      .select()
      .from(agentPresets)
      .where(eq(agentPresets.isActive, true))
      .orderBy(desc(agentPresets.updatedAt));

    return NextResponse.json({
      ok: true,
      presets,
    });
  } catch (error: any) {
    console.error("Failed to fetch presets:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, content, scenarioType, metadata } = body;

    if (!name || !content) {
      return NextResponse.json({ ok: false, error: "Name and content are required" }, { status: 400 });
    }

    let result;
    if (id && id.length > 10) { // Simple check for UUID
      // Update
      result = await db
        .update(agentPresets)
        .set({
          name,
          content,
          scenarioType,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(agentPresets.id, id))
        .returning();
    } else {
      // Insert
      result = await db
        .insert(agentPresets)
        .values({
          name,
          content,
          scenarioType,
          metadata,
        })
        .returning();
    }

    return NextResponse.json({
      ok: true,
      preset: result[0],
    });
  } catch (error: any) {
    console.error("Failed to save preset:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID is required" }, { status: 400 });
    }

    // Soft delete
    await db
      .update(agentPresets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(agentPresets.id, id));

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Failed to delete preset:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
