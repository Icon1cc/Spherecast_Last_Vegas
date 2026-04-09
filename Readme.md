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

### Analysis Page
- AI-powered supplier recommendations backed by real-world enrichment data
- Supplier comparison charts (Bar + Radar)
- **5 criteria sliders aligned to actual enrichment fields:**
  - Price / Cost (backed by `supplier_product.price_per_unit`)
  - Regulatory Compliance (backed by `ingredient_profile.market_ban_eu/us`)
  - Certification Fit (vegan/halal/kosher/non-GMO/organic match)
  - Supply Risk (patent lock, single manufacturer, geographic diversity)
  - Functional Fit (functional role, bioequivalence)
- Gemini reasoning with enrichment context
- Extended compliance grid: vegan, halal, non-GMO, organic, kosher, EU/US market bans, patent lock
- Purchase/spec sheet links per supplier row
- "Choose as substitute" action with confirmation banner
- Sources accordion showing refs backing each claim

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

Agnes uses a **cascading 3-tier architecture** to find substitutes, combining deterministic DB queries with LLM reasoning:

```
Ingredient (CAS known?)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 1 — Same molecule, different supplier                  │
│ SQL: match cas_number, exclude current supplier             │
│ Ordered by price ASC. Drop-in replacement, no reformulation.│
└─────────────────────────────────────────────────────────────┘
       │  (runs in parallel)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 2 — Same functional role, compliance-compatible        │
│ SQL: match functional_role + hard filters:                  │
│   patent_lock != yes, market_ban_eu matches, vegan matches  │
│ Different molecule — requires reformulation review.         │
└─────────────────────────────────────────────────────────────┘
       │  (runs in parallel)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 3 — Gemini AI picks the single best candidate          │
│ Input: top-5 Tier 1 + top-5 Tier 2 + compliance profile    │
│         + user priority weights (sliders 1–10)              │
│ Output: recommendation + confidence + 4-factor reasoning:  │
│   functional equivalence · compliance fit ·                 │
│   supply risk · cost impact                                 │
└─────────────────────────────────────────────────────────────┘
```

**Per-row reasoning** in the Tier 1/2 tables is generated client-side from enrichment data fields (price, certifications, country, compliance status) and highlights which slider priorities each candidate satisfies.

**"Why This Supplier?"** on the Analysis page is a separate Gemini call that writes a 3-4 sentence explanation for the top-ranked supplier, citing specific price points, certifications, and geographic diversification benefits from the enrichment DB.

All reasoning is grounded in real enrichment data scraped from supplier websites — not hallucinated. Each claim links back to a source ref in the Sources accordion.

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

The Agnes enrichment loop runs in a Claude Code session to save credits, could also run headlessly in the background. It web-searches each ingredient+supplier pair, if necessary navigates websites with playwright to find extra information and outputs structured JSONL records.

```bash
# Check progress
python data_enrichment/backend/enrichment_status.py --summary

# Start a new enrichment session (paste kickoff prompt into Claude Code)
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
