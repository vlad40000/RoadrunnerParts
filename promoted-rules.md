# Promoted Rules — Micro-Memory Shard Repository

This file is the central shard repository for the Zero-Click eBay Engine RALPH loop.
Every entry is an empirically hardened "Golden Path" rule promoted by the Token Thermostat.
The `<shard_initialization_protocol>` in `SOP.md` requires agents to read this file at the
start of every session and inject all shards as `<critical_memory_shard>` tags.

---

## Active Shards

[SHARD: BOM Extraction] Emit null for any diagram ref field not visible in the source OCR. Do not infer.

[SHARD: GE Motors] Do not use the plastic centrifugal switch block as a handle to lift the motor; it is fragile and not serviceable.

[SHARD: Hotpoint Panels] The bottom plastic tabs snap easily; ensure they are fully seated in the metal console slots before securing the top.

---

## Shard Promotion Log

| Date | Category | Rule Summary | Promoted By |
|------|----------|-------------|------------|
| 2026-05-10 | GE Motors | Centrifugal switch block is not a handle | Manual — session init |
| 2026-05-10 | Hotpoint Panels | Bottom tabs must seat fully before top is secured | Manual — session init |
| 2026-05-10 | BOM Extraction | Emit null for any diagram ref field not visible in the sourc... | Token Thermostat — RLD-SMOKETEST-001 |

---

## How to Add a New Shard

1. Append a new line in the **Active Shards** section using this exact format:
   ```
   [SHARD: Category] Single, actionable rule. No ambiguity.
   ```
2. Add a row to the **Shard Promotion Log** with today's date and the promoting agent.
3. The next RALPH loop session will automatically inject it.

> Rules promoted here override baseline AI knowledge and general instructions.
> One rule per line. No conditionals. No "it depends." Write the exact correct action.
