export function buildOptimizedResponse(
  model: string,
  masterParts: any[],
  metadata: Record<string, unknown> = {},
) {
  return {
    model,
    ...metadata,
    parts: Array.isArray(masterParts) ? masterParts : [],
  };
}
