const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('HTDX100ED3WW_fix_com_backlog_manifest.json', 'utf8'));
console.log('First row keys:', Object.keys(manifest.rows[0]));
console.log('First row:', JSON.stringify(manifest.rows[0], null, 2));
const missing = manifest.rows.filter(p => p.status === 'missing' || p.missing_fix_com_evidence === true);
console.log('Missing count:', missing.length);
console.log(JSON.stringify(missing.slice(0, 5).map(p => ({
  name: p.name || p.description,
  partNumber: p.partNumber,
  section: p.section,
  status: p.status
})), null, 2));
