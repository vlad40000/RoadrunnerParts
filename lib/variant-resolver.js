/**
 * Worker 4: Variant Resolver
 * Detects and resolves model revisions, engineering codes, and serial-prefix branches.
 */

/**
 * Resolves the variant (revision/branch) for an appliance.
 */
export function resolveVariant({ identity, route, revision = null }) {
  const { brand_normalized, model_normalized, serial_normalized, manufacturer_family } = identity;

  // 1. If revision is provided, validate it exists (mocked for now)
  if (revision) {
    return {
      ok: true,
      value: {
        resolved_model: model_normalized,
        resolved_revision: revision,
        resolved_serial_branch: null,
        resolution_basis: [`User provided revision: ${revision}`],
        confidence: 1.0
      }
    };
  }

  // 2. Family-specific resolution logic
  if (manufacturer_family === 'GE' && route.requires_revision_resolution) {
    // GE models often have a suffix (e.g., HTX24EASK0WS vs HTX24EASK0WW)
    // or a specific revision digit.
    // If the model ends in a 0/1/2 suffix, we might treat it as a variant.
    
    // For now, if no revision is provided, we signal that it's needed.
    return {
      ok: false,
      status: 'variant_resolution_needed',
      reason: 'GE models require exact revision suffix to identify the correct diagram set.',
      candidates: [
        { revision: '00', label: 'HTX24EASK00', confidence: 0.8 },
        { revision: '01', label: 'HTX24EASK01', confidence: 0.7 }
      ]
    };
  }

  if (manufacturer_family === 'Whirlpool' && route.requires_serial_split_check) {
    // Whirlpool models often split by serial prefix (e.g. S/N beginning with 'L' or 'M')
    if (serial_normalized) {
      const prefix = serial_normalized.substring(0, 1);
      return {
        ok: true,
        value: {
          resolved_model: model_normalized,
          resolved_revision: null,
          resolved_serial_branch: `prefix ${prefix}`,
          resolution_basis: [`Whirlpool serial prefix matched: ${prefix}`],
          confidence: 0.9
        }
      };
    } else {
      return {
        ok: false,
        status: 'variant_resolution_needed',
        reason: 'Whirlpool models often vary by serial number prefix.',
        candidates: []
      };
    }
  }

  // Default: no resolution needed
  return {
    ok: true,
    value: {
      resolved_model: model_normalized,
      resolved_revision: null,
      resolved_serial_branch: null,
      resolution_basis: ['No specific variant resolution required for this brand family.'],
      confidence: 1.0
    }
  };
}
