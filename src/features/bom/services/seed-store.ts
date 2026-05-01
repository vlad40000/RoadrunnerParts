import "server-only";
import { db } from "@/server/db";
import {
  providerPartSeedRows,
  providerAssemblySections,
  providerModelRoutes,
} from "@/server/db/schema/provider-seeds";
import { eq, asc } from "drizzle-orm";

export async function getSeedPartsForModel(model: string) {
  return await db
    .select()
    .from(providerPartSeedRows)
    .where(eq(providerPartSeedRows.model, model))
    .orderBy(asc(providerPartSeedRows.sectionNameClean), asc(providerPartSeedRows.diagramNumber));
}

export async function getSeedSectionsForModel(model: string) {
  return await db
    .select()
    .from(providerAssemblySections)
    .where(eq(providerAssemblySections.model, model))
    .orderBy(asc(providerAssemblySections.sectionSeq));
}

export async function getSeedRoutesForModel(model: string) {
  return await db
    .select()
    .from(providerModelRoutes)
    .where(eq(providerModelRoutes.model, model));
}
