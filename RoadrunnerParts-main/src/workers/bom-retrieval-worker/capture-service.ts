import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { captureArtifacts } from "../../server/db/schema/retrieval-system";

const CAPTURES_ROOT = path.join(process.cwd(), "captures");

export async function saveArtifact(params: {
  modelNumber: string;
  filename: string;
  content: string;
  artifactType: string;
  url: string;
  jobId: string;
  modelId: string;
  db: any;
  httpStatus?: number;
}) {
  const { modelNumber, filename, content, artifactType, url, jobId, modelId, db, httpStatus } = params;

  // 1. Calculate Content Hash
  const hash = crypto.createHash("sha256").update(content).digest("hex");

  // 2. Save to File System
  const dirPath = path.join(CAPTURES_ROOT, modelNumber);
  const filePath = path.join(dirPath, filename);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");

  console.log(`[Capture] Saved artifact: ${filename} (Hash: ${hash.slice(0, 8)})`);

  // 3. Save to Database
  const [artifact] = await db.insert(captureArtifacts).values({
    modelId,
    jobId,
    url,
    artifactType,
    storagePath: filePath,
    contentHash: hash,
    httpStatus: httpStatus || 200,
    source: "encompass",
    capturedAt: new Date(),
  }).returning();

  return artifact;
}

export async function saveNetworkLog(params: {
  modelNumber: string;
  logs: any[];
  jobId: string;
  modelId: string;
  db: any;
}) {
  return saveArtifact({
    ...params,
    filename: "network_log.json",
    content: JSON.stringify(params.logs, null, 2),
    artifactType: "network_log",
    url: "internal://network-log",
  });
}
