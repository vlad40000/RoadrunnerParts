import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { 
  applianceModels, 
  retrievalJobs, 
  batchImports, 
  physicalAppliances,
  modelRetrievalSummary
} from "@/server/db/schema/retrieval-system";
import { normalizeModelNumber } from "@/features/bom/utils/normalization";
import * as XLSX from "xlsx";
import { eq, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);

    // 1. Create Batch Record
    const [batch] = await db.insert(batchImports).values({
      filename: file.name,
      totalRows: data.length,
      status: "running"
    }).returning();

    const results = {
      total: data.length,
      newModels: 0,
      jobsCreated: 0
    };

    for (const row of data) {
      const rawModel = row.model_number || row.Model || "";
      if (!rawModel) continue;

      const normalized = normalizeModelNumber(rawModel);
      
      // 2. Upsert Model
      let [model] = await db.select().from(applianceModels).where(eq(applianceModels.normalizedModel, normalized));
      if (!model) {
        [model] = await db.insert(applianceModels).values({
          normalizedModel: normalized,
          rawModel: rawModel,
          brand: row.brand || row.Brand,
          productType: row.product_type || row.Type,
        }).returning();
        results.newModels++;
      }

      // 3. Link Physical Appliance
      await db.insert(physicalAppliances).values({
        machineId: row.machine_id || row.ID || `M-${Math.random().toString(36).substr(2, 9)}`,
        modelId: model.id,
        batchId: batch.id,
        serialNumber: row.serial_number || row.Serial,
        brand: row.brand || row.Brand,
        productType: row.product_type || row.Type,
        location: row.location || row.Location,
        condition: row.condition || row.Condition,
        notes: row.notes || row.Notes
      }).onConflictDoNothing();

      // 4. Check Coverage & Create Job
      const [summary] = await db.select().from(modelRetrievalSummary).where(eq(modelRetrievalSummary.modelId, model.id));
      if (!summary || summary.retrievalState !== "bom_complete") {
        const [existingJob] = await db.select().from(retrievalJobs).where(
          and(
            eq(retrievalJobs.modelId, model.id),
            inArray(retrievalJobs.status, ["queued", "running"])
          )
        );

        if (!existingJob) {
          await db.insert(retrievalJobs).values({
            modelId: model.id,
            modelNumber: normalized,
            brand: model.brand,
            jobType: "full_bom_retrieval",
            status: "queued",
            priority: 50 // Bulk uploads get lower priority than single UI lookups
          });
          results.jobsCreated++;
        }
      }
    }

    await db.update(batchImports).set({ status: "bom_complete", processedRows: data.length }).where(eq(batchImports.id, batch.id));

    return NextResponse.json({ success: true, batchId: batch.id, results });

  } catch (err: any) {
    console.error("[Upload API Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Helper for 'and' since it's used in the query
import { and } from "drizzle-orm";
