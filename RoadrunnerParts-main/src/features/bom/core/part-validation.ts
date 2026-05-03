import { z } from "zod";
import { bomRowSchema, type BomRow } from "../schemas/bom";

/**
 * Validates a BOM result before committing to cache.
 */
export function validateBomTruth(rows: BomRow[]): { 
  isValid: boolean; 
  reason?: string;
  filteredRows: BomRow[];
} {
  if (!rows || rows.length === 0) {
    return { isValid: false, reason: "Empty BOM result", filteredRows: [] };
  }

  // 1. Filter out rows with clearly hallucinated or invalid part numbers
  const filtered = rows.filter(row => {
    const p = (row.currentServicePartNumber || row.originalPartNumber || "").trim().toUpperCase();
    
    // Reject common hallucination patterns or empty parts
    if (!p || p.length < 3) return false;
    if (p === "UNKNOWN" || p === "TBD" || p === "PENDING") return false;
    if (/^[0-9]+$/.test(p) && p.length < 5) return false; // Too short for most OEM parts if purely numeric
    
    return true;
  });

  if (filtered.length === 0) {
    return { isValid: false, reason: "No valid part numbers found in result", filteredRows: [] };
  }

  // 2. Check for minimum structural requirements
  const hasSections = filtered.some(r => r.section && r.section !== "UNKNOWN");
  if (!hasSections) {
    return { isValid: false, reason: "BOM lacks assembly section categorization", filteredRows: filtered };
  }

  return { 
    isValid: true, 
    filteredRows: filtered 
  };
}
