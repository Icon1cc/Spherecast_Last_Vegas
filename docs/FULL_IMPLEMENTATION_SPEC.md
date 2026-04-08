# Full Implementation Specification

## Project: SupplyWise AI (Placeholder Name - Can Be Changed)

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Lovable (React-based) |
| Backend | Vercel Serverless Functions |
| Database | PostgreSQL (Vercel Postgres) |
| LLM | Google Gemini 2.5 Flash |
| Voice AI | ElevenLabs Conversational AI |
| Deployment | Vercel |
| PDF Export | jsPDF / React-PDF |

---

## Environment Variables (.env)

```env
# Database (Vercel Postgres)
POSTGRES_URL="your-vercel-postgres-url"
POSTGRES_PRISMA_URL="your-vercel-postgres-prisma-url"
POSTGRES_URL_NON_POOLING="your-vercel-postgres-non-pooling-url"
POSTGRES_USER="your-postgres-user"
POSTGRES_HOST="your-postgres-host"
POSTGRES_PASSWORD="your-postgres-password"
POSTGRES_DATABASE="your-postgres-database"

# Google Gemini
GEMINI_API_KEY="your-gemini-api-key"

# ElevenLabs
ELEVENLABS_API_KEY="your-elevenlabs-api-key"
ELEVENLABS_AGENT_ID="your-agent-id"

# App Config
NEXT_PUBLIC_APP_NAME="SupplyWise AI"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

---

## Database Migration: SQLite → PostgreSQL

### Step 1: Export SQLite Data

```bash
# Export each table to CSV
sqlite3 -header -csv data/db.sqlite "SELECT * FROM Company;" > exports/company.csv
sqlite3 -header -csv data/db.sqlite "SELECT * FROM Product;" > exports/product.csv
sqlite3 -header -csv data/db.sqlite "SELECT * FROM BOM;" > exports/bom.csv
sqlite3 -header -csv data/db.sqlite "SELECT * FROM BOM_Component;" > exports/bom_component.csv
sqlite3 -header -csv data/db.sqlite "SELECT * FROM Supplier;" > exports/supplier.csv
sqlite3 -header -csv data/db.sqlite "SELECT * FROM Supplier_Product;" > exports/supplier_product.csv
```

### Step 2: PostgreSQL Schema

```sql
-- Companies/Brands
CREATE TABLE company (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

-- Products (finished goods + raw materials)
CREATE TABLE product (
    id SERIAL PRIMARY KEY,
    sku TEXT NOT NULL,
    company_id INTEGER NOT NULL REFERENCES company(id),
    type TEXT NOT NULL CHECK (type IN ('finished-good', 'raw-material'))
);

-- Bill of Materials
CREATE TABLE bom (
    id SERIAL PRIMARY KEY,
    produced_product_id INTEGER NOT NULL UNIQUE REFERENCES product(id)
);

-- BOM Components (which raw materials make up a product)
CREATE TABLE bom_component (
    bom_id INTEGER NOT NULL REFERENCES bom(id),
    consumed_product_id INTEGER NOT NULL REFERENCES product(id),
    PRIMARY KEY (bom_id, consumed_product_id)
);

-- Suppliers
CREATE TABLE supplier (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

-- Supplier-Product mapping
CREATE TABLE supplier_product (
    supplier_id INTEGER NOT NULL REFERENCES supplier(id),
    product_id INTEGER NOT NULL REFERENCES product(id),
    PRIMARY KEY (supplier_id, product_id)
);

-- Normalized component data (AI populated)
CREATE TABLE component_normalized (
    id SERIAL PRIMARY KEY,
    raw_product_id INTEGER NOT NULL REFERENCES product(id),
    normalized_name TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT
);

-- Substitution candidates (AI populated)
CREATE TABLE substitution_candidate (
    id SERIAL PRIMARY KEY,
    source_product_id INTEGER NOT NULL REFERENCES product(id),
    target_product_id INTEGER NOT NULL REFERENCES product(id),
    confidence REAL NOT NULL,
    reasoning_summary TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External evidence (AI populated)
CREATE TABLE external_evidence (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES product(id),
    supplier_id INTEGER REFERENCES supplier(id),
    source_type TEXT NOT NULL,
    source_url TEXT,
    content TEXT NOT NULL,
    relevance_score REAL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance verdicts (AI populated)
CREATE TABLE compliance_verdict (
    id SERIAL PRIMARY KEY,
    substitution_candidate_id INTEGER NOT NULL REFERENCES substitution_candidate(id),
    verdict TEXT NOT NULL,
    confidence REAL NOT NULL,
    reasoning_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sourcing recommendations (AI populated)
CREATE TABLE sourcing_recommendation (
    id SERIAL PRIMARY KEY,
    bom_id INTEGER NOT NULL REFERENCES bom(id),
    recommendation_json JSONB NOT NULL,
    score REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat history (NEW - for conversation persistence)
CREATE TABLE chat_session (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_message (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences for analysis parameters
CREATE TABLE user_analysis_preference (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id INTEGER REFERENCES product(id),
    price_weight INTEGER DEFAULT 5 CHECK (price_weight BETWEEN 1 AND 10),
    quality_weight INTEGER DEFAULT 5 CHECK (quality_weight BETWEEN 1 AND 10),
    compliance_weight INTEGER DEFAULT 5 CHECK (compliance_weight BETWEEN 1 AND 10),
    supplier_consolidation_weight INTEGER DEFAULT 5 CHECK (supplier_consolidation_weight BETWEEN 1 AND 10),
    lead_time_weight INTEGER DEFAULT 5 CHECK (lead_time_weight BETWEEN 1 AND 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_product_type ON product(type);
CREATE INDEX idx_product_company ON product(company_id);
CREATE INDEX idx_bom_component_bom ON bom_component(bom_id);
CREATE INDEX idx_supplier_product_supplier ON supplier_product(supplier_id);
CREATE INDEX idx_component_normalized_name ON component_normalized(normalized_name);
CREATE INDEX idx_chat_session_user ON chat_session(user_id);
CREATE INDEX idx_chat_message_session ON chat_message(session_id);
```

### Step 3: Import Data Script

```javascript
// scripts/migrate-to-postgres.js
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

const sqliteDb = new Database(path.join(__dirname, '../data/db.sqlite'));
const pgPool = new Pool({ connectionString: process.env.POSTGRES_URL });

async function migrate() {
  const tables = [
    { name: 'company', columns: ['id', 'name'] },
    { name: 'product', columns: ['id', 'sku', 'company_id', 'type'] },
    { name: 'bom', columns: ['id', 'produced_product_id'] },
    { name: 'bom_component', columns: ['bom_id', 'consumed_product_id'] },
    { name: 'supplier', columns: ['id', 'name'] },
    { name: 'supplier_product', columns: ['supplier_id', 'product_id'] },
  ];

  for (const table of tables) {
    console.log(`Migrating ${table.name}...`);

    // SQLite uses PascalCase, Postgres uses snake_case
    const sqliteTableName = table.name.split('_').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join('_');

    const rows = sqliteDb.prepare(`SELECT * FROM ${sqliteTableName}`).all();

    if (rows.length === 0) continue;

    const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
    const query = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    for (const row of rows) {
      const values = table.columns.map(col => {
        // Handle column name mapping (SQLite PascalCase → Postgres snake_case)
        const sqliteCol = col.split('_').map((w, i) =>
          i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');
        return row[sqliteCol] ?? row[col];
      });
      await pgPool.query(query, values);
    }

    console.log(`  Migrated ${rows.length} rows`);
  }

  // Reset sequences
  await pgPool.query(`SELECT setval('company_id_seq', (SELECT MAX(id) FROM company))`);
  await pgPool.query(`SELECT setval('product_id_seq', (SELECT MAX(id) FROM product))`);
  await pgPool.query(`SELECT setval('bom_id_seq', (SELECT MAX(id) FROM bom))`);
  await pgPool.query(`SELECT setval('supplier_id_seq', (SELECT MAX(id) FROM supplier))`);

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(console.error);
```

---

## Application Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Lovable)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    HEADER (Black Background)                     │   │
│  │  [Logo] SupplyWise AI          [About Us] [Contact] [Profile]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         MAIN CONTENT                             │   │
│  │                                                                   │   │
│  │   PAGE 1: Dashboard (Product List)                               │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │  #  │  Product Name                        │  Actions   │   │   │
│  │   ├─────────────────────────────────────────────────────────┤   │   │
│  │   │  1  │  NOW Foods Vitamin D3               │  [View]    │   │   │
│  │   │  2  │  Optimum Nutrition Whey Protein     │  [View]    │   │   │
│  │   │  3  │  Nordic Naturals Omega-3            │  [View]    │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                   │   │
│  │   PAGE 2: Product Modal (Raw Materials List)                     │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │  Product: NOW Foods Vitamin D3                     [X]  │   │   │
│  │   ├─────────────────────────────────────────────────────────┤   │   │
│  │   │  #  │  Raw Material              │  Action              │   │   │
│  │   │  1  │  Vitamin D3 Cholecalciferol│  [Analysis]          │   │   │
│  │   │  2  │  Safflower Oil             │  [Analysis]          │   │   │
│  │   │  3  │  Bovine Gelatin Capsule    │  [Analysis]          │   │   │
│  │   │  4  │  Glycerin                  │  [Analysis]          │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                   │   │
│  │   PAGE 3: Analysis Report Page                                   │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │  Raw Material: Vitamin D3 Cholecalciferol               │   │   │
│  │   ├─────────────────────────────────────────────────────────┤   │   │
│  │   │  ┌──────────────┐  ┌──────────────────────────────┐    │   │   │
│  │   │  │   CHARTS     │  │  SOURCING RECOMMENDATION     │    │   │   │
│  │   │  │  - Suppliers │  │  Best Option: Prinova USA    │    │   │   │
│  │   │  │  - Price     │  │  Confidence: 92%             │    │   │   │
│  │   │  │  - Quality   │  │  Reasoning: ...              │    │   │   │
│  │   │  └──────────────┘  └──────────────────────────────┘    │   │   │
│  │   │                                                         │   │   │
│  │   │  ┌──────────────────────────────────────────────────┐  │   │   │
│  │   │  │  PARAMETER SLIDERS (Gamified)                    │  │   │   │
│  │   │  │  Price Priority:      ████████░░ 8/10            │  │   │   │
│  │   │  │  Quality Priority:    ██████░░░░ 6/10            │  │   │   │
│  │   │  │  Compliance Priority: ██████████ 10/10           │  │   │   │
│  │   │  │  Supplier Consolidation: ████░░░░░░ 4/10         │  │   │   │
│  │   │  │  Lead Time Priority:  ██████░░░░ 6/10            │  │   │   │
│  │   │  │                                                  │  │   │   │
│  │   │  │  [Update Analysis]                               │  │   │   │
│  │   │  └──────────────────────────────────────────────────┘  │   │   │
│  │   │                                                         │   │   │
│  │   │  [Download PDF]  [Save to History]                     │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    FOOTER (Black Background)                     │   │
│  │  © {currentYear} SupplyWise AI. All rights reserved.            │   │
│  │  [About Us] [Privacy Policy] [Terms of Service] [Contact]       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────┐                                                              │
│  │ 💬   │  ← Chat Icon (Fixed, Bottom Right, Always Visible)          │
│  └──────┘    Opens Chat Panel on Click                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         CHAT PANEL (Slide from Right)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SupplyWise Assistant                              [X] Close    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  Chat History (Sidebar)                                 │   │   │
│  │  │  - Session: Apr 8 - Vitamin D3 Analysis                │   │   │
│  │  │  - Session: Apr 7 - Whey Protein Comparison            │   │   │
│  │  │  - Session: Apr 6 - Supplier Review                    │   │   │
│  │  │  [+ New Chat]                                           │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  Conversation Area                                      │   │   │
│  │  │                                                         │   │   │
│  │  │  🤖 Hi! I'm your SupplyWise assistant. I can help you  │   │   │
│  │  │     analyze raw materials, find substitutes, and make   │   │   │
│  │  │     sourcing recommendations. How can I help?           │   │   │
│  │  │                                                         │   │   │
│  │  │  👤 Show me the analysis for Vitamin D3 in the NOW     │   │   │
│  │  │     Foods product                                       │   │   │
│  │  │                                                         │   │   │
│  │  │  🤖 Here's the analysis for Vitamin D3...              │   │   │
│  │  │                                                         │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  [🎤 Voice] [Type a message...              ] [Send ➤] │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## User Flow

### Flow 1: Dashboard Navigation

```
1. User logs in
   ↓
2. Dashboard loads with product list
   ├── Serial # | Product Name | Actions
   ↓
3. User clicks [View] on a product
   ↓
4. Modal opens showing raw materials
   ├── Serial # | Raw Material Name | [Analysis]
   ↓
5. User clicks [Analysis] on a raw material
   ↓
6. Analysis page opens with:
   ├── Sourcing recommendations
   ├── Charts (supplier comparison, price trends)
   ├── Parameter sliders (gamified)
   └── Actions: [Download PDF] [Save to History]
   ↓
7. User adjusts sliders → clicks [Update Analysis]
   ↓
8. Page updates with new recommendations based on weights
```

### Flow 2: Chat/Voice Interaction

```
1. User clicks chat icon (💬) on any page
   ↓
2. Chat panel slides in from right
   ├── Shows previous chat sessions
   └── Active conversation area
   ↓
3. User types or clicks 🎤 for voice
   ↓
4. If voice: ElevenLabs activates
   ├── User speaks query
   ├── Speech-to-text converts
   └── AI processes and responds via voice
   ↓
5. AI responds with analysis/recommendations
   ├── Can navigate user to specific product
   ├── Can show analysis inline in chat
   └── Can trigger PDF download
   ↓
6. Conversation saved to chat_session/chat_message tables
```

---

## API Endpoints

### Products & BOM

```
GET  /api/products                    # List all finished goods
GET  /api/products/:id                # Get product details
GET  /api/products/:id/bom            # Get BOM with raw materials
GET  /api/products/:id/bom/:componentId/analysis  # Get analysis for component
POST /api/products/:id/bom/:componentId/analysis  # Generate new analysis with params
```

### Analysis & Recommendations

```
POST /api/analyze/component           # Analyze a raw material
     Body: { productId, componentId, weights: { price, quality, compliance, ... } }

GET  /api/recommendations/:bomId      # Get cached recommendations
POST /api/recommendations/generate    # Generate new recommendations
```

### Chat & History

```
GET  /api/chat/sessions               # List user's chat sessions
POST /api/chat/sessions               # Create new session
GET  /api/chat/sessions/:id/messages  # Get messages in session
POST /api/chat/sessions/:id/messages  # Add message to session
DELETE /api/chat/sessions/:id         # Delete session
```

### Voice (ElevenLabs)

```
POST /api/voice/conversation          # Start voice conversation
     Body: { sessionId }
     Returns: { agentId, conversationId }

GET  /api/voice/signed-url            # Get signed URL for ElevenLabs widget
```

### Export

```
POST /api/export/pdf                  # Generate PDF report
     Body: { componentId, analysisData }
     Returns: PDF file
```

---

## Gemini Integration

### Analysis Prompt Template

```javascript
const analysisPrompt = `
You are SupplyWise AI, an expert supply chain analyst for CPG companies.

Analyze the following raw material and provide sourcing recommendations:

**Raw Material:** ${componentName}
**Product Context:** ${productName} by ${companyName}
**Current Suppliers:** ${suppliers.join(', ')}

**User Preferences (1-10 scale):**
- Price Priority: ${weights.price}/10
- Quality Priority: ${weights.quality}/10
- Compliance Priority: ${weights.compliance}/10
- Supplier Consolidation: ${weights.supplierConsolidation}/10
- Lead Time Priority: ${weights.leadTime}/10

**Available Substitutes:**
${substitutes.map(s => `- ${s.name} (Confidence: ${s.confidence})`).join('\n')}

**Available Suppliers:**
${supplierOptions.map(s => `- ${s.name}: ${s.products} products supplied`).join('\n')}

Provide:
1. **Recommended Supplier** with reasoning
2. **Alternative Options** ranked
3. **Substitution Recommendation** if applicable
4. **Risk Assessment** (compliance, quality, supply chain)
5. **Cost Analysis** (relative, not absolute prices)

Format as JSON:
{
  "recommendedSupplier": { "name": "", "score": 0.0, "reasoning": "" },
  "alternatives": [{ "name": "", "score": 0.0, "reasoning": "" }],
  "substitutionRecommendation": { "recommend": true/false, "target": "", "reasoning": "" },
  "riskAssessment": { "compliance": "", "quality": "", "supplyChain": "" },
  "costAnalysis": { "summary": "", "potentialSavings": "" },
  "overallConfidence": 0.0
}
`;
```

### Chat Prompt Template

```javascript
const chatSystemPrompt = `
You are SupplyWise AI assistant, helping supply chain managers make better sourcing decisions.

You have access to:
- Product catalog with ${productCount} finished goods
- ${rawMaterialCount} raw materials across products
- ${supplierCount} suppliers
- Analysis capabilities for substitution and sourcing

You can:
1. Show product details and their raw materials
2. Analyze specific raw materials for sourcing recommendations
3. Compare suppliers
4. Find substitutes for ingredients
5. Generate and explain reports

When user asks about a specific product or material, provide detailed, actionable insights.
Always cite confidence levels and explain your reasoning.

Current context:
${contextFromDatabase}
`;
```

---

## ElevenLabs Integration

### Setup Conversational AI Agent

```javascript
// lib/elevenlabs.js
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Create or get agent for voice conversations
export async function getConversationAgent() {
  const agent = await client.conversationalAI.getAgent(
    process.env.ELEVENLABS_AGENT_ID
  );
  return agent;
}

// Get signed URL for frontend widget
export async function getSignedUrl() {
  const response = await client.conversationalAI.getSignedUrl({
    agent_id: process.env.ELEVENLABS_AGENT_ID,
  });
  return response.signed_url;
}
```

### Frontend Voice Component

```jsx
// components/VoiceChat.jsx
import { useConversation } from '@11labs/react';

export function VoiceChat({ onMessage }) {
  const conversation = useConversation({
    onMessage: (message) => {
      onMessage(message);
    },
  });

  const startConversation = async () => {
    const response = await fetch('/api/voice/signed-url');
    const { signedUrl } = await response.json();

    await conversation.startSession({
      signedUrl,
    });
  };

  return (
    <div className="voice-controls">
      <button
        onClick={startConversation}
        disabled={conversation.status === 'connected'}
      >
        🎤 {conversation.status === 'connected' ? 'Listening...' : 'Start Voice'}
      </button>

      {conversation.status === 'connected' && (
        <button onClick={() => conversation.endSession()}>
          Stop
        </button>
      )}
    </div>
  );
}
```

### Agent Configuration (ElevenLabs Dashboard)

```json
{
  "name": "SupplyWise Assistant",
  "first_message": "Hi! I'm your SupplyWise assistant. I can help you analyze raw materials, find substitutes, and make sourcing recommendations. What would you like to know?",
  "system_prompt": "You are SupplyWise AI, a supply chain assistant...",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "language": "en",
  "tools": [
    {
      "name": "get_product_analysis",
      "description": "Get analysis for a specific product's raw material"
    },
    {
      "name": "find_substitutes",
      "description": "Find substitute materials"
    },
    {
      "name": "compare_suppliers",
      "description": "Compare suppliers for a material"
    }
  ]
}
```

---

## Key Features Summary

### 1. Dashboard
- Serial # and Product Name columns
- Click to view raw materials modal
- Clean, minimalist design

### 2. Raw Materials Modal
- Lists all components in product BOM
- Serial # | Name | Analysis button
- No chat icon in modal

### 3. Analysis Page
- Full sourcing recommendation with AI reasoning
- Charts: Supplier comparison, price/quality matrix
- **Gamified Sliders** (1-10):
  - Price Priority
  - Quality Priority
  - Compliance Priority
  - Supplier Consolidation
  - Lead Time Priority
- [Update Analysis] recalculates based on weights
- [Download PDF] exports report
- [Save to History] stores in chat sessions

### 4. Chat Panel
- Fixed chat icon (bottom right) on all pages except modal
- Slides in from right
- Shows chat history (previous sessions)
- Text input + Voice button
- Full ElevenLabs two-way conversation
- Can perform all analysis actions via conversation

### 5. Branding
- Logo placeholder (clickable → home)
- Header: Black background
- Footer: Black background
- Copyright: © {currentYear} SupplyWise AI (auto-updates)
- Links: About Us, Privacy Policy, Terms, Contact

---

## File Structure

```
supplywisе-ai/
├── app/
│   ├── layout.tsx              # Root layout with header/footer
│   ├── page.tsx                # Dashboard (product list)
│   ├── products/
│   │   └── [id]/
│   │       └── analysis/
│   │           └── [componentId]/
│   │               └── page.tsx  # Analysis page
│   └── api/
│       ├── products/
│       ├── analyze/
│       ├── chat/
│       ├── voice/
│       └── export/
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── ProductTable.tsx
│   ├── RawMaterialsModal.tsx
│   ├── AnalysisReport.tsx
│   ├── ParameterSliders.tsx
│   ├── Charts.tsx
│   ├── ChatPanel.tsx
│   ├── ChatIcon.tsx
│   └── VoiceChat.tsx
├── lib/
│   ├── db.ts                   # Postgres connection
│   ├── gemini.ts               # Gemini API client
│   ├── elevenlabs.ts           # ElevenLabs client
│   └── pdf.ts                  # PDF generation
├── scripts/
│   └── migrate-to-postgres.js  # SQLite → Postgres migration
├── public/
│   └── logo-placeholder.svg
├── .env.local
└── package.json
```

---

## Next Steps

1. **Set up Vercel Postgres** - Create database in Vercel dashboard
2. **Run migration script** - Transfer SQLite data to Postgres
3. **Configure ElevenLabs Agent** - Create conversational agent in ElevenLabs dashboard
4. **Build in Lovable** - Use the Lovable prompt document to generate UI
5. **Connect APIs** - Implement Gemini and ElevenLabs integrations
6. **Test voice flow** - Verify two-way conversation works
7. **Deploy to Vercel** - Connect GitHub repo and deploy

---

## Data Integrity Verification

After migration, run these queries to verify data:

```sql
-- Verify counts match SQLite
SELECT 'company' as table_name, COUNT(*) as count FROM company
UNION ALL SELECT 'product', COUNT(*) FROM product
UNION ALL SELECT 'bom', COUNT(*) FROM bom
UNION ALL SELECT 'bom_component', COUNT(*) FROM bom_component
UNION ALL SELECT 'supplier', COUNT(*) FROM supplier
UNION ALL SELECT 'supplier_product', COUNT(*) FROM supplier_product;

-- Expected:
-- company: 61
-- product: 1025
-- bom: 149
-- bom_component: 1528
-- supplier: 40
-- supplier_product: 1633
```
