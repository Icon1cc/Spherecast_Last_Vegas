# Spherecast Hackathon - Implementation Guide

## Challenge Summary

**Goal**: Build "Agnes" - an AI-powered decision-support system that helps CPG supply chain managers make better raw material sourcing decisions.

**The Problem**: When a raw material becomes unavailable, expensive, or non-compliant, supply chain managers need to quickly find substitutes that:
- Are functionally equivalent
- Meet quality/compliance standards
- Optimize cost and supplier relationships

---

## What You Need to Build

### Core System Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agnes - AI Supply Chain Manager              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. COMPONENT NORMALIZATION                                     │
│     └─► Standardize raw material names and categorize them      │
│                                                                 │
│  2. SUBSTITUTION DETECTION                                      │
│     └─► Find interchangeable components with familiarity scores │
│                                                                 │
│  3. EXTERNAL DATA ENRICHMENT                                    │
│     └─► Gather specs, compliance info, pricing from web         │
│                                                                 │
│  4. COMPLIANCE CHECKING                                         │
│     └─► Verify substitutes meet quality/regulatory standards    │
│                                                                 │
│  5. SOURCING RECOMMENDATION                                     │
│     └─► Recommend best option with clear reasoning              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Tasks

### Task 1: Component Normalization

**Objective**: Parse raw material SKUs and create standardized, searchable entries.

**Input**: `Product` table where `Type = 'raw-material'`

**Output**: Populate `Component_Normalized` table

**Example:**
```
SKU: RM-C28-vitamin-d3-cholecalciferol-8956b79c

Normalized:
├── NormalizedName: "Vitamin D3 (Cholecalciferol)"
├── Category: "Vitamins"
└── SubCategory: "Fat-Soluble Vitamins"
```

**Approach:**
1. Extract ingredient name from SKU (remove prefix, hash)
2. Use LLM or NLP to:
   - Standardize naming (handle synonyms, abbreviations)
   - Assign category (vitamin, mineral, protein, excipient, etc.)
   - Assign subcategory where applicable

**Categories to Consider:**
- Vitamins (fat-soluble, water-soluble)
- Minerals
- Proteins (whey, plant-based, collagen)
- Amino Acids
- Excipients (binders, fillers, coatings)
- Flavors & Sweeteners
- Oils & Fats
- Capsule Materials
- Preservatives
- Botanical Extracts

---

### Task 2: Substitution Detection

**Objective**: Identify which raw materials can substitute for others.

**Output**: Populate `Substitution_Candidate` table

**Substitution Types:**

| Type | Example | Confidence |
|------|---------|------------|
| Exact Match | Vitamin C from Supplier A → Vitamin C from Supplier B | Very High |
| Form Variant | Whey Protein Isolate ↔ Whey Protein Concentrate | High |
| Functional Equivalent | Soy Lecithin ↔ Sunflower Lecithin | Medium-High |
| Alternative Source | Bovine Gelatin ↔ Fish Gelatin | Medium |
| Different Compound | Vitamin D2 ↔ Vitamin D3 | Low-Medium |

**Algorithm Approach:**
1. Group by normalized name → automatic substitution candidates
2. Use semantic similarity (embeddings) to find functional equivalents
3. Apply domain rules:
   - Same category = potential substitute
   - Check allergen implications (soy → sunflower is allergen-friendly)
   - Consider bioavailability differences

**Confidence Scoring Factors:**
- Name similarity
- Category match
- Functional equivalence (from external data)
- Allergen compatibility
- Regulatory equivalence

---

### Task 3: External Data Enrichment

**Objective**: Gather additional information from external sources to inform decisions.

**Output**: Populate `External_Evidence` table

**Data Sources to Consider:**

| Source Type | Information | Example Sources |
|-------------|-------------|-----------------|
| Supplier Websites | Specs, certificates, pricing | Direct scraping |
| Regulatory Databases | Compliance status, approvals | FDA GRAS list, EU Novel Foods |
| Scientific Literature | Bioequivalence studies | PubMed, Google Scholar |
| Industry Standards | Quality specifications | USP, FCC standards |
| Market Data | Pricing trends, availability | Industry reports |

**Evidence Schema:**
```json
{
  "ProductId": 150,
  "SupplierId": 1,
  "SourceType": "regulatory",
  "SourceUrl": "https://www.fda.gov/...",
  "Content": "Calcium citrate is GRAS (Generally Recognized as Safe)...",
  "RelevanceScore": 0.95
}
```

**Implementation Options:**
- Web scraping with LLM extraction
- API integrations where available
- RAG over pre-collected documents
- Real-time web search + summarization

---

### Task 4: Compliance Checking

**Objective**: Verify that a substitution meets all necessary standards.

**Output**: Populate `Compliance_Verdict` table

**Compliance Dimensions:**

| Dimension | Check |
|-----------|-------|
| Regulatory | FDA/EU approval status |
| Allergen | Cross-contamination, labeling requirements |
| Kosher/Halal | Certification requirements |
| Organic | Certification maintenance |
| Vegan | Animal-derived ingredient detection |
| Quality | USP/FCC grade equivalence |
| Functional | Same active properties |

**Verdict Format:**
```json
{
  "SubstitutionCandidateId": 1,
  "Verdict": "APPROVED",
  "Confidence": 0.87,
  "ReasoningJson": {
    "regulatory": {"status": "pass", "note": "Both FDA GRAS"},
    "allergen": {"status": "pass", "note": "No allergen change"},
    "functional": {"status": "pass", "note": "Equivalent bioavailability"},
    "risks": ["Minor taste difference possible"]
  }
}
```

---

### Task 5: Sourcing Recommendation

**Objective**: Generate actionable recommendations with clear reasoning.

**Output**: Populate `Sourcing_Recommendation` table

**Recommendation Factors:**

| Factor | Weight | Description |
|--------|--------|-------------|
| Cost | High | Price per unit, volume discounts |
| Supplier Consolidation | Medium | Fewer suppliers = simpler logistics |
| Compliance Risk | High | Regulatory/quality certainty |
| Lead Time | Medium | Availability and delivery speed |
| Relationship | Low | Existing supplier preference |

**Recommendation JSON Structure:**
```json
{
  "BOMId": 1,
  "original_component": "RM-C28-soy-lecithin-xxx",
  "recommendation": {
    "action": "SUBSTITUTE",
    "target_component": "RM-C28-sunflower-lecithin-yyy",
    "suppliers": [
      {"name": "Prinova USA", "score": 0.92, "reason": "Best price, existing relationship"},
      {"name": "Cargill", "score": 0.85, "reason": "Backup option, higher MOQ"}
    ],
    "reasoning": {
      "cost_impact": "-5% per unit",
      "compliance": "Removes soy allergen declaration requirement",
      "quality": "Equivalent emulsification properties",
      "risks": ["Slight color variation possible"]
    },
    "confidence": 0.89,
    "evidence_ids": [12, 15, 23]
  }
}
```

---

## Architecture Options

### Option A: Agentic Workflow (Recommended)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │  Orchestrator│     │   Agents     │
│   Query      │────►│   (LLM)      │────►│              │
└──────────────┘     └──────────────┘     │ - Normalizer │
                            │             │ - Searcher   │
                            │             │ - Compliance │
                            ▼             │ - Recommender│
                     ┌──────────────┐     └──────────────┘
                     │   SQLite DB  │
                     │   + Vector   │
                     │   Store      │
                     └──────────────┘
```

**Tools to Consider:**
- LangChain / LangGraph for agent orchestration
- Claude/GPT-4 for reasoning
- Embeddings (OpenAI, Cohere) for semantic search
- SQLite for structured data
- ChromaDB/Pinecone for vector search

### Option B: Pipeline Architecture

```
Input → Normalize → Find Substitutes → Enrich → Check Compliance → Recommend → Output
```

Simpler, more predictable, easier to debug.

### Option C: RAG + Chat Interface

Build a conversational interface where users can ask:
- "What can I substitute for soy lecithin?"
- "Is sunflower lecithin compliant for organic products?"
- "Show me the cheapest suppliers for vitamin D3"

---

## Suggested Tech Stack

| Component | Options |
|-----------|---------|
| LLM | Claude 3.5 Sonnet, GPT-4, Llama 3 |
| Embeddings | text-embedding-3-small, Cohere embed |
| Vector DB | ChromaDB (simple), Pinecone (scalable) |
| Backend | Python (FastAPI), Node.js |
| Frontend | Streamlit (fast), React (polished) |
| Database | SQLite (provided), can extend |
| Orchestration | LangChain, CrewAI, AutoGen |

---

## Evaluation Criteria (From Challenge)

| Criterion | What Judges Look For |
|-----------|---------------------|
| **Practical Usefulness** | Does it solve real supply chain problems? |
| **Strong Reasoning** | Clear evidence trails, not black-box |
| **Trustworthiness** | Low hallucination, cites sources |
| **External Data** | Creative use of web/API data |
| **Substitution Logic** | Sound methodology for finding replacements |
| **Compliance Logic** | Thorough regulatory checking |
| **Recommendations** | Defensible, actionable suggestions |
| **Scalability** | How could this grow? |
| ~~UI Polish~~ | **NOT a priority** |

---

## Quick Start Implementation

### Phase 1: Data Foundation (2-3 hours)

1. Parse all 876 raw material SKUs
2. Normalize names using LLM
3. Categorize into ~10-15 categories
4. Store in `Component_Normalized`

### Phase 2: Substitution Engine (3-4 hours)

1. Create embeddings for normalized names
2. Find semantic neighbors (cosine similarity > 0.8)
3. Apply business rules (allergen, form variants)
4. Store candidates with confidence scores

### Phase 3: External Enrichment (2-3 hours)

1. Build web search tool for ingredients
2. Extract key specs (regulatory status, allergens)
3. Store as evidence with source URLs

### Phase 4: Compliance & Recommendation (3-4 hours)

1. Build compliance checker (rule-based + LLM)
2. Create scoring function for recommendations
3. Generate explainable output

### Phase 5: Demo Interface (1-2 hours)

1. Simple Streamlit app
2. Select a product/BOM
3. Show substitution options with reasoning

---

## Sample Queries to Handle

1. **"Find substitutes for soy lecithin that are allergen-free"**
   - Search normalized components
   - Filter by allergen status
   - Return ranked alternatives

2. **"What suppliers can provide vitamin D3?"**
   - Query Supplier_Product
   - Enrich with external pricing/quality data
   - Rank by cost and reliability

3. **"Optimize the BOM for product X to reduce costs"**
   - Analyze all components
   - Find cheaper alternatives per component
   - Check compliance
   - Generate recommendation

4. **"Is fish gelatin a valid substitute for bovine gelatin?"**
   - Check functional equivalence
   - Verify regulatory status
   - Assess allergen implications
   - Return verdict with evidence

---

## Deliverables Checklist

- [ ] Working prototype (demo-able)
- [ ] Presentation slides covering:
  - [ ] Problem statement
  - [ ] Data approach
  - [ ] Substitution logic
  - [ ] Compliance checking
  - [ ] Architecture diagram
  - [ ] Live demo
- [ ] Explanation of uncertainty handling
- [ ] Evidence trail examples

---

## Tips for Success

1. **Start with a narrow scope** - Pick 1-2 ingredient categories (e.g., just proteins) and nail it

2. **Evidence is everything** - Every recommendation should link to sources

3. **Show your work** - Explainability > accuracy for judges

4. **Handle uncertainty gracefully** - "Low confidence" is better than hallucinating

5. **Think like a supply chain manager** - Cost, risk, and compliance matter most

6. **Demo a real scenario** - Pick a product, show the full workflow

Good luck!
