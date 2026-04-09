# Agnes Enrichment Pipeline — Reference

## Overview

The enrichment pipeline collects real-world data (certifications, pricing, regulatory status, supplier geo) for each **(ingredient, supplier)** pair and stores results in a JSONL file.

**Atomic unit**: one record = one `(ingredient_slug, sup_id)` pair.  
`ingredient_slug` is derived from the RM SKU by stripping the company prefix (`RM-C{N}-`) and hash suffix (`-{8hex}`). This deduplicates across all companies that buy the same ingredient.

Same ingredient from two suppliers → two records.  
Same ingredient used by 17 companies → still two records (all `rm_ids` captured in the record).

**Target size**: ~655 unique (ingredient, supplier) pairs (vs 1,633 raw DB pairs before dedup).

---

## End-to-End Scraping Workflow

```
Step 1 — BROWSE (optional, via Agnes UI)
  Run: cd data_enrichment && uv run uvicorn backend.main:app --reload
  Open: http://localhost:8000
  Navigate: Company → BOM → click an ingredient
  → Detail panel shows all DB suppliers + inferred flags
  → Click "Copy enrichment prompt"

Step 2 — CHECK STATUS
  python data_enrichment/backend/enrichment_status.py --summary
  → shows total/done/pending and next ingredient_slug to enrich

Step 3 — GENERATE PROMPT
  python data_enrichment/backend/next_enrichment.py
  → prints enrichment prompt for next pending (ingredient, supplier) pair

Step 4 — SCRAPE (Claude Code)
  Paste prompt into Claude Code session (or use prompts/enrichment_loop.md).
  Claude runs per DB supplier:
    a. WebSearch → PubChem (cas_number, canonical_name)
    b. WebSearch → patent_lock, market_ban_eu, market_ban_us
    c. WebSearch/Playwright → supplier product page (sup_product_url, price/MOQ, certs)
    d. WebSearch → FG product page (label_form_claim, health_claim_form)
    e. WebSearch → global manufacturer list → single_manufacturer, discovered[]
  Returns: EnrichmentRecord per supplier (see data_enrichment/backend/schemas.py)

Step 5 — SAVE & APPEND
  Claude writes records to enrichments/tmp.json (Write tool), then runs:
    python data_enrichment/backend/append_enrichment.py enrichments/tmp.json
  Idempotency key: ingredient_slug + sup_id — skips already-written records.
  Appends new records to enrichments/enrichments.jsonl.

Step 6 — VERIFY
  python data_enrichment/backend/enrichment_status.py --summary
  → done count should have increased
```

---

## JSONL Storage

All enrichment results are stored in a single append-only file:

```
enrichments/enrichments.jsonl    ← one JSON record per line
```

Each record key: `"{ingredient_slug}__{sup_id}__{YYYYMMDD}"`

Example records:
```
{"id": "vitamin-d3-cholecalciferol__7__20260408", "ingredient_slug": "vitamin-d3-cholecalciferol", "rm_ids": [142, 301, 412], "sup_id": 7, ...}
{"id": "vitamin-d3-cholecalciferol__28__20260408", "ingredient_slug": "vitamin-d3-cholecalciferol", "rm_ids": [142, 301, 412], "sup_id": 28, ...}
```

---

## DB Extension (future — `migrations/001_enrichment_columns.sql`)

When ready to write enrichment results back to SQLite, run:
```
sqlite3 data/db.sqlite < migrations/001_enrichment_columns.sql
```

Columns added to `Product` (ingredient-level, same across all companies):
`cas_number`, `functional_role`, `patent_lock`, `single_manufacturer`,
`market_ban_eu`, `market_ban_us`, `vegan_status`, `vegetarian_status`,
`halal_status`, `kosher_status`, `non_gmo_status`, `organic_status`,
`allergen_flags`, `salt_ester_form`, `label_form_claim`, `health_claim_form`, `enriched_at`

Columns added to `Supplier`: `country`, `region`, `company_url`

Columns added to `Supplier_Product`: `product_page_url`, `spec_sheet_url`,
`price_per_unit`, `price_unit`, `price_moq`, `price_currency`, `price_as_of`, `certifications`

New table `DiscoveredSupplier`: staging for suppliers found during scraping (promoted=0 until reviewed).

---

## Key Substitution Query (post-enrichment, after migration applied)

```sql
-- Find substitutable alternatives for a given ingredient (by cas_number)
SELECT
    p.SKU                    AS candidate_sku,
    p.cas_number,
    p.vegan_status,
    p.patent_lock,
    p.market_ban_eu,
    p.market_ban_us,
    p.allergen_flags,
    s.Name                   AS supplier,
    s.country,
    s.region,
    sp.price_per_unit,
    sp.price_unit,
    sp.certifications,
    sp.product_page_url
FROM Product p
JOIN Supplier_Product sp ON p.Id = sp.ProductId
JOIN Supplier s          ON sp.SupplierId = s.Id
WHERE
    p.cas_number = :target_cas_number
    AND p.patent_lock != 'yes'
    AND p.market_ban_eu != 'banned'
ORDER BY sp.price_per_unit ASC NULLS LAST;
```

---

## Schema Reference

Schema: `data_enrichment/backend/schemas.py` → `EnrichmentRecord`  
Mock example: `data_enrichment/backend/mock_enrichment.json`

### Top-level fields

| field | type | notes |
|-------|------|-------|
| id | str | `{ingredient_slug}__{sup_id}__{YYYYMMDD}` |
| ingredient_slug | str | e.g. `vitamin-d3-cholecalciferol` |
| rm_ids | list[int] | all Product.Id values for this ingredient |
| sup_id | int | Supplier.Id |
| sup_name / sup_url / sup_product_url / sup_spec_url | str | supplier identity |
| country / region | str | supplier location |
| price / price_per_unit / price_unit / price_moq | str/float | pricing |
| fg_skus | list[str] | all FG SKUs across all companies using this ingredient |
| cas_number, canonical_name, functional_role | str | identity criteria |
| patent_lock, single_manufacturer | str | availability criteria |
| market_ban_eu, market_ban_us | str | regulatory criteria |
| vegan/vegetarian/halal/kosher/non_gmo/organic status | str | certification criteria |
| allergen_flags | list | e.g. `["soy"]` |
| label_form_claim, health_claim_form | str | label criteria |
| salt_ester_form, dose_conversion_factor, stereoisomer_form | str | optional form criteria |
| strain_designation, bioequivalence | str | optional — probiotics / substitution |
| verify | list[str] | criterion keys flagged for human review |
| discovered | list[DiscoveredSupplier] | new suppliers found during research |
| refs | list[Ref] | all source URLs used, with type + note |
| enriched_at | str | ISO datetime |

---

## File Layout

```
enrichments/
  enrichments.jsonl             ← all results, one record per line

data_enrichment/
  backend/
    schemas.py                  ← Pydantic models (EnrichmentRecord)
    mock_enrichment.json        ← complete filled example
    main.py                     ← FastAPI backend (Agnes UI)
    enrichment_status.py        ← check progress / next pending pair
    next_enrichment.py          ← generate enrichment prompt
    append_enrichment.py        ← append tmp.json → enrichments.jsonl
  frontend/
    index.html                  ← Agnes single-file UI
  docs/
    scraping_and_ingestion.md   ← this file
  prompts/
    enrichment_loop.md          ← kickoff prompt for Claude Code loop

migrations/
  001_enrichment_columns.sql    ← ALTER TABLE statements (run when ready)

data/
  db.sqlite                     ← SQLite DB (shared with main app)
```
