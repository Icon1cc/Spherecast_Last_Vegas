# Agnes Enrichment Loop — Claude Code Kickoff Prompt

Paste this into a Claude Code session to run the enrichment pipeline.
Adjust the iteration limit as needed (default: 5 per session).

---

You are running the Agnes enrichment pipeline. Repeat the following cycle for up to 5 iterations (adjust as needed), then stop.

CYCLE:

1. Run: python data_enrichment/backend/enrichment_status.py
   - If status is "all_done" → stop and print final summary
   - Otherwise note: ingredient_slug, supplier_id, supplier_name from "next"

2. Run: python data_enrichment/backend/next_enrichment.py
   - Read the full output carefully — it contains all input data, research steps, and the output skeleton

3. Execute the enrichment described in that prompt:
   - Read data_enrichment/backend/mock_enrichment.json first to confirm output format (flat schema — criteria as top-level fields, key is ingredient_slug__sup_id)
   - Use WebSearch + Playwright MCP (mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot) to research each DB supplier
   - Follow all research steps in the prompt

4. Save results using the Write tool:
   - Path: enrichments/tmp.json
   - Content: a JSON array with one object per DB supplier
   - Use the skeleton from the prompt as your starting structure

5. Run: python data_enrichment/backend/append_enrichment.py enrichments/tmp.json
   - Checks for duplicates (ingredient_slug + sup_id) and appends new records to enrichments/enrichments.jsonl
   - Confirm output shows "WRITTEN" for each record

6. Run: python data_enrichment/backend/enrichment_status.py --summary
   - Confirm done count increased by the number of suppliers just enriched
   - Then go back to step 1

Start now with step 1.
