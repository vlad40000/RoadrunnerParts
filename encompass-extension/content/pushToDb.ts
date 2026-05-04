// encompass-extension/content/pushToDb.ts

type CapturedPartRow = {
  source: "encompass";
  sourceUrl: string;
  modelNumber: string | null;
  diagramName: string | null;
  callout: string | null;
  partNumber: string | null;
  description: string | null;
  price: string | null;
  availability: string | null;
  rawText: string | null;
  cropImageUrl?: string | null;
  confidence?: {
    callout?: number | null;
    partNumber?: number | null;
    description?: number | null;
    price?: number | null;
  };
};

export async function pushReviewedRowsToDb(input: {
  appBaseUrl: string;
  ingestKey: string;
  sourceUrl: string;
  modelNumber: string | null;
  diagramName: string | null;
  rows: CapturedPartRow[];
}) {
  const reviewedRows = input.rows.filter((row) => {
    return row.partNumber && row.description;
  });

  if (reviewedRows.length === 0) {
    throw new Error("No reviewed rows with part number and description.");
  }

  const res = await fetch(`${input.appBaseUrl}/api/bom/captured-parts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bom-ingest-key": input.ingestKey
    },
    body: JSON.stringify({
      sourceUrl: input.sourceUrl,
      modelNumber: input.modelNumber,
      diagramName: input.diagramName,
      rows: reviewedRows
    })
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Push failed with ${res.status}`);
  }

  return json;
}
