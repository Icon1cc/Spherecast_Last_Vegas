"""
enrichment_status.py — machine-readable status for the enrichment pipeline.

Tracks progress via enrichments/enrichments.jsonl.
Target set is deduplicated by ingredient_slug × supplier (not rm_id × supplier).

Exit codes:
  0 = pending work exists
  1 = all pairs enriched (nothing to do)

Usage:
    python data_enrichment/backend/enrichment_status.py              # next pending pair as JSON
    python data_enrichment/backend/enrichment_status.py --summary    # human-readable progress
    python data_enrichment/backend/enrichment_status.py --pending    # all pending as JSON array
    python data_enrichment/backend/enrichment_status.py --check <slug> <sup_id>
"""

import sys
import json
import sqlite3
from pathlib import Path

DB_PATH    = Path(__file__).parent.parent.parent / "data" / "db.sqlite"
JSONL_PATH = Path(__file__).parent.parent.parent / "enrichments" / "enrichments.jsonl"


def done_keys() -> set[str]:
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


# SQLite expression to extract ingredient_slug from SKU:
#   RM-C14-calcium-1b8fb86e  →  calcium
#   RM-C1-calcium-citrate-05c28cc3  →  calcium-citrate
_SLUG_EXPR = """
    SUBSTR(
        SUBSTR(p.SKU, 1, LENGTH(p.SKU) - 9),
        INSTR(SUBSTR(p.SKU, 4), '-') + 4
    )
""".strip()


def all_pairs(conn) -> list[dict]:
    """Deduplicated target set: one row per (ingredient_slug, supplier)."""
    cur = conn.execute(f"""
        SELECT
            {_SLUG_EXPR}                    AS ingredient_slug,
            GROUP_CONCAT(p.Id)              AS rm_ids,
            GROUP_CONCAT(p.SKU)             AS rm_skus,
            s.Id                            AS supplier_id,
            s.Name                          AS supplier_name
        FROM Supplier_Product sp
        JOIN Product  p ON p.Id  = sp.ProductId
        JOIN Supplier s ON s.Id  = sp.SupplierId
        WHERE p.Type = 'raw-material'
        GROUP BY ingredient_slug, s.Id
        ORDER BY ingredient_slug, s.Name
    """)
    rows = []
    for r in cur.fetchall():
        rows.append({
            "ingredient_slug": r[0],
            "rm_ids":          [int(x) for x in r[1].split(",")],
            "rm_skus":         r[2].split(","),
            "supplier_id":     r[3],
            "supplier_name":   r[4],
        })
    return rows


def pair_key(slug: str, supplier_id: int) -> str:
    return f"{slug}__{supplier_id}"


def main():
    args = sys.argv[1:]

    conn = sqlite3.connect(str(DB_PATH))
    pairs = all_pairs(conn)
    conn.close()

    done     = done_keys()
    pending  = [r for r in pairs if pair_key(r["ingredient_slug"], r["supplier_id"]) not in done]
    finished = [r for r in pairs if pair_key(r["ingredient_slug"], r["supplier_id"]) in done]

    if "--summary" in args:
        print(f"total: {len(pairs)}  done: {len(finished)}  pending: {len(pending)}")
        if pending:
            p = pending[0]
            print(f"next:  slug={p['ingredient_slug']}  supplier_id={p['supplier_id']}  supplier={p['supplier_name']}")
        else:
            print("next:  none — all done")
        sys.exit(0 if pending else 1)

    if "--check" in args:
        idx  = args.index("--check")
        slug = args[idx + 1]
        sid  = int(args[idx + 2])
        key  = pair_key(slug, sid)
        if key in done:
            print(json.dumps({"status": "done", "ingredient_slug": slug, "supplier_id": sid}))
            sys.exit(1)
        else:
            print(json.dumps({"status": "pending", "ingredient_slug": slug, "supplier_id": sid}))
            sys.exit(0)

    if "--pending" in args:
        print(json.dumps([
            {"ingredient_slug": r["ingredient_slug"], "rm_ids": r["rm_ids"],
             "supplier_id": r["supplier_id"], "supplier_name": r["supplier_name"]}
            for r in pending
        ], indent=2))
        sys.exit(0 if pending else 1)

    # Default: next pending pair as JSON
    if not pending:
        print(json.dumps({"status": "all_done", "total": len(pairs)}))
        sys.exit(1)

    nxt = pending[0]
    print(json.dumps({
        "status":   "pending",
        "progress": f"{len(finished)}/{len(pairs)}",
        "remaining": len(pending),
        "next": {
            "ingredient_slug": nxt["ingredient_slug"],
            "rm_ids":          nxt["rm_ids"],
            "rm_skus":         nxt["rm_skus"],
            "supplier_id":     nxt["supplier_id"],
            "supplier_name":   nxt["supplier_name"],
        }
    }, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
