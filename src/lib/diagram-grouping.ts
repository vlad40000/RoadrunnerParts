function cleanLabel(label: string | null | undefined): string {
  return String(label || '').replace(/\s+/g, ' ').trim();
}

interface GroupRule {
  key: string;
  order: number;
  match: RegExp;
}

const GROUP_RULES: GroupRule[] = [
  { key: 'all_model_parts', order: 0, match: /all model parts/i },
  { key: 'console_water_inlet', order: 10, match: /(console|control).*(water inlet|dispenser)|water inlet/i },
  { key: 'console_controls', order: 20, match: /(console|control|backsplash|dispenser)/i },
  { key: 'top_cabinet', order: 30, match: /(top|cabinet)/i },
  { key: 'front_panel_door', order: 40, match: /(front panel|door)/i },
  { key: 'drum', order: 50, match: /drum/i },
  { key: 'basket_tub', order: 60, match: /(basket|tub)/i },
  { key: 'motor_pump_drive', order: 70, match: /(motor|pump|gearcase|drive|blower)/i },
  { key: 'pump', order: 80, match: /pump/i },
  { key: 'optional_parts', order: 900, match: /optional parts/i },
  { key: 'cover_sheet', order: 999, match: /cover sheet/i },
];

export interface CanonicalDiagramGroup {
  groupKey: string;
  groupName: string;
  groupOrder: number;
}

export function canonicalizeDiagramGroup(label: string | null | undefined): CanonicalDiagramGroup {
  const cleaned = cleanLabel(label);
  const matched = GROUP_RULES.find((rule) => rule.match.test(cleaned));

  return {
    groupKey: matched?.key || cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'uncategorized',
    groupName: cleaned || 'Unnamed Diagram Group',
    groupOrder: matched?.order ?? 500,
  };
}

export function sortDiagramGroups<T extends CanonicalDiagramGroup>(groups: T[] = []): T[] {
  return [...groups].sort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    return String(a.groupName).localeCompare(String(b.groupName));
  });
}
