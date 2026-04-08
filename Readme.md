# SupplyWise AI - Agnes Raw Material Intelligence

An AI-powered supply chain decision-support system for CPG (Consumer Packaged Goods) companies, built for the **Q-Hack Hackathon**.

## Challenge Overview

Give Spherecast's AI Supply Chain Manager **"Agnes"** raw material superpowers:
- Find **interchangeable components** (ingredients, packaging, labels)
- Determine **quality and compliance standards** for replacements
- Recommend **best sourcing options** with clear reasoning

## Deployment

This app is deployed on **Vercel**. Push to main branch to deploy automatically.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | Radix UI + Tailwind CSS |
| Backend | Vercel Serverless Functions |
| Database | PostgreSQL (Supabase) |
| AI/LLM | Google Gemini 2.5 Flash |
| Voice | ElevenLabs TTS + STT |
| Charts | Recharts |

## Features Implemented

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
- AI-powered sourcing recommendations
- Supplier comparison charts (Bar + Radar)
- Interactive parameter sliders:
  - Price Priority (1-10)
  - Quality Priority (1-10)
  - Compliance Priority (1-10)
  - Supplier Consolidation (1-10)
  - Lead Time Priority (1-10)
- Confidence scoring with reasoning

### Voice-Enabled Chat (Jarvis)
- Two-way voice conversation using ElevenLabs
- Speech-to-Text (STT) with scribe_v1 model
- Text-to-Speech (TTS) with multilingual v2
- Auto-stop recording on silence detection (900ms)
- Greeting spoken on first mic click per session
- Gemini-powered AI responses
- Chat history with multiple sessions

## Database Schema

```
company (61) ──┐
               │
product (1,025)├── finished-good (149)
               └── raw-material (876)

bom (149) ────► bom_component (1,528)

supplier (40) ── supplier_product (1,633)
```

**AI-Populated Tables** (hackathon deliverables):
- `component_normalized` - Standardized ingredient names
- `substitution_candidate` - Interchangeable components
- `external_evidence` - Web-sourced compliance data
- `compliance_verdict` - Regulatory check results
- `sourcing_recommendation` - Final recommendations

## Project Structure

```
.
├── api/                        # Vercel serverless functions
│   ├── lib/
│   │   └── db.js               # Shared database connection
│   ├── elevenlabs/
│   │   ├── tts.js              # Text-to-speech
│   │   └── stt.js              # Speech-to-text
│   ├── chat/
│   │   └── message.js          # Gemini chat API
│   ├── products/
│   │   ├── index.js            # List products
│   │   └── [id]/
│   │       └── bom.js          # Get BOM components
│   └── analysis/
│       └── component.js        # Supplier analysis
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx   # Voice chat interface
│   │   │   ├── ChatIcon.tsx    # Floating chat button
│   │   │   └── RawMaterialsModal.tsx
│   │   ├── pages/
│   │   │   ├── Index.tsx       # Dashboard
│   │   │   └── AnalysisPage.tsx
│   │   └── lib/
│   │       └── api.ts          # API client
│   └── vite.config.ts
├── backend/                    # Scripts & utilities
│   └── scripts/
│       └── migrate-sqlite-to-postgres.mjs
├── data/
│   └── db.sqlite               # Source database
├── docs/
│   ├── FULL_IMPLEMENTATION_SPEC.md
│   ├── IMPLEMENTATION_GUIDE.md
│   ├── DATA_ANALYSIS.md
│   └── NEXT_STEPS.md
├── challenge-info/             # Hackathon requirements
├── vercel.json                 # Vercel configuration
└── .env                        # Environment variables
```

## Environment Variables

Set these in Vercel dashboard (Settings > Environment Variables):

```env
# Gemini AI
GEMINI_API_KEY=your_key

# ElevenLabs Voice
ELEVENLABS_API_KEY=your_key
VITE_ELEVENLABS_VOICE_ID=s3TPKV1kjDlVtZbl4Ksh
VITE_ELEVENLABS_TTS_MODEL_ID=eleven_multilingual_v2
VITE_ELEVENLABS_STT_MODEL_ID=scribe_v1

# PostgreSQL (Supabase)
POSTGRES_URL=postgres://...
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products with pagination |
| GET | `/api/products/:id/bom` | Get BOM components |
| POST | `/api/chat/message` | Send message to Gemini |
| POST | `/api/analysis/component` | Analyze supplier options |
| POST | `/api/elevenlabs/tts` | Text-to-speech |
| POST | `/api/elevenlabs/stt` | Speech-to-text |

## Data Statistics

| Entity | Count |
|--------|-------|
| Companies | 61 |
| Finished Goods | 149 |
| Raw Materials | 876 |
| Suppliers | 40 |
| Supplier-Product Links | 1,633 |
| BOM Components | 1,528 |

**Top Suppliers by Coverage:**
- Prinova USA: 408 products
- PureBulk: 316 products
- Jost Chemical: 191 products

## Judging Criteria Alignment

| Criterion | Implementation |
|-----------|----------------|
| Practical Usefulness | Real product data, actionable recommendations |
| Strong Reasoning | Gemini provides evidence-based analysis |
| Trustworthiness | Confidence scores, transparent methodology |
| External Data | Extensible framework for web enrichment |
| Substitution Logic | Category-based + supplier overlap analysis |
| Compliance Logic | Weighted scoring across 5 dimensions |
| Recommendations | Ranked suppliers with reasoning |
| Creativity | Voice-enabled AI assistant |

## License

MIT
