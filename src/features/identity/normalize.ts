import "server-only";

/**
 * Normalizes a serial number by removing noise and non-alphanumeric characters.
 */
export function normalizeSerialNumber(serial: string | number | null | undefined): string {
  if (!serial) return "";
  return String(serial)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, ""); // Remove spaces, hyphens, and non-alnum
}

/**
 * Strips common serial number prefixes like "S/N" or "SER:".
 */
export function stripSerialNoise(serial: string | number | null | undefined): string {
  if (!serial) return "";
  return normalizeSerialNumber(serial)
    .replace(/^S\/N[:\s]*/i, "")
    .replace(/^SER[:\s]*/i, "")
    .replace(/^SERIAL[:\s]*/i, "");
}

/**
 * Normalizes a brand label to a canonical string used in decoders.
 */
export function normalizeBrandLabel(brand: string | null | undefined): string {
  if (!brand) return "Unknown";
  const b = String(brand).trim().toUpperCase();

  if (b.includes("GE APPLIANCES") || b === "GE") return "GE";
  if (b.includes("HOTPOINT")) return "Hotpoint";
  if (b.includes("HAIER")) return "Haier";
  if (b.includes("MONOGRAM")) return "Monogram";
  if (b.includes("WHIRLPOOL")) return "Whirlpool";
  if (b.includes("KITCHENAID")) return "KitchenAid";
  if (b.includes("MAYTAG")) return "Maytag";
  if (b.includes("AMANA")) return "Amana";
  if (b.includes("FRIGIDAIRE")) return "Frigidaire";
  if (b.includes("ELECTROLUX")) return "Electrolux";
  if (b.includes("LG")) return "LG";
  if (b.includes("SAMSUNG")) return "Samsung";
  if (b.includes("BOSCH")) return "Bosch";
  if (b.includes("THERMADOR")) return "Thermador";
  if (b.includes("GAGGENAU")) return "Gaggenau";
  if (b.includes("SPEED QUEEN")) return "Speed Queen";
  if (b.includes("KENMORE")) return "Kenmore";

  return brand.trim();
}

/**
 * Normalizes a raw diagram section name to a canonical taxonomy.
 * Derived from the "Laundry Parts Diagram Section Name Variations" research report.
 */
export function normalizeSectionName(raw: string | null | undefined): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "General Assembly";

  // Cleanup noise
  const clean = s
    .replace(/\s+parts diagram$/i, "")
    .replace(/\s+diagram$/i, "")
    .replace(/\s+schematic$/i, "")
    .replace(/^exploded view\s+/i, "")
    .trim();

  // 1. Controls and console
  if (/(?:console|backsplash|control panel|timer|hood|keypad|user interface|plate assembly)/i.test(clean)) {
    return "Controls and Console";
  }

  // 2. Cabinet, top, frame, and outer shell
  if (/(?:cabinet|shell|casing|frame|rear panel|top panel|base|casing|outer casing|fascia|facia)/i.test(clean)) {
    return "Cabinet, Top and Frame";
  }

  // 3. Door, front access, and seal
  if (/(?:door|front panel|access door|loading door|seal|gasket)/i.test(clean)) {
    return "Door, Front Access and Seal";
  }

  // 4. Rotating assembly
  if (/(?:drum|tub|basket|agitator|cylinder)/i.test(clean)) {
    return "Rotating Assembly";
  }

  // 5. Bulkhead, support, and seals
  if (/(?:bulkhead|felt seal|drum roller|roller|support|bearing housing)/i.test(clean)) {
    return "Bulkhead, Support and Seals";
  }

  // 6. Drive system
  if (/(?:motor|belt|exhaust fan|gearcase|transmission|drive tube|brake|clutch|pump)/i.test(clean)) {
    return "Drive System";
  }

  // 7. Heat, airflow, and gas
  if (/(?:burner|gas valve|igniter|heater|duct|exhaust|blower|box)/i.test(clean)) {
    return "Heat, Airflow and Gas";
  }

  // 8. Water inlet, dispenser, and drawer
  if (/(?:water system|mixing valve|dispenser|drawer|housing-drawer|hoses\/pump)/i.test(clean)) {
    return "Water Inlet and Dispenser";
  }

  // 9. Electrical, wiring, and terminal power
  if (/(?:wiring|harness|power cord|terminal block|terminal)/i.test(clean)) {
    return "Electrical and Power";
  }

  // 10. Meter, vend, and audit (Commercial)
  if (/(?:meter|coin|vend|audit|accumulator)/i.test(clean)) {
    return "Meter, Vend and Audit";
  }

  // 11. Documentation, optional, labels, and service extras
  if (/(?:cover sheet|optional|literature|manual|labels|tools|shipping|miscellaneous|diagram)/i.test(clean)) {
    return "Documentation and Service Extras";
  }

  // Fallback: Title Case the clean version
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}
