import { redirect } from "next/navigation";

type BomIngestRedirectPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BomIngestRedirectPage({
  searchParams,
}: BomIngestRedirectPageProps) {
  const params = await searchParams;
  const next = new URLSearchParams();

  const model = params?.model;
  const jobId = params?.jobId;

  if (typeof model === "string" && model.trim()) next.set("model", model.trim());
  if (typeof jobId === "string" && jobId.trim()) next.set("jobId", jobId.trim());

  redirect(`/bom-workflow${next.size ? `?${next.toString()}` : ""}`);
}
