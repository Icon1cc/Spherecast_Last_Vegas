/**
 * ingest_discovered_suppliers.mjs
 *
 * Reads enrichments/new_suppliers.json (produced by extract_discovered_suppliers.mjs)
 * and upserts suppliers + product links into PostgreSQL.
 *
 * Per entry:
 *   - existing_db_name set  → supplier already in DB; only add missing product links
 *   - existing_db_name null → INSERT INTO supplier(name) if name not already present
 *   - For each cas_number: find raw_product_ids in component_normalized, INSERT
 *     supplier_product rows (ON CONFLICT skip)
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node backend/scripts/ingest_discovered_suppliers.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(repoRoot, ".env"), override: false });

const DRY_RUN  = process.argv.includes("--dry-run");
const SRC_PATH = path.join(repoRoot, "enrichments", "new_suppliers.json");

const connectionString =
  process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.SUPABASE_DB_URL;
if (!connectionString) { console.error("Missing POSTGRES_URL"); process.exit(1); }
if (!fs.existsSync(SRC_PATH)) {
  console.error(`new_suppliers.json not found. Run extract_discovered_suppliers.mjs first.`);
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(SRC_PATH, "utf8"));
const pool    = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });

console.log(DRY_RUN ? "=== DRY RUN ===" : "=== Ingesting new_suppliers.json → PostgreSQL ===");
console.log(`Entries: ${entries.length}\n`);

// Fetch current supplier map (lowercase name → id)
const existingResult = await pool.query("SELECT id, LOWER(name) AS lname FROM supplier");
const supplierMap    = new Map(existingResult.rows.map(r => [r.lname, r.id]));

const stats = { sup_inserted: 0, sup_skipped: 0, sp_inserted: 0, sp_skipped: 0, sp_no_rm: 0 };

for (const entry of entries) {
  // Resolve supplier id
  const lookupName = (entry.existing_db_name ?? entry.canonical_name).toLowerCase();
  let supplierId   = supplierMap.get(lookupName);

  if (DRY_RUN) {
    const tag = supplierId ? `existing id=${supplierId}` : "NEW";
    let rmTotal = 0;
    for (const cas of entry.cas_numbers) {
      const r = await pool.query(
        "SELECT COUNT(*) FROM component_normalized WHERE cas_number=$1", [cas]);
      rmTotal += parseInt(r.rows[0].count);
    }
    console.log(`  [${tag.padEnd(14)}] ${entry.canonical_name.padEnd(44)} CAS:${entry.cas_numbers.length} → ${rmTotal} RM rows`);
    continue;
  }

  // Live: insert supplier if new
  if (!supplierId) {
    if (entry.existing_db_name) {
      console.warn(`  WARN: "${entry.existing_db_name}" marked existing but not found in DB — skipping`);
      continue;
    }
    const ins = await pool.query("INSERT INTO supplier(name) VALUES ($1) RETURNING id",
      [entry.canonical_name]);
    supplierId = ins.rows[0].id;
    supplierMap.set(entry.canonical_name.toLowerCase(), supplierId);
    stats.sup_inserted++;
    console.log(`  ADD  supplier: ${entry.canonical_name} → id=${supplierId}`);
  } else {
    stats.sup_skipped++;
    console.log(`  SKIP supplier (exists): ${entry.canonical_name} id=${supplierId}`);
  }

  // Link to raw materials via each CAS number
  for (const cas of entry.cas_numbers) {
    const rmResult = await pool.query(
      "SELECT raw_product_id FROM component_normalized WHERE cas_number=$1", [cas]);

    if (rmResult.rows.length === 0) { stats.sp_no_rm++; continue; }

    for (const { raw_product_id } of rmResult.rows) {
      const exists = await pool.query(
        "SELECT 1 FROM supplier_product WHERE supplier_id=$1 AND product_id=$2",
        [supplierId, raw_product_id]);
      if (exists.rows.length > 0) { stats.sp_skipped++; continue; }

      await pool.query(
        `INSERT INTO supplier_product(supplier_id, product_id, country, region, sup_url, product_page_url)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [supplierId, raw_product_id, entry.country, entry.region, entry.url, entry.product_url]);
      stats.sp_inserted++;
    }
  }
}

if (!DRY_RUN) {
  console.log(`\nDone:`);
  console.log(`  Suppliers inserted:          ${stats.sup_inserted}`);
  console.log(`  Suppliers already existed:   ${stats.sup_skipped}`);
  console.log(`  supplier_product rows added: ${stats.sp_inserted}`);
  console.log(`  supplier_product skipped:    ${stats.sp_skipped}`);
  console.log(`  CAS with no RM in DB:        ${stats.sp_no_rm}`);
}

await pool.end();
