import { BomWorkflowControlPanel } from "@/src/features/bom/components/bom-workflow-control-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function BomWorkflowVerifyPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <BomWorkflowControlPanel
      initialModel={firstParam(params.model)}
      initialJobId={firstParam(params.jobId)}
    />
  );
}
