import "server-only";
import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bomJobGroups } from "@/server/db/schema/bom-job-groups";

export type BomJobGroupRecord = {
  source: string;
  sourceUrl: string;
  sourceText?: string | null;
  groupKey: string;
  groupName: string;
  groupOrder: number;
};

export async function replaceBomJobGroups(
  jobId: string,
  groups: BomJobGroupRecord[],
) {
  await db.delete(bomJobGroups).where(eq(bomJobGroups.jobId, jobId));

  if (!groups.length) return [];

  const values = groups.map((group) => ({
    id: crypto.randomUUID(),
    jobId,
    source: group.source,
    sourceUrl: group.sourceUrl,
    sourceText: group.sourceText ?? null,
    groupKey: group.groupKey,
    groupName: group.groupName,
    groupOrder: group.groupOrder,
    status: "pending",
  }));

  await db.insert(bomJobGroups).values(values);
  return listBomJobGroups(jobId);
}

export async function listBomJobGroups(jobId: string) {
  return db
    .select()
    .from(bomJobGroups)
    .where(eq(bomJobGroups.jobId, jobId))
    .orderBy(asc(bomJobGroups.groupOrder), asc(bomJobGroups.createdAt));
}

export async function getBomJobGroup(jobId: string, groupId: string) {
  const [group] = await db
    .select()
    .from(bomJobGroups)
    .where(and(eq(bomJobGroups.jobId, jobId), eq(bomJobGroups.id, groupId)))
    .limit(1);

  return group ?? null;
}

export async function markBomJobGroupRunning(jobId: string, groupId: string) {
  await db
    .update(bomJobGroups)
    .set({
      status: "running",
      errorText: null,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(bomJobGroups.jobId, jobId), eq(bomJobGroups.id, groupId)));
}

export async function completeBomJobGroup(
  jobId: string,
  groupId: string,
  counts: { rawRowCount: number; acceptedRowCount: number },
) {
  await db
    .update(bomJobGroups)
    .set({
      status: "complete",
      rawRowCount: counts.rawRowCount,
      acceptedRowCount: counts.acceptedRowCount,
      errorText: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(bomJobGroups.jobId, jobId), eq(bomJobGroups.id, groupId)));
}

export async function failBomJobGroup(jobId: string, groupId: string, errorText: string) {
  await db
    .update(bomJobGroups)
    .set({
      status: "failed",
      errorText,
      updatedAt: new Date(),
    })
    .where(and(eq(bomJobGroups.jobId, jobId), eq(bomJobGroups.id, groupId)));
}

export async function resetBomJobGroups(jobId: string) {
  await db.delete(bomJobGroups).where(eq(bomJobGroups.jobId, jobId));
}

