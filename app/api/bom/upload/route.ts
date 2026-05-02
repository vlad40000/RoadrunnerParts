import { NextRequest, NextResponse } from "next/server";
import {
  attachFilesToBomJob,
  createBomJob,
  getBomJob,
  saveBomArtifacts,
  setBomJobStage,
  updateBomJobSummary,
} from "@/src/features/bom/services/job-store";
import { uploadBomFileToBlob } from "@/src/features/bom/services/blob-upload";
import { runIdentityExtractor } from "@/src/features/bom/agents/identity-extractor";

export const runtime = "nodejs";

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const maybeJobId = formData.get("jobId");
    const existingJobId =
      typeof maybeJobId === "string" && maybeJobId.length ? maybeJobId : null;

    const shouldRunIdentity = formData.get("runIdentity") === "1";

    const userHintsRaw = formData.get("userHints");
    let userHints: {
      brand?: string;
      model?: string;
      serial?: string;
      productType?: string;
    } = {};

    if (typeof userHintsRaw === "string" && userHintsRaw.trim()) {
      try {
        userHints = JSON.parse(userHintsRaw);
      } catch {
        userHints = {};
      }
    }

    const job = existingJobId
      ? await getBomJob(existingJobId)
      : await createBomJob();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const identityFiles = formData
      .getAll("identityFiles")
      .filter(isFile)
      .filter((f) => f.size > 0);

    const diagramFiles = formData
      .getAll("diagramFiles")
      .filter(isFile)
      .filter((f) => f.size > 0);

    const uploaded: any[] = [];
    let identity: any = null;
    let identityError: string | null = null;

    if (identityFiles.length > 0 || diagramFiles.length > 0) {
      await setBomJobStage(job.id, "uploading");

      const identityUploads = identityFiles.map((file) =>
        uploadBomFileToBlob({ jobId: job.id, file, category: "identity" })
      );

      const diagramUploads = diagramFiles.map((file) =>
        uploadBomFileToBlob({ jobId: job.id, file, category: "diagram" })
      );

      const allUploaded = await Promise.all([...identityUploads, ...diagramUploads]);
      uploaded.push(...allUploaded);

      await attachFilesToBomJob(job.id, uploaded);
      await setBomJobStage(job.id, "uploaded");
    }

    if (shouldRunIdentity && identityFiles.length > 0) {
      const uploadedIdentity = uploaded.find((file) => file.category === "identity");

      if (uploadedIdentity?.url) {
        try {
          await setBomJobStage(job.id, "extracting_identity");

          identity = await runIdentityExtractor({
            files: [
              {
                mimeType: uploadedIdentity.mimeType,
                uri: uploadedIdentity.url,
              },
            ],
            userHints,
          });

          await saveBomArtifacts(job.id, { identity });

          await updateBomJobSummary(job.id, {
            jobStage: "identity_review",
            brand: identity.brand,
            model: identity.model,
            serial: identity.serial,
            productType: identity.productType,
          });
        } catch (error) {
          identityError =
            error instanceof Error ? error.message : "Identity extraction failed";
          await setBomJobStage(job.id, "uploaded");
        }
      }
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      uploadedFiles: uploaded,
      identity,
      identityError,
    });
  } catch (error) {
    console.error(`[BOM Upload Error]`, error);

    const message =
      error instanceof Error ? error.message : "Unknown BOM upload error";

    return NextResponse.json(
      {
        error: "BOM job creation failed.",
        detail: message,
      },
      { status: 500 },
    );
  }
}
