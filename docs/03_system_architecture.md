# System Architecture

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AGNES RAW MATERIAL ENGINE                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   SQLite    │    │  ChromaDB   │    │  External   │    │    LLM      │     │
│  │  Database   │    │Vector Store │    │   Cache     │    │   (Claude)  │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │                  │             │
│         └──────────────────┴──────────────────┴──────────────────┘             │
│                                    │                                           │
│                          ┌─────────▼─────────┐                                │
│                          │   Agent Pipeline   │                                │
│                          └─────────┬─────────┘                                │
│                                    │                                           │
│    ┌───────────────────────────────┼───────────────────────────────┐          │
│    │                               │                               │          │
│    ▼                               ▼                               ▼          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│ │  Data    │→ │   BOM    │→ │  Subst.  │→ │ External │→ │Compliance│        │
│ │ Loader   │  │ Analyzer │  │ Detector │  │ Enricher │  │ Checker  │        │
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                               │               │
│                     ┌─────────────────────────────────────────┘               │
│                     ▼                                                         │
│              ┌──────────┐  ┌──────────┐                                      │
│              │  Recom.  │→ │  Report  │→ [JSON/Markdown Output]              │
│              │  Engine  │  │Generator │                                      │
│              └──────────┘  └──────────┘                                      │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Layer

### Existing Schema (from data/db.sqlite)

The provided schema is used as-is. No modifications needed for core functionality.

### Extended Schema (New Tables)

```sql
-- Store normalized component names for substitution matching
CREATE TABLE IF NOT EXISTS Component_Normalized (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RawProductId INTEGER NOT NULL,
    NormalizedName TEXT NOT NULL,
    Category TEXT NOT NULL,  -- 'vitamin', 'mineral', 'protein', 'capsule', 'excipient', 'other'
    SubCategory TEXT,        -- e.g., 'vitamin-d', 'gelatin', 'lecithin'
    FOREIGN KEY (RawProductId) REFERENCES Product(Id)
);

CREATE INDEX idx_normalized_name ON Component_Normalized(NormalizedName);
CREATE INDEX idx_normalized_category ON Component_Normalized(Category);

-- Store substitution candidates with confidence
CREATE TABLE IF NOT EXISTS Substitution_Candidate (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceProductId INTEGER NOT NULL,
    TargetProductId INTEGER NOT NULL,
    Confidence REAL NOT NULL,  -- 0.0 to 1.0
    ReasoningSummary TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SourceProductId) REFERENCES Product(Id),
    FOREIGN KEY (TargetProductId) REFERENCES Product(Id)
);

-- Store external evidence
CREATE TABLE IF NOT EXISTS External_Evidence (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER,
    SupplierId INTEGER,
    SourceType TEXT NOT NULL,  -- 'supplier_website', 'fda_gras', 'certification', 'heuristic'
    SourceUrl TEXT,
    Content TEXT NOT NULL,
    RelevanceScore REAL,
    FetchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProductId) REFERENCES Product(Id),
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id)
);

CREATE INDEX idx_evidence_product ON External_Evidence(ProductId);
CREATE INDEX idx_evidence_supplier ON External_Evidence(SupplierId);

-- Store compliance verdicts
CREATE TABLE IF NOT EXISTS Compliance_Verdict (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SubstitutionCandidateId INTEGER NOT NULL,
    Verdict TEXT NOT NULL,  -- 'approved', 'conditional', 'rejected', 'needs_review'
    Confidence REAL NOT NULL,
    ReasoningJson TEXT NOT NULL,  -- Full structured reasoning
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SubstitutionCandidateId) REFERENCES Substitution_Candidate(Id)
);

-- Store final recommendations
CREATE TABLE IF NOT EXISTS Sourcing_Recommendation (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BOMId INTEGER NOT NULL,
    RecommendationJson TEXT NOT NULL,
    Score REAL NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BOMId) REFERENCES BOM(Id)
);
```

### Database Initialization SQL

```sql
-- Run this to extend the existing database
-- File: agents/sql/init_extended.sql

PRAGMA foreign_keys = ON;

-- Create extended tables if not exist
CREATE TABLE IF NOT EXISTS Component_Normalized (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RawProductId INTEGER NOT NULL,
    NormalizedName TEXT NOT NULL,
    Category TEXT NOT NULL,
    SubCategory TEXT,
    FOREIGN KEY (RawProductId) REFERENCES Product(Id)
);

CREATE TABLE IF NOT EXISTS Substitution_Candidate (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceProductId INTEGER NOT NULL,
    TargetProductId INTEGER NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningSummary TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SourceProductId) REFERENCES Product(Id),
    FOREIGN KEY (TargetProductId) REFERENCES Product(Id)
);

CREATE TABLE IF NOT EXISTS External_Evidence (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER,
    SupplierId INTEGER,
    SourceType TEXT NOT NULL,
    SourceUrl TEXT,
    Content TEXT NOT NULL,
    RelevanceScore REAL,
    FetchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProductId) REFERENCES Product(Id),
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id)
);

CREATE TABLE IF NOT EXISTS Compliance_Verdict (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SubstitutionCandidateId INTEGER NOT NULL,
    Verdict TEXT NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningJson TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SubstitutionCandidateId) REFERENCES Substitution_Candidate(Id)
);

CREATE TABLE IF NOT EXISTS Sourcing_Recommendation (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BOMId INTEGER NOT NULL,
    RecommendationJson TEXT NOT NULL,
    Score REAL NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BOMId) REFERENCES BOM(Id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_normalized_name ON Component_Normalized(NormalizedName);
CREATE INDEX IF NOT EXISTS idx_normalized_category ON Component_Normalized(Category);
CREATE INDEX IF NOT EXISTS idx_evidence_product ON External_Evidence(ProductId);
CREATE INDEX IF NOT EXISTS idx_evidence_supplier ON External_Evidence(SupplierId);
```

---

## LLM Layer

### Model Selection

| Task | Model | Reasoning |
|------|-------|-----------|
| Substitution Detection | Claude 3.5 Sonnet | Needs nuanced reasoning about functional equivalence |
| Compliance Checking | Claude 3.5 Sonnet | Critical task requiring careful judgment |
| External Enrichment | Claude 3 Haiku | Simple extraction, high volume |
| Report Generation | Claude 3.5 Sonnet | Needs clear explanations |

**Primary Model**: `claude-sonnet-4-20250514` via Anthropic API
**Fallback**: OpenAI GPT-4o if Anthropic unavailable

### System Prompts

#### Substitution Detection System Prompt

```
You are an expert supply chain analyst specializing in dietary supplements and nutraceuticals. Your task is to identify functionally interchangeable raw materials.

CONTEXT:
You will be given a list of raw material components from supplement BOMs. Each component has:
- SKU (e.g., RM-C28-vitamin-d3-cholecalciferol-8956b79c)
- Current suppliers
- Category (inferred from name)

TASK:
For each component group, identify which components are functionally interchangeable - meaning they could substitute for each other in a BOM without changing the product's efficacy or purpose.

RULES:
1. Only group components with the SAME functional purpose (e.g., all vitamin D3 sources together)
2. Consider form factors (softgel vs tablet vs powder may not be interchangeable)
3. Consider allergens (soy lecithin is NOT interchangeable with sunflower lecithin for allergen-free products)
4. Consider dietary restrictions (bovine gelatin is NOT interchangeable with vegetarian options)
5. If uncertain, mark confidence as LOW and explain why

OUTPUT FORMAT:
Return a JSON object with the exact schema provided. Do not include any explanatory text outside the JSON.
```

#### Compliance Checker System Prompt

```
You are a regulatory compliance expert for dietary supplements in the US market. Your task is to evaluate whether a proposed component substitution maintains product compliance.

CONTEXT:
You will receive:
- Original component details
- Proposed substitute component
- External evidence about both components (may be incomplete)
- The finished product context (what this component is used in)

EVALUATION CRITERIA:
1. REGULATORY: Both components must have equivalent regulatory status (GRAS, food-grade, etc.)
2. FUNCTIONAL: The substitute must provide the same functional benefit
3. ALLERGENS: Allergen status must be equal or better (reducing allergens is OK, adding is NOT)
4. DIETARY: Dietary restriction compliance must be maintained (kosher, halal, vegan, etc.)
5. QUALITY: Quality specifications must be equivalent or better

CONFIDENCE SCORING:
- HIGH (0.8-1.0): Clear evidence supports the substitution
- MEDIUM (0.5-0.79): Some evidence, but gaps exist
- LOW (0.2-0.49): Limited evidence, significant uncertainty
- INSUFFICIENT (0.0-0.19): Cannot make determination, needs human review

CRITICAL RULE:
If evidence is insufficient to make a compliance determination, you MUST return verdict "needs_review" rather than guessing. Supply chain compliance errors can cause product recalls.

OUTPUT FORMAT:
Return a JSON object with the exact schema provided. Include specific evidence citations.
```

### Context Management

**Token Budget**: 100K context for Claude Sonnet

**Context Structure**:
```
[System Prompt: ~500 tokens]
[Component Data: ~200 tokens per component, max 50 components = 10K tokens]
[External Evidence: ~500 tokens per source, max 20 sources = 10K tokens]
[Examples: ~2K tokens]
[Output Schema: ~500 tokens]
[Buffer: ~77K tokens for reasoning and response]
```

**For Large BOMs (>50 components)**:
- Process in batches of 30 components
- Merge results with deduplication

---

## Retrieval Layer

### Embedding Model
- **Model**: `text-embedding-3-small` (OpenAI) or `voyage-large-2` (Voyage AI)
- **Dimension**: 1536
- **Justification**: Good balance of quality and cost for technical/scientific content

### Vector Store
- **Choice**: ChromaDB (local, file-based)
- **Justification**:
  - No server setup needed
  - Persists to disk
  - Good Python integration
  - Sufficient for hackathon scale (<10K documents)

### Embedding Strategy

```python
# What gets embedded
EMBEDDING_SOURCES = {
    "supplier_specs": {
        "chunk_size": 500,
        "overlap": 50,
        "metadata": ["supplier_name", "product_id", "source_url"]
    },
    "regulatory_docs": {
        "chunk_size": 1000,
        "overlap": 100,
        "metadata": ["regulation_id", "ingredient_name", "status"]
    },
    "component_descriptions": {
        "chunk_size": 200,
        "overlap": 20,
        "metadata": ["sku", "category", "normalized_name"]
    }
}
```

### Retrieval Flow

```
User Query: "Can I substitute bovine gelatin with plant-based alternative?"
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    Query Embedding            │
                    │    (text-embedding-3-small)   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    ChromaDB Similarity Search │
                    │    (top_k=10, threshold=0.7)  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    Rerank by Relevance        │
                    │    (LLM-based or cross-encoder)│
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    Format as Context          │
                    │    (with source citations)    │
                    └───────────────────────────────┘
```

---

## Agent Layer

### Agent 1: Data Loader
**Purpose**: Initialize database, validate schema, create indexes
**Input**: Path to SQLite database
**Output**: Database connection, summary statistics
**Tools**: SQLite queries

### Agent 2: BOM Analyzer
**Purpose**: Parse BOMs, cluster components by function
**Input**: Database connection, optional BOM filter
**Output**: JSON with component groups and metadata
**Tools**: SQL queries, regex parsing, LLM for categorization

### Agent 3: Substitution Detector
**Purpose**: Identify interchangeable components within each group
**Input**: Component groups from BOM Analyzer
**Output**: Substitution candidates with confidence scores
**Tools**: LLM (Claude Sonnet), database queries

### Agent 4: External Enricher
**Purpose**: Fetch missing data from external sources
**Input**: Components needing enrichment
**Output**: Evidence records stored in database
**Tools**: Web scraping, API calls, ChromaDB storage

### Agent 5: Compliance Checker
**Purpose**: Evaluate compliance of each substitution
**Input**: Substitution candidates, external evidence
**Output**: Compliance verdicts with reasoning
**Tools**: LLM (Claude Sonnet), RAG retrieval

### Agent 6: Recommendation Engine
**Purpose**: Rank and score final recommendations
**Input**: Compliance-cleared substitutions
**Output**: Scored recommendations per BOM
**Tools**: Scoring function, database queries

### Agent 7: Report Generator
**Purpose**: Create human-readable and machine-readable outputs
**Input**: Final recommendations
**Output**: Markdown report, JSON export
**Tools**: Template rendering

### Agent 8: Pipeline Orchestrator
**Purpose**: Run all agents in sequence with error handling
**Input**: Configuration, BOM selection
**Output**: Final reports
**Tools**: All agents, logging

---

## API Layer (Optional - for future scaling)

If time permits, expose a minimal FastAPI backend:

```python
# endpoints.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Agnes Raw Material API")

class BOMAnalysisRequest(BaseModel):
    bom_id: int
    include_external_enrichment: bool = True
    confidence_threshold: float = 0.5

class RecommendationResponse(BaseModel):
    bom_id: int
    recommendations: list
    evidence_summary: dict
    processing_time_seconds: float

@app.post("/analyze", response_model=RecommendationResponse)
async def analyze_bom(request: BOMAnalysisRequest):
    """Run full analysis pipeline on a BOM"""
    pass

@app.get("/boms")
async def list_boms():
    """List all available BOMs"""
    pass

@app.get("/recommendations/{bom_id}")
async def get_recommendation(bom_id: int):
    """Get cached recommendation for a BOM"""
    pass
```

---

## Prompt Templates

### Template 1: Component Categorization

```python
CATEGORIZATION_PROMPT = """
Categorize the following raw material component based on its SKU name.

Component SKU: {sku}

Return a JSON object:
{{
    "normalized_name": "<human-readable name without codes/hashes>",
    "category": "<one of: vitamin, mineral, protein, amino_acid, fatty_acid, capsule, excipient, sweetener, flavor, preservative, other>",
    "sub_category": "<specific type, e.g., 'vitamin_d', 'gelatin', 'lecithin'>",
    "properties": {{
        "is_allergen": <true/false>,
        "allergen_type": "<if applicable: soy, dairy, fish, shellfish, tree_nuts, peanuts, wheat, eggs, or null>",
        "is_vegan": <true/false/unknown>,
        "is_vegetarian": <true/false/unknown>,
        "is_organic": <true/false/unknown>
    }}
}}

Only return the JSON, no explanation.
"""
```

### Template 2: Substitution Analysis

```python
SUBSTITUTION_PROMPT = """
Analyze potential substitutes for the following component in a dietary supplement BOM.

CURRENT COMPONENT:
- SKU: {current_sku}
- Normalized Name: {current_name}
- Category: {category}
- Current Suppliers: {suppliers}
- Used in Product: {product_name} ({company_name})

POTENTIAL SUBSTITUTES (same category):
{substitute_list}

For each potential substitute, evaluate:
1. FUNCTIONAL EQUIVALENCE: Would this provide the same benefit to the end product?
2. FORM COMPATIBILITY: Can this substitute work in the same dosage form?
3. ALLERGEN IMPACT: Does this change the allergen profile?
4. DIETARY IMPACT: Does this affect vegan/vegetarian/kosher/halal status?

Return JSON:
{{
    "substitution_candidates": [
        {{
            "target_sku": "<sku>",
            "target_name": "<normalized name>",
            "confidence": <0.0-1.0>,
            "reasoning_summary": "<1-2 sentence explanation>",
            "functional_match": <true/false>,
            "form_compatible": <true/false>,
            "allergen_change": "<none/improved/worsened>",
            "dietary_change": "<none/improved/worsened>",
            "risks": ["<list of risks if any>"],
            "assumptions": ["<list of assumptions made>"]
        }}
    ],
    "no_substitutes_reason": "<if no candidates, explain why>"
}}
"""
```

### Template 3: Compliance Evaluation

```python
COMPLIANCE_PROMPT = """
Evaluate whether the following component substitution maintains regulatory and quality compliance.

ORIGINAL COMPONENT:
{original_component_json}

PROPOSED SUBSTITUTE:
{substitute_component_json}

AVAILABLE EVIDENCE:
{evidence_json}

PRODUCT CONTEXT:
- Product Type: {product_type}
- Company: {company_name}
- Other Components in BOM: {other_components}

Evaluate against these criteria:
1. REGULATORY STATUS: Is the substitute equally or more compliant with FDA regulations?
2. SAFETY: Are there any safety concerns with the substitution?
3. QUALITY SPECS: Does the substitute meet equivalent quality standards?
4. CLAIMS IMPACT: Would this substitution require label changes or affect product claims?

Return JSON:
{{
    "verdict": "<approved/conditional/rejected/needs_review>",
    "confidence": <0.0-1.0>,
    "reasoning_summary": "<2-3 sentence summary>",
    "evidence": [
        {{
            "source": "<source name/url>",
            "type": "<structured_data/external_web/heuristic>",
            "content": "<relevant excerpt>",
            "relevance_score": <0.0-1.0>
        }}
    ],
    "compliance_details": {{
        "regulatory": {{"status": "<pass/fail/unknown>", "notes": "<explanation>"}},
        "safety": {{"status": "<pass/fail/unknown>", "notes": "<explanation>"}},
        "quality": {{"status": "<pass/fail/unknown>", "notes": "<explanation>"}},
        "labeling": {{"status": "<pass/fail/unknown>", "notes": "<explanation>"}}
    }},
    "conditions": ["<if conditional, list conditions that must be met>"],
    "risks": ["<identified risks>"],
    "assumptions": ["<assumptions made due to missing data>"],
    "missing_data": ["<data that would improve this assessment>"]
}}
"""
```

### Template 4: Final Recommendation

```python
RECOMMENDATION_PROMPT = """
Generate a final sourcing recommendation for the following BOM based on the compliance-cleared substitution options.

BOM: {bom_name} ({company_name})
Current Suppliers: {current_supplier_count}
Current Components: {component_count}

SUBSTITUTION OPTIONS:
{substitution_options_json}

OPTIMIZATION GOALS (in priority order):
1. Maintain or improve compliance confidence
2. Reduce number of suppliers (consolidation)
3. Reduce estimated cost (if data available)
4. Maintain or reduce lead time risk

Generate a recommendation that:
- Selects the best substitution for each opportunity
- Explains the expected impact
- Highlights any tradeoffs
- Provides clear next steps

Return JSON:
{{
    "recommendation_id": "<unique id>",
    "bom_id": {bom_id},
    "summary": "<executive summary in 2-3 sentences>",
    "changes": [
        {{
            "component_id": "<id>",
            "current": "<current component name>",
            "recommended": "<recommended substitute>",
            "rationale": "<why this change>",
            "confidence": <0.0-1.0>,
            "evidence_links": ["<sources>"]
        }}
    ],
    "impact": {{
        "supplier_reduction": <number>,
        "compliance_confidence": "<improved/maintained/uncertain>",
        "estimated_cost_impact": "<reduced X%/increased X%/unknown>",
        "lead_time_impact": "<reduced/increased/unchanged/unknown>"
    }},
    "risks": ["<list of risks>"],
    "next_steps": ["<action items for procurement team>"],
    "needs_human_review": ["<items flagged for human verification>"]
}}
"""
```

---

## Uncertainty Handling

### Confidence Score Interpretation

| Score Range | Label | Action |
|-------------|-------|--------|
| 0.85 - 1.00 | High Confidence | Auto-approve for recommendation |
| 0.65 - 0.84 | Medium Confidence | Include with caveats |
| 0.40 - 0.64 | Low Confidence | Flag for human review |
| 0.00 - 0.39 | Insufficient | Do not include in recommendation |

### Missing Data Handling

```python
UNCERTAINTY_RESPONSES = {
    "missing_compliance_data": {
        "verdict": "needs_review",
        "message": "Compliance status cannot be determined. Missing: {missing_fields}",
        "action": "Contact supplier for specification sheet"
    },
    "conflicting_evidence": {
        "verdict": "needs_review",
        "message": "Conflicting information found. Source A says {a}, Source B says {b}",
        "action": "Human verification required"
    },
    "no_external_data": {
        "verdict": "conditional",
        "message": "No external verification available. Proceeding based on component name analysis only.",
        "confidence_penalty": 0.3
    }
}
```

### Hallucination Prevention

1. **Source Enforcement**: Every claim must cite a source
2. **Confidence Calibration**: LLM must justify confidence scores
3. **Refusal Training**: System explicitly instructed to say "I don't know"
4. **Evidence Validation**: URL sources are verified accessible
5. **Human Review Flag**: Low-confidence items automatically flagged

---

## Tech Stack

### Core
| Component | Choice | Version |
|-----------|--------|---------|
| Language | Python | 3.11+ |
| Database | SQLite | 3.x (built-in) |
| Vector Store | ChromaDB | 0.4.x |
| LLM Client | Anthropic SDK | 0.25.x |
| Embeddings | OpenAI | 1.x |

### Libraries
```
# requirements.txt
anthropic>=0.25.0
openai>=1.0.0
chromadb>=0.4.0
pydantic>=2.0.0
httpx>=0.25.0
beautifulsoup4>=4.12.0
pytest>=7.4.0
pytest-asyncio>=0.21.0
python-dotenv>=1.0.0
rich>=13.0.0  # for CLI output formatting
```

### Optional (if time permits)
```
fastapi>=0.100.0
uvicorn>=0.23.0
```

---

## Environment Setup

### Prerequisites
- Python 3.11+
- pip or uv package manager

### Setup Commands

```bash
# 1. Clone and enter directory
cd /Users/I765601/Desktop/Spherecast_Last_Vegas

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install anthropic openai chromadb pydantic httpx beautifulsoup4 pytest pytest-asyncio python-dotenv rich

# 4. Set up environment variables
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
DATABASE_PATH=data/db.sqlite
CHROMA_PATH=data/chroma
LOG_LEVEL=INFO
EOF

# 5. Initialize extended database schema
python -c "
import sqlite3
conn = sqlite3.connect('data/db.sqlite')
with open('agents/sql/init_extended.sql', 'r') as f:
    conn.executescript(f.read())
conn.close()
print('Database extended successfully')
"

# 6. Create necessary directories
mkdir -p data/chroma
mkdir -p data/cache
mkdir -p output

# 7. Verify setup
python -c "
import sqlite3
import anthropic
import chromadb
print('All imports successful')
conn = sqlite3.connect('data/db.sqlite')
print(f'Database has {conn.execute(\"SELECT COUNT(*) FROM Product\").fetchone()[0]} products')
conn.close()
"

# 8. Run the pipeline
python agents/pipeline.py --bom-id 1

# 9. Run tests
pytest agents/tests/ -v
```

### Directory Structure After Setup

```
Spherecast_Last_Vegas/
├── agents/
│   ├── __init__.py
│   ├── 01_data_loader.py
│   ├── 02_bom_analyzer.py
│   ├── 03_substitution_detector.py
│   ├── 04_external_enricher.py
│   ├── 05_compliance_checker.py
│   ├── 06_recommendation_engine.py
│   ├── 07_report_generator.py
│   ├── pipeline.py
│   ├── config.py
│   ├── schemas.py
│   ├── utils.py
│   ├── sql/
│   │   └── init_extended.sql
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       └── test_pipeline.py
├── data/
│   ├── db.sqlite
│   ├── chroma/
│   └── cache/
├── docs/
│   ├── 01_challenge_and_data.md
│   ├── 02_execution_plan.md
│   ├── 03_system_architecture.md
│   └── 04_evaluation.md
├── output/
│   └── (generated reports)
├── .env
├── .gitignore
├── requirements.txt
└── README.md
```
