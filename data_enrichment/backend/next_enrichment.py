"""
next_enrichment.py — generate the enrichment prompt for the next pending (ingredient, supplier) pair.

Idempotency: tracks progress via enrichments/enrichments.jsonl.
A pair is "done" if its ingredient_slug__sup_id appears in the JSONL.
Target set is deduplicated: one row per (ingredient_slug, supplier) across all companies.

Usage:
    python data_enrichment/backend/next_enrichment.py               # prompt for next pending pair
    python data_enrichment/backend/next_enrichment.py --all         # prompts for ALL pending pairs
    python data_enrichment/backend/next_enrichment.py --batch N     # prompts for next N pairs
    python data_enrichment/backend/next_enrichment.py --status      # progress summary

Output is printed to stdout — copy into a Claude Code session.
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH    = Path(__file__).parent.parent.parent / "data" / "db.sqlite"
JSONL_PATH = Path(__file__).parent.parent.parent / "enrichments" / "enrichments.jsonl"


_SLUG_EXPR = """
    SUBSTR(
        SUBSTR(p.SKU, 1, LENGTH(p.SKU) - 9),
        INSTR(SUBSTR(p.SKU, 4), '-') + 4
    )
""".strip()


def load_done_keys() -> set[str]:
    """Return set of 'ingredient_slug__sup_id' already in JSONL."""
    if not JSONL_PATH.exists():
        return set()
    keys = set()
    with open(JSONL_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                slug   = rec.get("ingredient_slug")
                sup_id = rec.get("sup_id")
                if slug and sup_id is not None:
                    keys.add(f"{slug}__{sup_id}")
            except json.JSONDecodeError:
                pass
    return keys


def get_pending_pairs(conn, limit: int | None = None) -> list[dict]:
    """Deduplicated target set: one row per (ingredient_slug, supplier)."""
    done = load_done_keys()
    cur = conn.execute(f"""
        SELECT
            {_SLUG_EXPR}               AS ingredient_slug,
            GROUP_CONCAT(p.Id)         AS rm_ids,
            GROUP_CONCAT(p.SKU)        AS rm_skus,
            s.Id                       AS supplier_id,
            s.Name                     AS supplier_name
        FROM Supplier_Product sp
        JOIN Product  p ON p.Id  = sp.ProductId
        JOIN Supplier s ON s.Id  = sp.SupplierId
        WHERE p.Type = 'raw-material'
        GROUP BY ingredient_slug, s.Id
        ORDER BY ingredient_slug, s.Name
    """)
    all_pairs = []
    for r in cur.fetchall():
        all_pairs.append({
            "ingredient_slug": r[0],
            "rm_ids":          [int(x) for x in r[1].split(",")],
            "rm_skus":         r[2].split(","),
            "supplier_id":     r[3],
            "supplier_name":   r[4],
        })
    pending = [r for r in all_pairs if f"{r['ingredient_slug']}__{r['supplier_id']}" not in done]
    return pending[:limit] if limit else pending


def get_context(conn, ingredient_slug: str, rm_ids: list[int], supplier_id: int) -> dict:
    """Return all suppliers for this ingredient and all FGs across all rm_ids."""
    # All suppliers linked to ANY of the rm_ids for this ingredient
    placeholders = ",".join("?" * len(rm_ids))
    cur = conn.execute(f"""
        SELECT DISTINCT s.Id, s.Name
        FROM Supplier_Product sp
        JOIN Supplier s ON s.Id = sp.SupplierId
        WHERE sp.ProductId IN ({placeholders})
        ORDER BY s.Name
    """, rm_ids)
    suppliers = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

    # All FGs across all rm_ids (deduplicated)
    cur = conn.execute(f"""
        SELECT DISTINCT fg.SKU AS fg_sku, c.Name AS company, c.Id AS company_id
        FROM BOM_Component bc
        JOIN BOM b       ON b.Id = bc.BOMId
        JOIN Product fg  ON fg.Id = b.ProducedProductId
        JOIN Company c   ON c.Id = fg.CompanyId
        WHERE bc.ConsumedProductId IN ({placeholders})
        ORDER BY c.Name
    """, rm_ids)
    fgs = [{"fg_sku": r[0], "company": r[1], "company_id": r[2]} for r in cur.fetchall()]

    return {"suppliers": suppliers, "fgs": fgs}


def infer_market(fg_sku: str) -> str:
    MARKET_MAP = {
        "walmart": "Walmart (Mass)",
        "target": "Target (Mass)",
        "costco": "Costco (Bulk)",
        "cvs": "CVS (Drug)",
        "walgreens": "Walgreens (Drug)",
        "amazon": "Amazon",
        "vitacost": "Vitacost (Online)",
        "iherb": "iHerb (Specialty)",
        "the-vitamin-shoppe": "The Vitamin Shoppe (Specialty)",
        "vitamin-shoppe": "The Vitamin Shoppe (Specialty)",
        "whole-foods": "Whole Foods (Natural)",
        "sprouts": "Sprouts (Natural)",
        "gnc": "GNC (Specialty)",
        "direct": "Direct / DTC",
        "dtc": "Direct / DTC",
    }
    slug = fg_sku.replace("FG-", "").lower()
    tokens = slug.split("-")
    for length in range(len(tokens) - 1, 0, -1):
        candidate = "-".join(tokens[:length])
        if candidate in MARKET_MAP:
            return MARKET_MAP[candidate]
    return f"{tokens[0]} (Unknown)"


def canonical_name(sku: str) -> str:
    import re
    name = re.sub(r"^RM-C\d+-", "", sku)
    name = re.sub(r"-[0-9a-f]{8}$", "", name)
    return name.replace("-", " ")


def build_prompt(ingredient_slug: str, rm_ids: list[int], rm_skus: list[str],
                 supplier_id: int, supplier_name: str, ctx: dict) -> str:
    canon = canonical_name(rm_skus[0])
    date  = datetime.now().strftime("%Y%m%d")

    supplier_lines = "\n".join(f"  - \"{s['name']}\" (supplier_id: {s['id']})" for s in ctx["suppliers"])
    fg_lines       = "\n".join(f"  - {f['fg_sku']} ({f['company']}, company_id: {f['company_id']})" for f in ctx["fgs"])
    all_fg_skus    = [f["fg_sku"] for f in ctx["fgs"]]
    market         = infer_market(ctx["fgs"][0]["fg_sku"]) if ctx["fgs"] else "unknown"
    example_fg     = ctx["fgs"][0] if ctx["fgs"] else {"fg_sku": "unknown", "company": "unknown", "company_id": "unknown"}
    rm_ids_str     = ", ".join(str(i) for i in rm_ids)

    all_supplier_skeletons = []
    for s in ctx["suppliers"]:
        rec_id = f"{ingredient_slug}__{s['id']}__{date}"
        all_supplier_skeletons.append(f'''    {{
      "id": "{rec_id}",
      "ingredient_slug": "{ingredient_slug}",
      "rm_ids": [{rm_ids_str}],
      "sup_id": {s["id"]},
      "sup_name": "{s["name"]}",
      "sup_url": null,
      "sup_product_url": null,
      "sup_spec_url": null,
      "country": null,
      "region": null,
      "price": null,
      "fg_skus": {json.dumps(all_fg_skus)},
      "cas_number": null,
      "canonical_name": null,
      "functional_role": null,
      "patent_lock": null,
      "single_manufacturer": null,
      "market_ban_eu": null,
      "market_ban_us": null,
      "vegan_status": null,
      "vegetarian_status": null,
      "halal_status": null,
      "kosher_status": null,
      "non_gmo_status": null,
      "organic_status": null,
      "allergen_flags": null,
      "label_form_claim": null,
      "health_claim_form": null,
      "verify": [],
      "discovered": [],
      "refs": [],
      "enriched_at": "<ISO datetime now>",
      "pipeline_version": "1.0"
    }}''')

    skeletons = ",\n".join(all_supplier_skeletons)

    return f"""# Agnes Ingredient Enrichment Task

## Project Context
You are working on the Agnes sourcing agent — a supply chain tool for dietary supplement companies.
The project lives at the current working directory. Key files:
  - data_enrichment/backend/schemas.py           → Pydantic schema (EnrichmentRecord)
  - data_enrichment/backend/mock_enrichment.json → Complete filled example — READ THIS FIRST
  - data_enrichment/docs/scraping_and_ingestion.md → Full workflow reference
  - data/db.sqlite                               → SQLite DB (61 companies, 149 BOMs, 876 RMs, 40 suppliers)

READ backend/mock_enrichment.json and backend/schemas.py before doing anything else.

---

## Your Task
Enrich the raw material below for ALL its DB suppliers.
Produce one JSON object per supplier and append each to enrichments/enrichments.jsonl.

IMPORTANT — idempotency:
  Before starting: check enrichments/enrichments.jsonl for lines where
    ingredient_slug == "{ingredient_slug}" AND sup_id == <id>
  If a line exists for a supplier: SKIP that supplier, do not re-enrich.
  Only enrich suppliers not yet present in the JSONL.

---

## Input Data (from SQLite DB — facts)

Ingredient
  ingredient_slug : {ingredient_slug}
  rm_ids          : [{rm_ids_str}]  ← all Product.Id values for this ingredient across companies
  Canonical name  : {canon}

DB Suppliers ({len(ctx["suppliers"])}) — produce one output object per supplier:
{supplier_lines}

Used in {len(ctx["fgs"])} finished good(s) across all companies:
{fg_lines}

Slug-inferred hints (unverified — confirm via web):
  market context : {market}
  organic        : {"Yes" if "organic-" in ingredient_slug else "No"}
  non-gmo        : {"Yes" if "non-gmo" in ingredient_slug else "No"}
  patent signal  : {"Yes — check slug" if any(b in ingredient_slug for b in ["magtein","aquamin","bl-04","fruitex","fructoborate","corn-zein"]) else "None detected"}

---

## Tools to Use

Playwright MCP (available in this session):
  mcp__playwright__browser_navigate     → open a URL
  mcp__playwright__browser_snapshot     → read page content as text
  mcp__playwright__browser_take_screenshot → capture cert badges / prices visually

WebSearch — for PubChem, patent lookup, regulatory status, FG brand pages.

---

## Research Steps

### Phase 1 — Once per ingredient (PARALLELISE — fire all searches simultaneously)

Steps 2–6 are fully independent. Issue them all as parallel WebSearch calls in a
single message before processing any result. Do NOT do them sequentially.

1. READ data_enrichment/backend/mock_enrichment.json — understand exact output format.
2. **PubChem** — search "{canon} CAS site:pubchem.ncbi.nlm.nih.gov"
   → cas_number, canonical_name. Reuse for ALL supplier records.
3. **FG product page** — search "{example_fg['company']} {example_fg['fg_sku']} supplement facts"
   → Playwright: find Supplement Facts panel. Extract: label_form_claim, health_claim_form.
   → Reuse for ALL supplier records.
4. **Patent check** — search "{canon} patent trademark"
   → patent_lock verdict. Reuse for all suppliers.
5. **Regulatory** — fire BOTH in parallel:
     EU: "{canon} EFSA EU food supplement permitted"
     US: "{canon} GRAS FDA supplement"
   → market_ban_eu + market_ban_us. Reuse for all suppliers.
6. **Global manufacturers** — search "{canon} manufacturer supplier global"
   → single_manufacturer verdict + discovered[] list. Reuse for all suppliers.

### Phase 2 — Once per supplier (PARALLELISE across suppliers where possible)

If there are multiple suppliers, launch their product-page searches in parallel
(one WebSearch per supplier simultaneously), then use Playwright on each result.

7. **Supplier product page** — search "{canon} {{supplier_name}} bulk ingredient"
   → Playwright: navigate, snapshot.
   → Extract: sup_product_url, sup_spec_url, price/MOQ, country/region, cert badges
      (vegan, halal, kosher, non_gmo, organic — these CAN differ per supplier).
8. **Geo-location** — confirm country + region for this supplier.

---

## Criterion Field Reference (direct top-level fields in each record)

Required (always populate — use "unknown" if not found):
  cas_number          → CAS string or "unknown"
  canonical_name      → confirmed name
  functional_role     → "active"|"excipient"|"processing_aid"|"unknown"
  patent_lock         → "yes"|"no"|"uncertain"
  single_manufacturer → "yes"|"no"|"unknown"
  market_ban_eu       → "permitted"|"banned"|"restricted"|"unknown"
  market_ban_us       → "permitted"|"banned"|"restricted"|"unknown"
  vegan_status        → "yes"|"no"|"uncertain"|"unknown"
  vegetarian_status   → "yes"|"no"|"uncertain"|"unknown"
  halal_status        → "certified"|"compliant"|"non_compliant"|"unknown"
  kosher_status       → "certified"|"compliant"|"non_compliant"|"unknown"
  non_gmo_status      → "certified"|"standard"|"gmo"|"unknown"
  organic_status      → "certified"|"conventional"|"unknown"
  allergen_flags      → list e.g. ["soy"] or [] or null
  label_form_claim    → exact form from FG label or "not_specified" or "unknown"
  health_claim_form   → branded claim or "none" or "unknown"

Optional (include only when applicable):
  salt_ester_form         → form name or omit if not applicable
  dose_conversion_factor  → decimal string or omit
  stereoisomer_form       → "d"|"dl"|"l"|"racemic" or omit
  strain_designation      → strain code or omit (probiotics only)
  bioequivalence          → "equivalent"|"not_equivalent"|"requires_study" or omit

verify[] — list criterion keys needing human review (e.g. ["halal_status", "kosher_status"])

refs[] — one shared list of all source URLs used:
  {{"url": "...", "type": "web_search|playwright|db|kb", "note": "what this URL supports"}}

---

## Output — write then append

DO NOT use inline python -c with the data — shell escaping will break on quotes.
Instead use two steps:

Step 1: Write your enrichment records to a temp file using the Write tool:
  Path: enrichments/tmp.json
  Content: a JSON array [ {{...record1...}}, {{...record2...}} ]

Step 2: Run the append script:
  python data_enrichment/backend/append_enrichment.py enrichments/tmp.json

The script handles: strip_empty (drops not_applicable entries with no evidence),
idempotency check (skips already-written records), and appending to enrichments.jsonl.

After appending, verify with: python data_enrichment/backend/enrichment_status.py --summary

Skeleton per record:
{skeletons}

Full example: data_enrichment/backend/mock_enrichment.json
Schema: data_enrichment/backend/schemas.py → class EnrichmentRecord

After appending, run: python data_enrichment/backend/enrichment_status.py --summary
Then run: python data_enrichment/backend/next_enrichment.py   ← to get the next pending pair
"""


def main():
    args = sys.argv[1:]

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    if "--status" in args:
        dk    = load_done_keys()
        total = len(get_pending_pairs(conn)) + len(dk)
        print(f"Enrichment progress: {len(dk)}/{total} done ({total - len(dk)} pending)")
        conn.close()
        return

    batch = None
    if "--batch" in args:
        idx = args.index("--batch")
        batch = int(args[idx + 1])
    elif "--all" not in args:
        batch = 1

    # Get all pairs to know total; get pending separately
    all_p  = get_pending_pairs(conn)
    done_k = load_done_keys()
    total  = len(all_p) + len(done_k)

    pending = all_p[:batch] if batch else all_p

    if not pending:
        print("All (ingredient, supplier) pairs are enriched. Nothing to do.")
        conn.close()
        return

    print(f"# Progress: {len(done_k)}/{total} done — generating prompt(s) for {len(pending)} pair(s)\n")

    for row in pending:
        ctx = get_context(conn, row["ingredient_slug"], row["rm_ids"], row["supplier_id"])
        prompt = build_prompt(
            row["ingredient_slug"], row["rm_ids"], row["rm_skus"],
            row["supplier_id"], row["supplier_name"], ctx
        )
        print(prompt)
        print("\n" + "=" * 80 + "\n")

    conn.close()


if __name__ == "__main__":
    main()
