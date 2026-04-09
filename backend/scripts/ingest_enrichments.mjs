/**
 * ingest_enrichments.mjs — load enrichments/enrichments.jsonl into PostgreSQL
 *
 * Per record:
 *  1. Upsert ingredient_profile by cas_number (ingredient-level facts, once per compound)
 *  2. Update component_normalized SET cas_number, ingredient_slug WHERE raw_product_id IN rm_ids
 *  3. Update supplier_product SET per-supplier fields WHERE supplier_id=sup_id AND product_id IN rm_ids
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node backend/scripts/ingest_enrichments.mjs
 *   node backend/scripts/ingest_enrichments.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import process from "node:process";

import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(repoRoot, ".env"), override: false });

const DRY_RUN = process.argv.includes("--dry-run");
const JSONL_PATH = path.join(repoRoot, "enrichments", "enrichments.jsonl");

const connectionString =
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("Missing Postgres connection string. Set POSTGRES_URL.");
  process.exit(1);
}

if (!fs.existsSync(JSONL_PATH)) {
  console.error(`JSONL not found: ${JSONL_PATH}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

/** Parse price values — handles null, numeric, and string formats like "$874.95/25kg" */
function parsePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const match = String(raw).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

async function ingest() {
  const stats = { total: 0, profiles_upserted: 0, cn_updated: 0, sp_updated: 0, skipped_no_cas: 0 };

  const rl = readline.createInterface({ input: fs.createReadStream(JSONL_PATH, "utf8"), crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      console.warn("Skipping unparseable line:", trimmed.slice(0, 80));
      continue;
    }

    stats.total++;

    if (!rec.cas_number) {
      stats.skipped_no_cas++;
      console.log(`  SKIP (no CAS): ${rec.id}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  DRY-RUN: would upsert ${rec.cas_number} / update ${rec.rm_ids?.length ?? 0} rm_ids for supplier ${rec.sup_id}`);
      stats.profiles_upserted++;
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Upsert ingredient_profile
      await client.query(
        `INSERT INTO ingredient_profile (
          cas_number, canonical_name, functional_role, patent_lock, single_manufacturer,
          market_ban_eu, market_ban_us,
          vegan_status, vegetarian_status, halal_status, kosher_status,
          non_gmo_status, organic_status,
          allergen_flags, label_form_claim, health_claim_form,
          enriched_at, pipeline_version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (cas_number) DO UPDATE SET
          canonical_name      = EXCLUDED.canonical_name,
          functional_role     = COALESCE(EXCLUDED.functional_role, ingredient_profile.functional_role),
          patent_lock         = COALESCE(EXCLUDED.patent_lock, ingredient_profile.patent_lock),
          single_manufacturer = COALESCE(EXCLUDED.single_manufacturer, ingredient_profile.single_manufacturer),
          market_ban_eu       = COALESCE(EXCLUDED.market_ban_eu, ingredient_profile.market_ban_eu),
          market_ban_us       = COALESCE(EXCLUDED.market_ban_us, ingredient_profile.market_ban_us),
          vegan_status        = COALESCE(EXCLUDED.vegan_status, ingredient_profile.vegan_status),
          vegetarian_status   = COALESCE(EXCLUDED.vegetarian_status, ingredient_profile.vegetarian_status),
          halal_status        = COALESCE(EXCLUDED.halal_status, ingredient_profile.halal_status),
          kosher_status       = COALESCE(EXCLUDED.kosher_status, ingredient_profile.kosher_status),
          non_gmo_status      = COALESCE(EXCLUDED.non_gmo_status, ingredient_profile.non_gmo_status),
          organic_status      = COALESCE(EXCLUDED.organic_status, ingredient_profile.organic_status),
          allergen_flags      = COALESCE(EXCLUDED.allergen_flags, ingredient_profile.allergen_flags),
          label_form_claim    = COALESCE(EXCLUDED.label_form_claim, ingredient_profile.label_form_claim),
          health_claim_form   = COALESCE(EXCLUDED.health_claim_form, ingredient_profile.health_claim_form),
          enriched_at         = EXCLUDED.enriched_at`,
        [
          rec.cas_number,
          rec.canonical_name ?? rec.ingredient_slug,
          rec.functional_role ?? null,
          rec.patent_lock ?? null,
          rec.single_manufacturer ?? null,
          rec.market_ban_eu ?? null,
          rec.market_ban_us ?? null,
          rec.vegan_status ?? null,
          rec.vegetarian_status ?? null,
          rec.halal_status ?? null,
          rec.kosher_status ?? null,
          rec.non_gmo_status ?? null,
          rec.organic_status ?? null,
          JSON.stringify(rec.allergen_flags ?? []),
          rec.label_form_claim ?? null,
          rec.health_claim_form ?? null,
          rec.enriched_at ?? new Date().toISOString(),
          rec.pipeline_version ?? "1.0",
        ]
      );
      stats.profiles_upserted++;

      // 2. Update component_normalized for all rm_ids
      if (Array.isArray(rec.rm_ids) && rec.rm_ids.length > 0) {
        const cnResult = await client.query(
          `UPDATE component_normalized
           SET cas_number = $1, ingredient_slug = $2
           WHERE raw_product_id = ANY($3::int[])
             AND (cas_number IS NULL OR cas_number = $1)`,
          [rec.cas_number, rec.ingredient_slug, rec.rm_ids]
        );
        stats.cn_updated += cnResult.rowCount ?? 0;
      }

      // 3. Update supplier_product for this supplier + rm_ids
      if (Array.isArray(rec.rm_ids) && rec.rm_ids.length > 0 && rec.sup_id) {
        const certifications = {};
        if (rec.vegan_status)      certifications.vegan = rec.vegan_status;
        if (rec.halal_status)      certifications.halal = rec.halal_status;
        if (rec.kosher_status)     certifications.kosher = rec.kosher_status;
        if (rec.non_gmo_status)    certifications.non_gmo = rec.non_gmo_status;
        if (rec.organic_status)    certifications.organic = rec.organic_status;

        const spResult = await client.query(
          `UPDATE supplier_product
           SET country          = COALESCE($1, country),
               region           = COALESCE($2, region),
               sup_url          = COALESCE($3, sup_url),
               product_page_url = COALESCE($4, product_page_url),
               spec_sheet_url   = COALESCE($5, spec_sheet_url),
               price_per_unit   = COALESCE($6, price_per_unit),
               certifications   = COALESCE($7::jsonb, certifications),
               enriched_at      = NOW()
           WHERE supplier_id = $8
             AND product_id = ANY($9::int[])`,
          [
            rec.country ?? null,
            rec.region ?? null,
            rec.sup_url ?? null,
            rec.sup_product_url ?? null,
            rec.sup_spec_url ?? null,
            parsePrice(rec.price),
            Object.keys(certifications).length > 0 ? JSON.stringify(certifications) : null,
            rec.sup_id,
            rec.rm_ids,
          ]
        );
        stats.sp_updated += spResult.rowCount ?? 0;
      }

      await client.query("COMMIT");
      console.log(`  OK: ${rec.id}  (cas=${rec.cas_number})`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ERROR: ${rec.id}:`, err.message);
    } finally {
      client.release();
    }
  }

  return stats;
}

console.log(DRY_RUN ? "=== DRY RUN ===" : "=== Ingesting enrichments.jsonl → PostgreSQL ===");
console.log(`Source: ${JSONL_PATH}\n`);

ingest()
  .then((stats) => {
    console.log(`\nDone:`);
    console.log(`  Total records:          ${stats.total}`);
    console.log(`  ingredient_profile rows: ${stats.profiles_upserted}`);
    console.log(`  component_normalized:   ${stats.cn_updated} rows updated`);
    console.log(`  supplier_product:       ${stats.sp_updated} rows updated`);
    console.log(`  Skipped (no CAS):       ${stats.skipped_no_cas}`);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
