function cleanLabel(label) {
  return String(label || '').replace(/\s+/g, ' ').trim();
}

const GROUP_RULES = [
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

export function canonicalizeDiagramGroup(label) {
  const cleaned = cleanLabel(label);
  const matched = GROUP_RULES.find((rule) => rule.match.test(cleaned));

  return {
    groupKey: matched?.key || cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'uncategorized',
    groupName: cleaned || 'Unnamed Diagram Group',
    groupOrder: matched?.order ?? 500,
  };
}

export function sortDiagramGroups(groups = []) {
  return [...groups].sort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    return String(a.groupName).localeCompare(String(b.groupName));
  });
}
