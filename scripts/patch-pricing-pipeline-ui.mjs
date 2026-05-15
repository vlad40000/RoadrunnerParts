import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src', 'App.tsx');
let s = fs.readFileSync(file, 'utf8');
let changed = false;

function rep(name, a, b) {
  if (s.includes(b)) return;
  if (!s.includes(a)) { console.warn(`[pricing-ui-patch] missing ${name}`); return; }
  s = s.replace(a, b);
  changed = true;
  console.log(`[pricing-ui-patch] ${name}`);
}
function after(name, a, b) {
  if (s.includes(b.trim())) return;
  if (!s.includes(a)) { console.warn(`[pricing-ui-patch] missing ${name}`); return; }
  s = s.replace(a, a + b);
  changed = true;
  console.log(`[pricing-ui-patch] ${name}`);
}

rep('source whitelist',
"const approvedPriceSources = ['encompass.com', 'searspartsdirect.com', 'fix.com'];",
`const approvedPriceSources = [
  'encompass.com', 'encompass',
  'reliableparts.com', 'reliableparts',
  'dlparts.com', 'dlparts', 'd&lparts', 'd&l parts',
  'searspartsdirect.com', 'searspartsdirect',
  'partsdr.com', 'partsdr',
  'partselect.com', 'partselect',
  'appliancepartspros.com', 'appliancepartspros',
  'repairclinic.com', 'repairclinic',
  'fix.com', 'fix',
  'ebay.com', 'ebay',
];`);

rep('source fallback',
`const hasApprovedPrice = (part: Part) => {
  const normalizedSource = normalizePriceSource(part.priceSource);
  const isApproved = typeof part.price === 'number' && part.price > 0 && Boolean(normalizedSource);
  return isApproved;
};`,
`const getResolvedPriceSource = (part: Part) => part.priceSource || part.price_source || '';

const hasApprovedPrice = (part: Part) => {
  const normalizedSource = normalizePriceSource(getResolvedPriceSource(part));
  const isApproved = typeof part.price === 'number' && part.price > 0 && Boolean(normalizedSource);
  return isApproved;
};`);

s = s.replaceAll('normalizePriceSource(part.priceSource)', 'normalizePriceSource(getResolvedPriceSource(part))');
s = s.replaceAll('normalizePriceSource(part.priceSource || part.price_source)', 'normalizePriceSource(getResolvedPriceSource(part))');
rep('row id sequence', '          id: 10001 + index,', '          id: index + 1,');

after('pricing state',
`  const [isDbChecking, setIsDbChecking] = useState(false);\n`,
`  const [isPricingCleanupLoading, setIsPricingCleanupLoading] = useState(false);\n  const [pricingPipelineSummary, setPricingPipelineSummary] = useState<any>(null);\n`);

after('pricing reset',
`    setDbCheckStatus(null);\n`,
`    setPricingPipelineSummary(null);\n`);

after('pricing handler',
`  const handleResetIdentity = () => {\n`,
`  const handlePricingCleanup = async () => {\n    const model = normalizeModelId(stripLookupLabel(lookupModel || modelEntry || searchTerm || ''));\n    if (!model) {\n      setDbCheckStatus('Enter or load a model before running pricing cleanup.');\n      return;\n    }\n    setIsPricingCleanupLoading(true);\n    setDbCheckStatus(null);\n    try {\n      const response = await fetch('/api/bom/pricing-cleanup', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ model, parts: aiParts }),\n      });\n      const payload = await response.json().catch(() => ({}));\n      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Pricing cleanup failed.');\n      const rows = Array.isArray(payload.parts) ? payload.parts : [];\n      if (rows.length > 0) {\n        setAIParts(rows.map((part: any, index: number) => ({\n          ...stripManualEbayDisplayFields(part),\n          id: index + 1,\n          partNumber: normalizeModelId(part.partNumber),\n          description: part.description || 'Appliance Part',\n          section: part.section || 'Source-backed BOM',\n          compatibleModels: Array.isArray(part.compatibleModels) ? part.compatibleModels.filter(Boolean) : [model],\n          avgRating: Number(part.avgRating) || 0,\n          reviewCount: Number(part.reviewCount) || 0,\n        })));\n      }\n      setLookupModel(model);\n      setModelEntry(model);\n      setPricingPipelineSummary(payload);\n      setDbCheckStatus(\n        'Pricing cleanup complete: ' +\n          (payload.cleanupSummary?.pricesWrittenToDb || 0) +\n          ' DB price row(s) written/promoted. Priced ' +\n          (payload.pricingSummary?.priced || 0) +\n          '/' +\n          (payload.pricingSummary?.total || rows.length || aiParts.length) +\n          '.',\n      );\n    } catch (error) {\n      const message = error instanceof Error ? error.message : 'Pricing cleanup failed.';\n      setDbCheckStatus(message);\n      alert(message);\n    } finally {\n      setIsPricingCleanupLoading(false);\n    }\n  };\n\n`);

after('progress counts',
`  const stats = useMemo(() => {\n    const dataSource = aiParts.length > 0 ? aiParts : (hasModelContext ? [] : partsData);\n    return {\n      total: dataSource.length,\n      filtered: filteredParts.length,\n      sections: dynamicSections.length,\n      isAI: aiParts.length > 0\n    };\n  }, [filteredParts, aiParts, dynamicSections.length, hasModelContext]);\n`,
`\n  const pricedPartsCount = useMemo(() => aiParts.filter(hasApprovedPrice).length, [aiParts]);\n  const missingPriceCount = Math.max(aiParts.length - pricedPartsCount, 0);\n  const generatedCountLabel = expectedPartCount !== null ? String(aiParts.length) + '/' + String(expectedPartCount) : String(aiParts.length);\n`);

rep('action grid',
`            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.95fr)_minmax(260px,1fr)_190px_82px]">`,
`            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.95fr)_minmax(260px,1fr)_150px_170px_82px]">`);

after('find pricing button',
`              </button>\n\n              <button\n                type="button"\n                onClick={handleResetIdentity}`,
`\n\n              <button\n                type="button"\n                onClick={handlePricingCleanup}\n                disabled={isPricingCleanupLoading || (!lookupModel && !modelEntry && !searchTerm)}\n                className="pro-button h-[54px] rounded-lg border border-emerald-300 bg-emerald-50 px-5 text-sm font-black uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"\n                title="DB-first pricing cleanup"\n              >\n                {isPricingCleanupLoading ? (\n                  <>\n                    <Loader2 className="animate-spin" size={16} />\n                    <span>Finding</span>\n                  </>\n                ) : (\n                  <>\n                    <Database size={17} />\n                    <span>Find Pricing</span>\n                  </>\n                )}\n              </button>\n\n              <button\n                type="button"\n                onClick={handleResetIdentity}`);

after('pipeline cards',
`            {dbCheckStatus && (\n              <div className="rounded-lg border border-pro-slate-200 bg-white px-4 py-2 text-xs font-semibold text-pro-slate-600">\n                {dbCheckStatus}\n              </div>\n            )}\n`,
`\n            {hasModelContext && (\n              <div className="grid gap-3 rounded-lg border border-pro-slate-200 bg-white p-3 text-xs font-semibold text-pro-slate-600 md:grid-cols-5">\n                <div className="rounded-md bg-pro-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-pro-slate-400">Identity</div><div className="mt-1 font-mono text-sm font-black text-pro-navy">{lookupModel || modelEntry}</div></div>\n                <div className="rounded-md bg-pro-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-pro-slate-400">Expected Total</div><div className="mt-1 text-sm font-black text-pro-navy">{expectedPartCount ?? 'Unknown'}</div></div>\n                <div className="rounded-md bg-pro-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-pro-slate-400">Rows Generated</div><div className="mt-1 text-sm font-black text-pro-navy">{generatedCountLabel}</div></div>\n                <div className="rounded-md bg-emerald-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Priced</div><div className="mt-1 text-sm font-black text-emerald-700">{pricedPartsCount}/{aiParts.length}</div></div>\n                <div className="rounded-md bg-amber-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-amber-700">Missing Price</div><div className="mt-1 text-sm font-black text-amber-700">{missingPriceCount}</div>{pricingPipelineSummary?.cleanupSummary && (<div className="mt-1 text-[9px] font-bold uppercase tracking-tight text-amber-700">Wrote {pricingPipelineSummary.cleanupSummary.pricesWrittenToDb || 0}</div>)}</div>\n              </div>\n            )}\n`);

rep('row header',
`                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">OEM Identifier</th>`,
`                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Row</th>\n                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">OEM Identifier</th>`);
rep('row map index', `                    {filteredParts.map((part) => {`, `                    {filteredParts.map((part, rowIndex) => {`);
rep('row cell',
`                        >\n                        <td className="align-top px-4 py-3">`,
`                        >\n                        <td className="align-top px-4 py-3"><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-pro-slate-100 px-2 font-mono text-xs font-black text-pro-navy">{rowIndex + 1}</span></td>\n                        <td className="align-top px-4 py-3">`);

if (changed) fs.writeFileSync(file, s);
console.log(changed ? '[pricing-ui-patch] patched App.tsx' : '[pricing-ui-patch] no changes needed');
