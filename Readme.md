# SupplyWise AI - Agnes Raw Material Intelligence

An AI-powered supply chain decision-support system for CPG (Consumer Packaged Goods) companies, built for the **Q-Hack Hackathon**.

## Challenge Overview

Give Spherecast's AI Supply Chain Manager **"Agnes"** raw material superpowers:
- Find **interchangeable components** (ingredients, packaging, labels)
- Determine **quality and compliance standards** for replacements
- Recommend **best sourcing options** with clear reasoning and evidence

## Deployment

This app is deployed on **Vercel**. Push to main branch to deploy.

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
| Enrichment Pipeline | Python (data_enrichment/) + Claude Code + Playwright MCP |

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
- AI-powered supplier recommendations backed by real enrichment data
- Supplier comparison charts (Bar + Radar)
- **5 criteria sliders aligned to actual enrichment fields:**
  - Price / Cost (backed by `supplier_product.price_per_unit`)
  - Regulatory Compliance (backed by `ingredient_profile.market_ban_eu/us`)
  - Certification Fit (vegan/halal/kosher/non-GMO/organic match)
  - Supply Risk (patent lock, single manufacturer, geographic diversity)
  - Functional Fit (functional role, bioequivalence)
- Gemini reasoning with enrichment context (not just 50-word generic output)

### Tiered Substitution Pipeline
Three tiers of substitution candidates per ingredient:
- **Tier 1** — Same molecule (CAS), alternative suppliers already in DB
- **Tier 2** — Same functional role, compliance-compatible, different molecule
- **Tier 3** — Gemini AI reasoning with structured explanation trace:
  - Functional equivalence
  - Compliance fit
  - Supply risk assessment
  - Cost impact

### Voice-Enabled Chat (Jarvis)
- Two-way voice conversation using ElevenLabs
- Speech-to-Text (STT) with scribe_v1 model
- Text-to-Speech (TTS) with multilingual v2
- Auto-stop recording on silence detection (900ms)
- Gemini-powered AI responses with markdown rendering
- Chat history with multiple sessions

## Database Schema

```
company (61) ──┐
               │
product (1,025)├── finished-good (149)
               └── raw-material (876)

bom (149) ────► bom_component (1,528)

supplier (40) ── supplier_product (1,633)
                  └── enriched: country, price, certifications (418 rows)

component_normalized (876) ── raw_product_id → cas_number
                               └── cas_number linked: 418 rows

ingredient_profile (281) ── keyed by CAS number
  cas_number, canonical_name, functional_role, patent_lock,
  market_ban_eu/us, vegan/halal/kosher/non_gmo/organic status,
  allergen_flags, label_form_claim
```

**AI-Populated Tables:**
- `ingredient_profile` — compliance facts per compound (from Agnes enrichment pipeline)
- `component_normalized` — slug → CAS bridge per product row
- `substitution_candidate` — AI-generated substitution output
- `compliance_verdict` — per-candidate regulatory analysis
- `sourcing_recommendation` — per-BOM sourcing recommendations

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
│   │   └── message.js              # Jarvis AI chat
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
│   ├── backend/
│   │   ├── next_enrichment.py       # Generate enrichment prompts
│   │   ├── append_enrichment.py     # Append results to JSONL
│   │   ├── enrichment_status.py     # Progress tracking
│   │   ├── schemas.py               # Pydantic schema (EnrichmentRecord)
│   │   └── mock_enrichment.json     # Example output
│   └── docs/
│       └── scraping_and_ingestion.md
├── backend/                        # Node.js scripts
│   └── scripts/
│       ├── migrate-sqlite-to-postgres.mjs  # SQLite → Postgres migration
│       └── ingest_enrichments.mjs          # JSONL → Postgres ingest
├── migrations/
│   ├── 001_enrichment_columns.sql   # SQLite enrichment columns
│   └── 002_enrichment_postgres.sql  # Postgres enrichment schema
├── enrichments/
│   └── enrichments.jsonl            # 305 enriched records (137 unique pairs)
├── knowledge_base/                  # Agnes domain knowledge (11 files)
├── prompts/
│   └── enrichment_loop.md           # Claude Code enrichment kickoff prompt
├── data/
│   └── db.sqlite                    # Source SQLite database
└── vercel.json                      # Vercel configuration
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List finished goods with pagination + search |
| GET | `/api/products/bom?id=:id` | Get BOM components |
| POST | `/api/analysis/component` | Supplier analysis (enrichment-aware) |
| GET | `/api/substitution/:componentId` | 3-tier substitution candidates + AI trace |
| POST | `/api/chat/message` | Jarvis AI assistant |
| POST | `/api/elevenlabs/tts` | Text-to-speech |
| POST | `/api/elevenlabs/stt` | Speech-to-text |

## Running the Enrichment Pipeline

The Agnes enrichment loop runs in Claude Code and web-searches each ingredient+supplier pair:

```bash
# Check progress
python data_enrichment/backend/enrichment_status.py --summary

# Run enrichment loop (paste kickoff prompt into Claude Code session)
cat prompts/enrichment_loop.md

# After enrichment, ingest into Postgres
NODE_TLS_REJECT_UNAUTHORIZED=0 node backend/scripts/ingest_enrichments.mjs
```

Current coverage: **305 records / 655 target pairs** (~47%) with 281 unique CAS numbers resolved.

## Local Development

```bash
# Install dependencies
cd frontend && npm install
cd ../api && npm install

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
| Suppliers | 40 |
| Supplier-Product Links | 1,633 |
| BOM Components | 1,528 |
| Enriched ingredient profiles | 281 unique CAS numbers |
| Enriched supplier offers | 418 supplier_product rows |

## License

MIT
