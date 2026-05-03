import { RetrievedSource } from "./providers/types";

export interface ReconciledPart {
  partNumber: string;
  description: string;
  diagramNumber: string;
  sources: string[];
  isDiscrepancy: boolean;
  discrepancyType?: 'encompass_only' | 'sears_only' | 'description_mismatch';
}

export interface ReconciliationReport {
  model: string;
  totalUniqueParts: number;
  encompassCount: number;
  searsCount: number;
  overlapCount: number;
  parts: ReconciledPart[];
}

/**
 * Service to reconcile parts lists from different authoritative sources.
 * Specifically handles diffing between Encompass and Sears catalogs.
 */
export class ReconciliationService {
  /**
   * Parses the structured text format used by BOM providers.
   */
  private static parseRows(text: string): any[] {
    const parts: any[] = [];
    const lines = text.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("ROW|")) {
        const fields = line.split("|").slice(1);
        const part: any = {};
        for (const field of fields) {
          const eqIndex = field.indexOf('=');
          if (eqIndex === -1) continue;
          const key = field.slice(0, eqIndex);
          const value = field.slice(eqIndex + 1);
          
          if (key === "diagram_number") part.diagramNumber = value;
          if (key === "description") part.description = value;
          if (key === "original_part_number") part.originalPartNumber = value;
          if (key === "current_service_part_number") part.partNumber = value;
        }
        
        // Final part number selection
        const finalPartNumber = part.partNumber || part.originalPartNumber;
        if (finalPartNumber) {
          parts.push({
            ...part,
            partNumber: finalPartNumber.toUpperCase().trim()
          });
        }
      }
    }
    return parts;
  }

  /**
   * Reconciles multiple sources into a single unified list.
   */
  public static reconcile(model: string, sources: RetrievedSource[]): ReconciliationReport {
    const partMap = new Map<string, ReconciledPart>();
    const encompassParts = new Set<string>();
    const searsParts = new Set<string>();

    for (const source of sources) {
      const isEncompass = source.provider.startsWith('encompass');
      const isSears = source.provider === 'sears-partsdirect';
      
      const rows = this.parseRows(source.text);
      
      for (const row of rows) {
        const pNum = row.partNumber;
        if (isEncompass) encompassParts.add(pNum);
        if (isSears) searsParts.add(pNum);

        if (!partMap.has(pNum)) {
          partMap.set(pNum, {
            partNumber: pNum,
            description: row.description,
            diagramNumber: row.diagramNumber,
            sources: [source.provider],
            isDiscrepancy: false
          });
        } else {
          const existing = partMap.get(pNum)!;
          if (!existing.sources.includes(source.provider)) {
            existing.sources.push(source.provider);
          }
          // If description is generic "Appliance Part", prefer a better one
          if (existing.description === "Appliance Part" && row.description !== "Appliance Part") {
            existing.description = row.description;
          }
        }
      }
    }

    const unifiedParts: ReconciledPart[] = Array.from(partMap.values());
    let overlapCount = 0;

    for (const part of unifiedParts) {
      const inEncompass = encompassParts.has(part.partNumber);
      const inSears = searsParts.has(part.partNumber);

      if (inEncompass && inSears) {
        overlapCount++;
      } else {
        part.isDiscrepancy = true;
        part.discrepancyType = inEncompass ? 'encompass_only' : 'sears_only';
      }
    }

    return {
      model,
      totalUniqueParts: unifiedParts.length,
      encompassCount: encompassParts.size,
      searsCount: searsParts.size,
      overlapCount,
      parts: unifiedParts
    };
  }
}
