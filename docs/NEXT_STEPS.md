# Next Steps - Implementation Roadmap

This document outlines the remaining work to complete the SupplyWise AI hackathon deliverables.

---

## Current Status

### Completed
- [x] Dashboard with product listing from PostgreSQL
- [x] Raw materials modal showing BOM components
- [x] Analysis page with charts and sliders
- [x] ElevenLabs TTS + STT integration
- [x] Voice chat with auto-stop on silence
- [x] Gemini AI chat integration
- [x] Local development server setup
- [x] Database migration (SQLite → PostgreSQL)

### Remaining (Hackathon Core)
- [ ] Component normalization pipeline
- [ ] Substitution detection algorithm
- [ ] External data enrichment
- [ ] Compliance checking logic
- [ ] Enhanced sourcing recommendations

---

## Step 1: Component Normalization (Priority: HIGH)

**Goal**: Parse 876 raw material SKUs and create standardized entries.

### Implementation

1. **Create API endpoint**: `/api/normalize/run`

```javascript
// frontend/api/normalize/run.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import pg from "pg";

const NORMALIZATION_PROMPT = `
Analyze this raw material SKU and extract:
1. Normalized name (proper chemical/ingredient name)
2. Category (Vitamin, Mineral, Protein, Excipient, Oil, Capsule, Flavor, Extract, etc.)
3. SubCategory (optional, more specific classification)

SKU: {sku}

Respond in JSON:
{
  "normalizedName": "...",
  "category": "...",
  "subCategory": "..." or null
}
`;

export default async function handler(req, res) {
  // Batch process raw materials
  // Insert into component_normalized table
}
```

2. **Create batch processing script**: `/backend/scripts/normalize-components.mjs`

```javascript
// Process in batches of 50 to avoid rate limits
// Use Gemini to extract normalized names
// Categories: Vitamins, Minerals, Proteins, Amino Acids, Excipients,
//             Flavors, Oils, Capsules, Preservatives, Extracts
```

3. **Database query**:
```sql
INSERT INTO component_normalized (raw_product_id, normalized_name, category, sub_category)
VALUES ($1, $2, $3, $4)
ON CONFLICT (raw_product_id) DO UPDATE SET
  normalized_name = $2, category = $3, sub_category = $4;
```

### Expected Output
| raw_product_id | normalized_name | category | sub_category |
|----------------|-----------------|----------|--------------|
| 150 | Vitamin D3 (Cholecalciferol) | Vitamins | Fat-Soluble |
| 151 | Whey Protein Isolate | Proteins | Dairy-Based |
| 152 | Magnesium Stearate | Excipients | Lubricants |

---

## Step 2: Substitution Detection (Priority: HIGH)

**Goal**: Find interchangeable components with confidence scores.

### Implementation

1. **Same-name substitutes** (Confidence: 0.95+)
   - Group by normalized_name
   - Different suppliers = automatic substitutes

2. **Form variants** (Confidence: 0.80-0.90)
   - Whey Isolate ↔ Whey Concentrate
   - Vitamin D2 ↔ Vitamin D3
   - Gelatin (bovine) ↔ Gelatin (fish)

3. **Functional equivalents** (Confidence: 0.60-0.80)
   - Soy Lecithin ↔ Sunflower Lecithin
   - Stevia ↔ Monk Fruit

### API Endpoint: `/api/substitutes/generate`

```javascript
export default async function handler(req, res) {
  // 1. Get all normalized components
  // 2. Group by category
  // 3. Use embeddings for semantic similarity
  // 4. Apply business rules (allergen compatibility, etc.)
  // 5. Insert into substitution_candidate table
}
```

### Confidence Scoring Formula
```javascript
const calculateConfidence = (source, target) => {
  let score = 0;

  // Same normalized name = high base score
  if (source.normalizedName === target.normalizedName) score += 0.5;

  // Same category = medium boost
  if (source.category === target.category) score += 0.2;

  // Same sub-category = additional boost
  if (source.subCategory === target.subCategory) score += 0.15;

  // Allergen compatibility
  if (checkAllergenCompatibility(source, target)) score += 0.1;

  // Semantic similarity (embeddings)
  score += embeddingSimilarity * 0.05;

  return Math.min(score, 0.99);
};
```

---

## Step 3: External Data Enrichment (Priority: MEDIUM)

**Goal**: Gather compliance/regulatory information from external sources.

### Data Sources

| Source | Type | Information |
|--------|------|-------------|
| FDA GRAS Database | Regulatory | Safety status |
| USP Standards | Quality | Purity specifications |
| Supplier Websites | Specs | COA, certifications |
| PubMed/Scholar | Research | Bioequivalence studies |

### Implementation

1. **Web search integration**: Use Gemini's web-grounded responses

```javascript
const enrichmentPrompt = `
Search for regulatory and compliance information about:
Ingredient: ${normalizedName}
Supplier: ${supplierName}

Find:
1. FDA GRAS status
2. Allergen classifications
3. Kosher/Halal certifications available
4. Organic certification availability
5. Quality grade (USP, FCC, etc.)

Cite your sources.
`;
```

2. **Store in external_evidence table**:
```sql
INSERT INTO external_evidence
  (product_id, supplier_id, source_type, source_url, content, relevance_score)
VALUES ($1, $2, $3, $4, $5, $6);
```

---

## Step 4: Compliance Checking (Priority: MEDIUM)

**Goal**: Verify substitutions meet quality/regulatory standards.

### Compliance Dimensions

| Dimension | Check | Pass Criteria |
|-----------|-------|---------------|
| Regulatory | FDA approval | Both GRAS or approved |
| Allergen | Cross-contamination | No new allergens introduced |
| Kosher/Halal | Certification | Equivalent or better |
| Organic | Certification | Maintains organic status |
| Vegan | Animal-derived | No animal ingredients if required |
| Functional | Active properties | Equivalent bioavailability |

### API Endpoint: `/api/compliance/check`

```javascript
export default async function handler(req, res) {
  const { substitutionCandidateId } = req.body;

  // 1. Get source and target products
  // 2. Get external evidence for both
  // 3. Run compliance checks
  // 4. Generate verdict with reasoning

  const verdict = {
    status: "APPROVED" | "CONDITIONAL" | "REJECTED",
    confidence: 0.87,
    checks: {
      regulatory: { status: "pass", note: "Both FDA GRAS" },
      allergen: { status: "pass", note: "Removes soy allergen" },
      functional: { status: "pass", note: "Equivalent properties" }
    },
    risks: ["Minor taste difference possible"]
  };

  // Insert into compliance_verdict table
}
```

---

## Step 5: Enhanced Sourcing Recommendations (Priority: HIGH)

**Goal**: Generate actionable recommendations with clear reasoning.

### Current Analysis Flow
1. User selects component from BOM
2. Adjusts priority sliders
3. System calculates weighted scores
4. Returns ranked suppliers

### Enhanced Flow
1. User selects component
2. System finds all substitution candidates
3. For each candidate, finds all suppliers
4. Calculates scores using:
   - User weights (price, quality, compliance, consolidation, lead time)
   - Compliance verdicts
   - External evidence
5. Returns ranked recommendations with:
   - Confidence score
   - Cost impact estimate
   - Compliance summary
   - Risk factors
   - Evidence citations

### API Enhancement: `/api/analysis/component`

```javascript
const generateRecommendation = async (componentId, weights) => {
  // 1. Get substitution candidates
  const substitutes = await getSubstitutes(componentId);

  // 2. For each substitute, get suppliers
  const options = [];
  for (const sub of substitutes) {
    const suppliers = await getSuppliers(sub.targetProductId);
    const compliance = await getComplianceVerdict(sub.id);

    for (const supplier of suppliers) {
      const evidence = await getEvidence(sub.targetProductId, supplier.id);

      options.push({
        substitute: sub,
        supplier,
        compliance,
        evidence,
        score: calculateScore(sub, supplier, compliance, weights)
      });
    }
  }

  // 3. Rank and return top recommendations
  return options.sort((a, b) => b.score - a.score).slice(0, 5);
};
```

---

## Step 6: PDF Export (Priority: LOW)

**Goal**: Generate downloadable PDF reports.

### Implementation

1. Install jsPDF: `npm install jspdf jspdf-autotable`

2. Create PDF generator:
```javascript
// frontend/src/lib/pdfGenerator.ts
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const generateAnalysisReport = (data) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.text('Sourcing Analysis Report', 20, 20);

  // Component info
  doc.setFontSize(12);
  doc.text(`Component: ${data.componentName}`, 20, 35);
  doc.text(`Product: ${data.productName}`, 20, 45);

  // Recommendation table
  doc.autoTable({
    head: [['Rank', 'Supplier', 'Score', 'Reasoning']],
    body: data.recommendations.map((r, i) => [
      i + 1,
      r.supplierName,
      `${(r.score * 100).toFixed(0)}%`,
      r.reasoning
    ]),
    startY: 55
  });

  // Compliance summary
  // Charts (as images)
  // Evidence citations

  return doc;
};
```

---

## Step 7: Chat Persistence (Priority: LOW)

**Goal**: Save chat history to database.

### Database Tables
Already defined in schema:
- `chat_session` - User sessions
- `chat_message` - Individual messages

### Implementation

1. **Create session on first message**:
```javascript
const createSession = async (userId) => {
  const result = await pool.query(
    'INSERT INTO chat_session (user_id, title) VALUES ($1, $2) RETURNING id',
    [userId, 'New Chat']
  );
  return result.rows[0].id;
};
```

2. **Save messages**:
```javascript
const saveMessage = async (sessionId, role, content) => {
  await pool.query(
    'INSERT INTO chat_message (session_id, role, content) VALUES ($1, $2, $3)',
    [sessionId, role, content]
  );
};
```

3. **Update ChatPanel to persist**:
- On send: save user message, then assistant response
- On load: fetch previous sessions from API
- On session switch: load messages from API

---

## Testing Checklist

### Unit Tests
- [ ] Component normalization accuracy
- [ ] Substitution confidence scoring
- [ ] Compliance verdict logic
- [ ] Score calculation with weights

### Integration Tests
- [ ] Full analysis flow
- [ ] Voice recording → transcription → response → TTS
- [ ] Database CRUD operations

### Manual Testing
- [ ] Dashboard pagination
- [ ] BOM modal display
- [ ] Analysis page charts
- [ ] Slider interactions
- [ ] Voice conversation flow

---

## Demo Scenarios

### Scenario 1: Soy Allergen Removal
1. Select product with soy lecithin
2. Show substitution to sunflower lecithin
3. Highlight allergen compliance improvement
4. Show cost impact

### Scenario 2: Cost Optimization
1. Select expensive vitamin component
2. Adjust price priority to 10
3. Show cheaper supplier alternatives
4. Explain quality tradeoffs

### Scenario 3: Voice Query
1. Click mic button
2. Ask "Find a substitute for bovine gelatin"
3. System transcribes, analyzes, responds with voice
4. Shows fish gelatin or plant-based alternatives

---

## Timeline

| Phase | Tasks | Time |
|-------|-------|------|
| 1 | Component normalization | 2-3 hours |
| 2 | Substitution detection | 3-4 hours |
| 3 | External enrichment | 2-3 hours |
| 4 | Compliance checking | 2-3 hours |
| 5 | Enhanced recommendations | 2-3 hours |
| 6 | PDF export | 1-2 hours |
| 7 | Chat persistence | 1-2 hours |
| 8 | Testing & polish | 2-3 hours |

**Total: ~16-23 hours**

---

## Quick Wins (Do First)

1. **Run normalization batch** - Populates component_normalized
2. **Same-name substitutes** - Easy wins with high confidence
3. **Enhance analysis API** - Show substitutes in UI
4. **Demo-ready scenario** - Pick one product, perfect the flow
