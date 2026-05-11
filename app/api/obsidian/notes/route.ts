import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function safeSegment(value: unknown, fallback: string) {
  const segment = cleanText(value, 80)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "");
  return segment || fallback;
}

function slug(value: unknown) {
  return (
    safeSegment(value, "note")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "note"
  );
}

function yamlString(value: unknown) {
  return JSON.stringify(String(value ?? ""));
}

function frontmatter(input: Record<string, unknown>) {
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : ["roadrunner"];
  const source = cleanText(input.source, 120) || "bom-workspace";
  const kind = cleanText(input.kind, 80) || "console-note";
  const extra =
    input.frontmatter && typeof input.frontmatter === "object" && !Array.isArray(input.frontmatter)
      ? (input.frontmatter as Record<string, unknown>)
      : {};

  const lines = [
    "---",
    `title: ${yamlString(input.title)}`,
    `created: ${yamlString(new Date().toISOString())}`,
    `source: ${yamlString(source)}`,
    `kind: ${yamlString(kind)}`,
    `tags: [${tags.map(yamlString).join(", ")}]`,
  ];

  for (const [key, value] of Object.entries(extra)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${yamlString(value)}`);
  }

  lines.push("---", "");
  return lines.join("\n");
}

function vaultRoot() {
  const configured = cleanText(process.env.OBSIDIAN_VAULT_PATH, 600);
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  if (process.env.VERCEL) return path.join("/tmp", "roadrunner-obsidian-outbox");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "obsidian");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = cleanText(body.title, 180) || "Roadrunner console note";
  const content = cleanText(body.content, 20000);
  const folder = Array.isArray(body.folder)
    ? body.folder
    : cleanText(body.folder, 300).split(/[\\/]+/).filter(Boolean);
  const folderSegments = (folder.length ? folder : ["RoadrunnerParts", "Console"]).map(
    (segment: unknown, index: number) => safeSegment(segment, index === 0 ? "RoadrunnerParts" : "Console"),
  );
  const root = vaultRoot();
  const targetDir = path.join(/*turbopackIgnore: true*/ root, ...folderSegments);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const filename = `${timestamp}-${slug(title)}.md`;
  const targetPath = path.join(/*turbopackIgnore: true*/ targetDir, filename);
  const markdown = `${frontmatter({ ...body, title })}# ${title}\n\n${content || "_No body supplied._"}\n`;

  try {
    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, markdown, "utf8");
    return NextResponse.json({
      ok: true,
      persisted: true,
      root,
      path: targetPath,
      relativePath: path.relative(root, targetPath),
      markdown,
    });
  } catch (error) {
    return NextResponse.json(
      {
      ok: false,
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
      root,
      relativePath: path.join(/*turbopackIgnore: true*/ ...folderSegments, filename),
      markdown,
    },
      { status: 202 },
    );
  }
}
