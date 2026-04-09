/**
 * extract_discovered_suppliers.mjs
 *
 * Reads enrichments/enrichments.jsonl, extracts all `discovered[]` entries,
 * deduplicates/merges using an alias table, and writes the result to
 * enrichments/new_suppliers.json for review before DB ingestion.
 *
 * Usage:
 *   node backend/scripts/extract_discovered_suppliers.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot   = path.resolve(__dirname, "../..");
const JSONL_PATH = path.join(repoRoot, "enrichments", "enrichments.jsonl");
const OUT_PATH   = path.join(repoRoot, "enrichments", "new_suppliers.json");

// ---------------------------------------------------------------------------
// Alias table: discovered name (lowercase) → resolution
//
//   "existing:<DB name>"  — already in DB; skip INSERT, only link products
//   "merge:<canonical>"   — collapse product-division variants to one entry
//
// BASF, BASF Nutrition, and BASF (Kollisolv PEG) all map to "BASF" because:
//   - BASF is the legal manufacturer
//   - "BASF Nutrition" is an operating division, not a separate company
//   - "Kollisolv PEG" is a product brand/line within BASF, not a company
// Same logic applies to Lonza/Lonza (Capsugel), Chemours/Chemours (Ti-Pure), etc.
// ---------------------------------------------------------------------------
const ALIASES = {
  // Already in DB under a different name (exact DB name after the colon)
  "albion minerals (balchem)":                "existing:Balchem",
  "iff (dupoint nutrition & biosciences)":    "existing:IFF",
  "iff (dupoint nutrition & biosciences)":    "existing:IFF",
  "iff (dupont nutrition & biosciences)":     "existing:IFF",
  "iff (formerly dupont danisco)":            "existing:IFF",
  "iff pharma solutions (ac-di-sol)":         "existing:IFF",
  "international flavors & fragrances (iff)": "existing:IFF",
  "sensient colors":                          "existing:Sensient",
  "spectrum chemical":                        "existing:Spectrum Chemical",
  "univar solutions":                         "existing:Univar Solutions",
  "cargill":                                  "existing:Cargill",
  // Merge product-division/brand variants into one canonical supplier name
  "basf":                                     "merge:BASF",
  "basf nutrition":                           "merge:BASF",
  "basf (kollisolv peg)":                     "merge:BASF",
  "lonza":                                    "merge:Lonza",
  "lonza (capsugel)":                         "merge:Lonza",
  "chemours":                                 "merge:Chemours",
  "chemours (ti-pure)":                       "merge:Chemours",
  "dsm-firmenich":                            "merge:DSM-Firmenich",
  "givaudan":                                 "merge:Givaudan",
  "sigma-aldrich (merck)":                    "merge:Sigma-Aldrich / Merck",
};

// ---------------------------------------------------------------------------
// Parse JSONL
// ---------------------------------------------------------------------------
const lines = fs.readFileSync(JSONL_PATH, "utf8").split("\n").filter(l => l.trim());

// canonicalKey → entry object
const byKey = new Map();

for (const line of lines) {
  const rec = JSON.parse(line);
  for (const d of (rec.discovered ?? [])) {
    if (!d?.name) continue;
    if ((d.notes ?? "").toLowerCase().includes("already in db")) continue;

    const rawKey = d.name.trim().toLowerCase();
    const alias  = ALIASES[rawKey];

    let canonicalKey, canonicalName, existingDbName;
    if (alias?.startsWith("existing:")) {
      existingDbName = alias.slice(9);
      canonicalKey   = `__existing__${existingDbName.toLowerCase()}`;
      canonicalName  = existingDbName;
    } else if (alias?.startsWith("merge:")) {
      canonicalName  = alias.slice(6);
      canonicalKey   = canonicalName.toLowerCase();
      existingDbName = null;
    } else {
      canonicalName  = d.name.trim();
      canonicalKey   = rawKey;
      existingDbName = null;
    }

    const existing = byKey.get(canonicalKey);
    if (!existing) {
      byKey.set(canonicalKey, {
        canonical_name:  canonicalName,
        existing_db_name: existingDbName ?? null,   // non-null → already in DB
        url:             d.url ?? null,
        product_url:     d.product_url ?? null,
        country:         d.country ?? null,
        region:          d.region ?? null,
        cas_numbers:     rec.cas_number && rec.cas_number !== "unknown"
                           ? [rec.cas_number] : [],
        source_records:  [rec.id],
      });
    } else {
      if (rec.cas_number && rec.cas_number !== "unknown" &&
          !existing.cas_numbers.includes(rec.cas_number)) {
        existing.cas_numbers.push(rec.cas_number);
      }
      if (!existing.product_url && d.product_url) existing.product_url = d.product_url;
      if (!existing.url && d.url) existing.url = d.url;
      if (!existing.source_records.includes(rec.id)) existing.source_records.push(rec.id);
    }
  }
}

const entries = [...byKey.values()].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));

fs.writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2));

const newCount      = entries.filter(e => !e.existing_db_name).length;
const existingCount = entries.filter(e =>  e.existing_db_name).length;
const withCas       = entries.filter(e => e.cas_numbers.length > 0).length;

console.log(`Wrote ${entries.length} entries to enrichments/new_suppliers.json`);
console.log(`  New suppliers (will INSERT):    ${newCount}`);
console.log(`  Existing in DB (link only):     ${existingCount}`);
console.log(`  Entries with CAS (link to RMs): ${withCas}`);
console.log(`\nReview the file, then run:`);
console.log(`  node backend/scripts/ingest_discovered_suppliers.mjs --dry-run`);
console.log(`  node backend/scripts/ingest_discovered_suppliers.mjs`);
