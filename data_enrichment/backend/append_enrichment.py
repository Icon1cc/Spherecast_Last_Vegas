"""
append_enrichment.py — read a JSON file and append records to enrichments.jsonl

Usage:
    python data_enrichment/backend/append_enrichment.py enrichments/tmp.json

Input: single record (dict) or list of records in the flat EnrichmentRecord schema.
Idempotency key: ingredient_slug + sup_id — skips records already in the JSONL.
"""

import sys
import json
from pathlib import Path

JSONL_PATH = Path(__file__).parent.parent.parent / "enrichments" / "enrichments.jsonl"


def load_done_keys() -> set[str]:
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


def main():
    if len(sys.argv) < 2:
        print("Usage: python data_enrichment/backend/append_enrichment.py <input.json>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    data = json.loads(input_path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else [data]

    done = load_done_keys()
    JSONL_PATH.parent.mkdir(exist_ok=True)

    written = 0
    skipped = 0
    with open(JSONL_PATH, "a", encoding="utf-8") as f:
        for rec in records:
            slug   = rec.get("ingredient_slug")
            sup_id = rec.get("sup_id")
            if not slug or sup_id is None:
                raise ValueError(f"Record missing ingredient_slug or sup_id: {rec.get('id', '?')}")
            key = f"{slug}__{sup_id}"
            if key in done:
                print(f"  SKIP (already exists): {rec.get('id', key)}")
                skipped += 1
                continue
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            done.add(key)  # prevent duplicates within same input file
            n_refs = len(rec.get("refs", []))
            print(f"  WRITTEN: {rec.get('id', key)}  ({n_refs} refs)")
            written += 1

    print(f"\nDone: {written} written, {skipped} skipped")


if __name__ == "__main__":
    main()
