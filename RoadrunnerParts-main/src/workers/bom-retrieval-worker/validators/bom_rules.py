from typing import List, Optional
from dataclasses import dataclass
from .schemas import ParsedPartRow, PriceSnapshot

@dataclass
class CompletionStatus:
    is_complete: bool
    state: str  # bom_complete, parts_partial, pricing_partial, etc.
    reason: str
    part_count: int
    priced_count: int
    assembly_count: int

def evaluate_bom_completion(
    parts: List[ParsedPartRow],
    prices: List[PriceSnapshot],
    assemblies: List[str],
    expected_part_count: Optional[int] = None
) -> CompletionStatus:
    part_count = len(parts)
    priced_count = len(prices)
    assembly_count = len(assemblies)
    
    # 1. Basic sanity checks
    if part_count == 0:
        return CompletionStatus(False, "no_parts_found", "No parts were extracted", 0, 0, assembly_count)
    
    if assembly_count == 0:
        return CompletionStatus(False, "no_assemblies_found", "No assemblies/sections were detected", part_count, priced_count, 0)

    # 2. Check for missing source URLs or validation errors in parts
    for p in parts:
        if not p.source_url:
            return CompletionStatus(False, "validation_failed", f"Part {p.part_number} missing source URL", part_count, priced_count, assembly_count)

    # 3. Check pricing coverage
    # priced_part_count = part_count rule
    is_fully_priced = priced_count >= part_count
    
    # 4. Check expected counts if provided
    if expected_part_count is not None:
        if part_count < expected_part_count:
            return CompletionStatus(False, "parts_partial", f"Found {part_count}/{expected_part_count} parts", part_count, priced_count, assembly_count)
        if priced_count < expected_part_count:
            return CompletionStatus(False, "pricing_partial", f"Found {priced_count}/{expected_part_count} prices", part_count, priced_count, assembly_count)

    # 5. Final Determination
    if is_fully_priced:
        return CompletionStatus(True, "bom_complete", "All parts found and priced", part_count, priced_count, assembly_count)
    else:
        return CompletionStatus(False, "pricing_partial", f"Priced {priced_count} out of {part_count} parts", part_count, priced_count, assembly_count)
