"""
merge_reconciliation.py
Merge scratch/fix_com_reconciliation_results.json back into
HTDX100ED3WW_fix_com_backlog_manifest.json.

- Parts with found=True -> update status to 'matched', populate fixComEvidence.
- Parts with found=False -> update status to 'confirmed_not_on_fix_com'.
"""
import json

MANIFEST = "HTDX100ED3WW_fix_com_backlog_manifest.json"
RECON = "scratch/fix_com_reconciliation_results.json"

with open(MANIFEST, "r", encoding="utf-8") as f:
    manifest = json.load(f)

with open(RECON, "r", encoding="utf-8") as f:
    recon = json.load(f)

recon_by_pn = {r["partNumber"]: r for r in recon}

updated = 0
confirmed_missing = 0
for row in manifest["rows"]:
    pn = row["partNumber"]
    if pn not in recon_by_pn:
        continue
    r = recon_by_pn[pn]
    if r.get("found"):
        row["status"] = "matched"
        row["matchedPartNumber"] = pn
        row["fixComEvidence"] = {
            "status": "matched",
            "source": "fix.com",
            "section": r.get("section", ""),
            "sectionUrl": r.get("sectionUrl", ""),
            "partNumber": pn,
            "partName": r.get("partName", ""),
            "retailPriceUsd": r.get("price", "N/A"),
            "partUrl": r.get("url", ""),
            "sourceHtmlSnippet": r.get("sourceHtmlSnippet", ""),
        }
        print(f"MATCHED: {pn} - {r.get('partName')}")
        updated += 1
    else:
        row["status"] = "confirmed_not_on_fix_com"
        row["fixComEvidence"] = {
            "status": "confirmed_not_on_fix_com",
            "source": "fix.com",
            "note": "Part not listed in any of the 4 sections Fix.com carries for HTDX100ED3WW. Source from D&L Parts or Encompass.",
            "sections_checked": r.get("sections_checked", []),
        }
        print(f"CONFIRMED MISSING: {pn}")
        confirmed_missing += 1

with open(MANIFEST, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

print(f"\nManifest updated: {updated} matched, {confirmed_missing} confirmed not on Fix.com.")
print(f"Saved to {MANIFEST}")
