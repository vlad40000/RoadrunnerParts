/**
 * Worker 5: Diagram Indexer
 * Discovers schematic/diagram groups for a given model and source.
 */

import * as cheerio from 'cheerio';

/**
 * Fetches the diagram index for a model from Sears PartsDirect.
 */
async function fetchSearsDiagramIndex(modelNumber) {
  const url = `https://www.searspartsdirect.com/model/${modelNumber}/parts`;
  
  try {
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000) 
    });
    
    if (!response.ok) {
      console.warn(`Sears index fetch failed (${response.status}) for ${modelNumber}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const diagrams = [];
    $('.model-section-card, .section-link, .schematic-link, a[href*="/model-section/"]').each((i, el) => {
      const $el = $(el);
      const label = $el.find('.section-name, .model-section-title, .schematic-name').text().trim() || $el.text().trim();
      const id = $el.attr('id') || `section-${i}`;
      const link = $el.attr('href') || $el.find('a').attr('href');
      
      if (label && link && !diagrams.some(d => d.label === label)) {
        diagrams.push({
          id,
          label,
          url: link.startsWith('http') ? link : `https://www.searspartsdirect.com${link}`
        });
      }
    });

    if (diagrams.length === 0) {
      console.log(`[Sears Indexer] No sections found in HTML for ${modelNumber}. Body length: ${html.length}`);
    }
    
    return diagrams;
  } catch (err) {
    console.error(`Sears index error for ${modelNumber}`, err);
    return [];
  }
}

/**
 * Fetches the diagram index for a model from Fix.com.
 */
async function fetchFixDiagramIndex(modelNumber) {
  const url = `https://www.fix.com/parts/appliance/search/?q=${modelNumber}`;
  
  try {
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000) 
    });
    
    if (!response.ok) {
      console.warn(`Fix.com index fetch failed (${response.status}) for ${modelNumber}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const diagrams = [];
    // Fix.com selectors: .mega-m-section a, .model-section-list a, .assemblies a
    $('.mega-m-section a, .model-section-list a, .assemblies a').each((i, el) => {
      const $el = $(el);
      const label = $el.text().trim();
      const href = $el.attr('href');
      
      if (label && href && !diagrams.some(d => d.label === label)) {
        diagrams.push({
          id: `fix-${i}`,
          label,
          url: href.startsWith('http') ? href : `https://www.fix.com${href}`
        });
      }
    });

    if (diagrams.length === 0) {
      console.log(`[Fix Indexer] No sections found in HTML for ${modelNumber}. Body length: ${html.length}`);
    }
    
    return diagrams;
  } catch (err) {
    console.error(`Fix.com index error for ${modelNumber}`, err);
    return [];
  }
}

/**
 * Main entry point for Worker 5.
 */
export async function fetchDiagramIndex({ identity, route, variant }) {
  const { resolved_model, resolved_revision } = variant;
  const primarySource = String(route?.primary_source || '').toLowerCase();

  // Use the resolved model (incorporating revision if needed)
  const lookupModel = resolved_revision 
    ? `${resolved_model}-${resolved_revision}` 
    : (resolved_model || identity.model_normalized);

  let diagrams = [];
  if (primarySource.includes('fix')) {
    diagrams = await fetchFixDiagramIndex(lookupModel);
  } else {
    // Default to Sears
    diagrams = await fetchSearsDiagramIndex(lookupModel);
  }

  return { ok: true, diagrams };
}
