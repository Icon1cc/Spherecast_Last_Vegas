# SupplyWise AI — Agnes Raw Material Intelligence

> **Q-Hack Hackathon submission** · **[Live Demo → supplywiseai.vercel.app](https://supplywiseai.vercel.app)**

An AI-powered supply chain decision-support system for CPG (Consumer Packaged Goods) companies, built for the **Q-Hack Hackathon**.

## Quick Start

1. Open **[supplywiseai.vercel.app](https://supplywiseai.vercel.app)**
2. Click **"Start Demo"** on the dashboard for a voice-guided walkthrough (Agnes), _or_ manually pick any finished good → open its BOM → click a raw material → **Analyze**
3. On the Analysis page: review the compliance grid, explore Tier 1/2 substitution candidates, read the AI reasoning card, and choose a substitute

## Challenge Overview

Give Spherecast's AI Supply Chain Manager **"Agnes"** raw material superpowers:
- Find **interchangeable components** (ingredients, packaging, labels)
- Determine **quality and compliance standards** for replacements
- Recommend **best sourcing options** with clear reasoning and evidence

## Deployment

This app is deployed on **Vercel**. Push to main branch to deploy automatically.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | Radix UI + Tailwind CSS |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | PostgreSQL (Supabase / Vercel Postgres) |
| AI/LLM | Google Gemini 2.5 Flash |
| Voice | ElevenLabs TTS + STT |
| Charts | Recharts |
| Enrichment Pipeline | Python (data_enrichment/) + Claude Code + Playwright MCP + Brave Search |

## Features

### Dashboard (Product Catalog)
- Browse 149 finished goods from 61 CPG brands
- Search by SKU or company name
- Pagination with 10 items per page
- Real-time data from PostgreSQL

### Raw Materials Modal
- View Bill of Materials (BOM) for any product
- See all component ingredients
- Navigate to detailed analysis

### Analysis Page — Slider-Driven Scoring

> **The sliders are the core decision engine.** Each directly weights one dimension of the scoring formula — moving a slider changes which supplier ranks first, not just the label text.

Suppliers are ranked by a **data-driven weighted score** across 5 dimensions (0–1 each):

| Slider | Scoring dimension | Data source |
|--------|-------------------|-------------|
| Price / Cost | Relative rank: cheapest supplier = 1.0, priciest = 0.0 | `supplier_product.price_per_unit` |
| Regulatory Compliance | Hard 0 for any market ban; 1.0 for both EU+US permitted | `ingredient_profile.market_ban_eu/us` |
| Certification Fit | Supplier certs matched against ingredient requirements | `supplier_product.certifications` |
| Supply Risk | Patent lock (hard 0), single-manufacturer penalty, geo + count diversity bonus | `ingredient_profile.patent_lock`, `supplier.country` |
| Functional Fit | 1.0 for Tier 1 (same CAS = same molecule) | constant |

**Missing data is handled transparently:** unknown fields default to a 0.5 neutral baseline, then receive an additional penalty proportional to how much you weighted that criterion. If Regulatory = 10 and EU ban status is unknown, the score tanks — if Regulatory = 1, it barely moves.

Each supplier also shows an **evidence quality badge** (e.g. "7/8 criteria verified") listing exactly which compliance criteria are unverified in the DB, plus how many source refs back the data.

Other Analysis page features:
- Gemini "Why This Supplier?" card — 3-4 sentences citing specific data points
- 8-field compliance grid with unknown-state indicators
- Purchase/spec sheet links, "Choose as substitute" action, sources accordion

### Tiered Substitution Pipeline
Three tiers of substitution candidates per ingredient:
- **Tier 1** — Same molecule (CAS), alternative suppliers already in DB
- **Tier 2** — Same functional role, compliance-compatible, different molecule
- **Tier 3** — Gemini AI reasoning with structured explanation trace:
  - Functional equivalence
  - Compliance fit
  - Supply risk assessment
  - Cost impact

### Agnes Demo Mode
- Click **"Start Demo"** on the dashboard to launch a full-screen voice-guided walkthrough
- Animated 3D sphere with state-driven appearance (listening, thinking, speaking, navigating)
- Voice commands parsed into app navigation (intent parser → React Router)
- Demo-specific Gemini prompt with product context awareness

### Voice-Enabled Chat (Agnes)
- Floating chat panel on every page
- Two-way voice conversation using ElevenLabs STT + TTS
- **Google Search grounding**: Agnes detects price/regulation queries and calls Gemini's `googleSearch` tool for real-time web results, appending sources to its reply
- Auto-stop recording on silence detection (900ms)
- Gemini-powered AI responses with markdown rendering

## How Reasoning & Candidate Selection Works

Agnes uses a **cascading 3-tier architecture** combining deterministic DB queries with LLM reasoning:

| Tier | Candidates | Ranking |
|------|-----------|---------|
| **Tier 1** — same CAS, different supplier | SQL match on `cas_number` | 5-dim weighted score (sliders) |
| **Tier 2** — same functional role, compliance-compatible | SQL filter: role match + patent_lock≠yes + market/vegan compatible | 5-dim weighted score |
| **Tier 3** — Gemini picks one best overall | Top-5 Tier 1 + top-5 Tier 2 passed to Gemini with full compliance profile + slider weights | 4-factor reasoning trace: functional equivalence · compliance fit · supply risk · cost impact |

Per-row reasoning in Tier 1/2 tables highlights which slider priorities each candidate satisfies. All claims link back to source refs in the Sources accordion — not hallucinated.

## Database Schema

```
company (61) ──┐
               │
product (1,025)├── finished-good (149)
               └── raw-material (876)

bom (149) ────► bom_component (1,528)

supplier (105) ── supplier_product (~2,000)
                   └── enriched: country, price, certifications, refs, links

component_normalized (876) ── raw_product_id → cas_number
                               └── cas_number linked: 1,102 rows

ingredient_profile (174) ── keyed by CAS number
  cas_number, canonical_name, functional_role, patent_lock,
  market_ban_eu/us, vegan/halal/kosher/non_gmo/organic status,
  allergen_flags, label_form_claim, refs (JSONB)
```

**AI-Populated Tables:**
- `ingredient_profile` — compliance facts per compound (from Agnes enrichment pipeline)
- `component_normalized` — slug → CAS bridge per product row
- `supplier_product` — extended with price, certs, links, refs from enrichment

## Project Structure

```
.
├── api/                            # Vercel serverless functions
│   ├── lib/
│   │   ├── db.js                   # Shared database pool
│   │   ├── constants.js            # All magic values centralized
│   │   ├── validation.js           # Input validation utilities
│   │   └── errors.js               # DB error handling
│   ├── analysis/
│   │   └── component.js            # Supplier analysis (enrichment-aware)
│   ├── substitution/
│   │   └── [componentId].js        # 3-tier substitution + Gemini trace
│   ├── products/
│   │   ├── index.js                # List finished goods
│   │   └── bom.js                  # Get BOM components
│   ├── chat/
│   │   └── message.js              # Agnes AI chat
│   └── elevenlabs/
│       ├── tts.js                  # Text-to-speech
│       └── stt.js                  # Speech-to-text
├── frontend/                       # React application
│   └── src/
│       ├── components/
│       │   ├── ChatPanel.tsx        # Voice chat interface
│       │   └── RawMaterialsModal.tsx
│       ├── pages/
│       │   ├── Index.tsx            # Dashboard
│       │   └── AnalysisPage.tsx     # Analysis + substitution tiers
│       └── lib/
│           └── api.ts               # Typed API client
├── data_enrichment/                # Agnes enrichment pipeline (Python)
│   ├── enrichment_loop.md           # Claude Code kickoff prompt (paste into session)
│   ├── backend/
│   │   ├── next_enrichment.py       # Generate per-pair enrichment prompts
│   │   ├── append_enrichment.py     # Append results to JSONL (dedup check)
│   │   ├── enrichment_status.py     # Progress tracking + summary
│   │   ├── schemas.py               # Pydantic schema (EnrichmentRecord)
│   │   └── mock_enrichment.json     # Example output format
│   └── frontend/
│       └── index.html               # Simple status UI
├── backend/                        # Node.js ingestion scripts
│   └── scripts/
│       ├── migrate-sqlite-to-postgres.mjs   # One-time: migrate source SQLite → Postgres
│       ├── ingest_enrichments.mjs          # enrichments.jsonl → Postgres
│       ├── extract_discovered_suppliers.mjs # Parse discovered[] → new_suppliers.json
│       └── ingest_discovered_suppliers.mjs  # new_suppliers.json → Postgres
├── enrichments/
│   ├── enrichments.jsonl            # 656 enriched records (output of pipeline)
│   └── new_suppliers.json           # 70 discovered suppliers (extract output)
├── data/
│   └── db.sqlite                    # Source SQLite database (local only)
└── vercel.json                      # Vercel configuration
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List finished goods with pagination + search |
| GET | `/api/products/bom?id=:id` | Get BOM components |
| POST | `/api/analysis/component` | Supplier analysis (enrichment-aware) |
| GET | `/api/substitution/:componentId` | 3-tier substitution candidates + AI trace |
| POST | `/api/chat/message` | Agnes AI assistant |
| POST | `/api/elevenlabs/tts` | Text-to-speech |
| POST | `/api/elevenlabs/stt` | Speech-to-text |

## Running the Enrichment Pipeline

The enrichment pipeline is an **agentic research loop** built on Claude's tool-use API. For each (ingredient, supplier) pair it autonomously: queries PubChem for canonical CAS numbers, searches regulatory databases, navigates supplier product pages with Playwright, and emits a validated `EnrichmentRecord` to JSONL.

The pipeline is implemented as a structured agent prompt + tool schema — the same architecture runs interactively (Claude Code, for supervised enrichment with human spot-checks) or headlessly (Claude API with `tool_use`, scheduled via cron or triggered on new supplier ingestion). Switching modes requires no logic changes: the research steps, output schema, and idempotency guarantees are identical in both execution contexts.

```bash
# Check progress
python data_enrichment/backend/enrichment_status.py --summary

# Run enrichment agent (interactive mode)
cat data_enrichment/enrichment_loop.md

# After enrichment, ingest into Postgres
NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/scripts/ingest_enrichments.mjs
```

### Discovered Suppliers Pipeline

During enrichment, the LLM may find suppliers not yet in the DB (stored in `discovered[]` fields). To extract and ingest them:

```bash
# 1. Extract discovered suppliers from JSONL → review file
node backend/scripts/extract_discovered_suppliers.mjs
# → writes enrichments/new_suppliers.json (70 entries)

# 2. Dry-run to preview changes
node backend/scripts/ingest_discovered_suppliers.mjs --dry-run

# 3. Live ingest
NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/scripts/ingest_discovered_suppliers.mjs
```

The alias table in `extract_discovered_suppliers.mjs` handles deduplication — maps division/brand variants (e.g. "BASF Nutrition" → "BASF") and identifies suppliers already in DB (link-only, no INSERT).

## Local Development

```bash
# Install dependencies
cd frontend && npm install

# Set environment variables (copy and fill)
cp .env.example .env

# Run frontend dev server (proxies API calls)
cd frontend && npm run dev
# → http://localhost:5173

# Deploy via Vercel CLI
vercel dev
# → http://localhost:3000
```

### Database Setup

The app uses a Postgres instance (Supabase / Vercel Postgres). To populate it from scratch:

```bash
# 1. Migrate base schema and data into Postgres (one-time)
node backend/scripts/migrate-sqlite-to-postgres.mjs

# 2. Ingest enrichments (ingredient profiles, compliance fields, supplier refs)
NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/scripts/ingest_enrichments.mjs

# 3. Extract any newly discovered suppliers from enrichment records
node backend/scripts/extract_discovered_suppliers.mjs

# 4. Ingest discovered suppliers (dry-run first to review)
node backend/scripts/ingest_discovered_suppliers.mjs --dry-run
NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/scripts/ingest_discovered_suppliers.mjs
```

> All ingestion scripts are idempotent — safe to re-run.

## Environment Variables

```env
# Gemini AI
GEMINI_API_KEY=your_key

# ElevenLabs Voice
ELEVENLABS_API_KEY=your_key
VITE_ELEVENLABS_VOICE_ID=s3TPKV1kjDlVtZbl4Ksh
VITE_ELEVENLABS_TTS_MODEL_ID=eleven_multilingual_v2
VITE_ELEVENLABS_STT_MODEL_ID=scribe_v1

# PostgreSQL (Supabase / Vercel Postgres)
POSTGRES_URL=postgres://...
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
```

## Data Statistics

| Entity | Count |
|--------|-------|
| Companies | 61 |
| Finished Goods | 149 |
| Raw Materials | 876 |
| Suppliers | 105 (40 original + 65 discovered via enrichment) |
| Supplier-Product Links | ~2,000 |
| BOM Components | 1,528 |
| Enriched ingredient profiles | 174 unique CAS numbers |
| Enriched supplier_product rows | 1,102 |
| Enrichment JSONL records | 656 |

## License

MIT
