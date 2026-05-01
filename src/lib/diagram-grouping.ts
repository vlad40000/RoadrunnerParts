const GROUP_ORDER = [
  "controls",
  "cabinet",
  "door",
  "drum",
  "tub",
  "motor",
  "pump",
  "heater",
  "water",
  "electrical",
  "misc",
];

export function canonicalizeDiagramGroup(name: string | null | undefined) {
  const groupName = String(name || "All Model Parts").replace(/\s+/g, " ").trim() || "All Model Parts";
  const lower = groupName.toLowerCase();
  const matchedKey =
    GROUP_ORDER.find((key) => lower.includes(key)) ??
    (lower.includes("console") ? "controls" : null) ??
    (lower.includes("bulkhead") ? "drum" : null) ??
    "misc";

  return {
    groupKey: matchedKey,
    groupName,
    groupOrder: GROUP_ORDER.indexOf(matchedKey) === -1 ? GROUP_ORDER.length : GROUP_ORDER.indexOf(matchedKey),
  };
}

export function sortDiagramGroups<T extends { groupOrder?: number; groupName?: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const orderA = Number.isFinite(a.groupOrder) ? Number(a.groupOrder) : GROUP_ORDER.length;
    const orderB = Number.isFinite(b.groupOrder) ? Number(b.groupOrder) : GROUP_ORDER.length;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.groupName || "").localeCompare(String(b.groupName || ""));
  });
}
