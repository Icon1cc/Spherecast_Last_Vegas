# Challenge and Data Analysis

## Challenge Summary

**Problem**: Spherecast is building an AI Supply Chain Manager called "Agnes" for CPG (Consumer Packaged Goods) companies in the supplements/nutraceuticals space. The hackathon challenge is to give Agnes "Raw Material Superpowers" - the ability to intelligently reason about component substitutions, compliance, and sourcing optimization.

**End User**: Internal procurement/supply chain teams at supplement brands who need to:
- Identify which components in their BOMs can be substituted
- Ensure any substitution maintains quality and compliance standards
- Optimize sourcing by consolidating suppliers and reducing costs

**What Agnes Must Do**:
1. Find **interchangeable components** (ingredients, packaging, labels, filling materials)
2. Determine **quality and compliance standards** any replacement must meet
3. **Recommend best sourcing option** with clear reasoning on cost, supplier consolidation, and compliance

---

## What Is Given

### Database Schema (SQLite: `data/db.sqlite`)

| Table | Rows | Description |
|-------|------|-------------|
| `Company` | 61 | Supplement brands (e.g., NOW Foods, Solgar, Nature Made) |
| `Product` | 1,025 | Both finished goods and raw materials |
| `BOM` | 149 | Bill of Materials - one per finished product |
| `BOM_Component` | 1,528 | Many-to-many: links BOMs to their raw material components |
| `Supplier` | 40 | Raw material suppliers (e.g., ADM, Prinova USA, Cargill) |
| `Supplier_Product` | 1,633 | Many-to-many: which suppliers can provide which raw materials |

### Schema Details

```sql
-- Companies (brands)
Company(Id INTEGER PRIMARY KEY, Name TEXT NOT NULL)

-- Products: either 'finished-good' or 'raw-material'
Product(Id INTEGER PRIMARY KEY, SKU TEXT NOT NULL, CompanyId INTEGER,
        Type TEXT CHECK (Type IN ('finished-good', 'raw-material')))

-- BOMs link to the finished product they produce
BOM(Id INTEGER PRIMARY KEY, ProducedProductId INTEGER NOT NULL UNIQUE)

-- BOM components link BOMs to consumed raw materials
BOM_Component(BOMId INTEGER, ConsumedProductId INTEGER, PRIMARY KEY (BOMId, ConsumedProductId))

-- Suppliers
Supplier(Id INTEGER PRIMARY KEY, Name TEXT NOT NULL)

-- Supplier-product mapping
Supplier_Product(SupplierId INTEGER, ProductId INTEGER, PRIMARY KEY (SupplierId, ProductId))
```

### Product Breakdown
- **149 finished goods** (supplements with SKU pattern `FG-{source}-{product-id}`)
- **876 raw materials** (components with SKU pattern `RM-C{company-id}-{component-name}-{hash}`)

### Top Suppliers by Product Coverage
| Supplier | Products Supplied |
|----------|------------------|
| Prinova USA | 408 |
| PureBulk | 316 |
| Jost Chemical | 191 |
| Colorcon | 109 |
| Ashland | 100 |
| Ingredion | 86 |
| Cargill | 52 |
| Gold Coast Ingredients | 47 |
| ADM | 36 |

### Raw Material Categories (approximate from SKU analysis)
| Category | Count |
|----------|-------|
| Other (minerals, acids, etc.) | 495 |
| Vitamins | 122 |
| Magnesium compounds | 65 |
| Flavors | 38 |
| Calcium compounds | 32 |
| Proteins (whey, etc.) | 29 |
| Capsules/Gelatin | 22 |
| Zinc compounds | 21 |
| Sweeteners | 20 |
| Oils | 17 |
| Lecithin | 15 |

### Sample BOM (NOW Foods Vitamin D3 Softgel - BOM #1)
```
FG-iherb-10421 (NOW Foods)
├── RM-C28-glycerin-85e43afb
├── RM-C28-safflower-oil-a84bc3ce
├── RM-C28-softgel-capsule-bovine-gelatin-5a1a1582
└── RM-C28-vitamin-d3-cholecalciferol-8956b79c
```

### Key Relationships Observed
1. **Multiple suppliers per component**: Many raw materials (e.g., Vitamin D3) are supplied by 2+ suppliers (typically Prinova USA and PureBulk)
2. **Component reuse across products**: Same functional components appear across multiple companies' BOMs
3. **Company-specific variants**: Same ingredient (e.g., "sunflower lecithin") exists as separate products per company (RM-C6-sunflower-lecithin, RM-C8-sunflower-lecithin, etc.)

---

## What Is Expected

### Deliverables
1. **Working prototype** - A functional decision-support system
2. **Presentation** covering:
   - Problem and business relevance
   - Data sourcing and enrichment approach
   - Substitution detection and compliance logic
   - Recommendation/optimization logic
   - Architecture and model choices
   - System demo
   - Uncertainty handling explanation

### Judging Criteria (Ranked by Weight)

| Priority | Criteria | Notes |
|----------|----------|-------|
| **HIGH** | Practical usefulness and business relevance | Does it solve a real problem? |
| **HIGH** | Strong reasoning and clear evidence trails | Can users trust the recommendations? |
| **HIGH** | Trustworthiness and low hallucination risk | Critical for compliance decisions |
| **HIGH** | Ability to find/use missing external information | Must enrich sparse data |
| **MEDIUM** | Solid substitution and compliance logic | Core technical challenge |
| **MEDIUM** | Clear and defensible sourcing recommendations | End-to-end value |
| **MEDIUM** | Creativity in scaling potential | Future vision |
| **LOW** | UI polish | Explicitly deprioritized |

### Winning vs Mediocre Solution

**Winning Solution**:
- Deep reasoning with cited external evidence
- Confidence scores and uncertainty handling
- Clear tradeoff explanations (cost vs compliance vs lead time)
- Recommends specific actions with justification
- Handles edge cases gracefully ("I don't know" > hallucination)

**Mediocre Solution**:
- Surface-level pattern matching
- No external data enrichment
- Binary yes/no recommendations without nuance
- No evidence trail
- Overconfident or hallucinates compliance claims

---

## Key Constraints

### Compliance Inference
- No explicit compliance data in the database
- Must infer from:
  - Component names (e.g., "bovine-gelatin" vs "vegetarian-capsule" vs "vegan-capsule")
  - External certification sources
  - Regulatory databases (FDA, GRAS, etc.)

### Substitution Logic
- Functional equivalence (e.g., any Vitamin D3 source)
- Form factor constraints (e.g., bovine gelatin softgel cannot swap to vegetarian capsule without reformulation)
- Allergen considerations (soy lecithin vs sunflower lecithin)
- Certifications (organic, non-GMO, kosher, halal)

### Explainability Requirements
- Every recommendation must cite sources
- Confidence levels must be shown
- Tradeoffs must be explicit

### Hallucination Risk
- High stakes domain (dietary supplements)
- Must refuse rather than guess on compliance
- External claims must be verifiable

---

## Data Gaps (Must Source Externally)

| Gap | What's Needed | Potential Sources |
|-----|---------------|-------------------|
| **Pricing** | No cost data for raw materials | Supplier websites, industry databases |
| **Lead times** | No delivery/availability data | Supplier catalogs, trade databases |
| **Certifications** | Organic, non-GMO, kosher, halal status | Supplier spec sheets, certification bodies |
| **Specifications** | Purity, concentration, origin | Supplier technical data sheets |
| **Regulatory status** | GRAS, FDA compliance | FDA GRAS database, CFR Title 21 |
| **Allergen info** | Contains/may contain allergens | Supplier COAs, product labels |
| **Functional properties** | Solubility, stability, interactions | Scientific literature, supplier docs |

---

## Open Questions for Team Discussion

1. **Scope of substitution**: Do we only suggest same-ingredient swaps (e.g., Vitamin D3 from Supplier A vs B) or also functional alternatives (e.g., fish oil omega-3 vs algae omega-3)?

2. **Compliance assumptions**: When external data is unavailable, do we:
   - Flag as "needs verification"
   - Assume baseline compliance
   - Block the recommendation entirely

3. **Supplier consolidation weight**: How aggressively should we optimize for fewer suppliers vs best-in-class per component?

4. **Demo scenario**: Which specific BOM(s) should we use for the demo? Suggest:
   - Simple case: Vitamin D softgel (4 components)
   - Complex case: Multivitamin (17+ components)
   - Electrolyte powder (14 components, no capsule complexity)

5. **External data approach**:
   - Live scraping during demo (impressive but risky)
   - Pre-cached enrichment (reliable but less dynamic)
   - Hybrid with fallback

---

## Findings from the Data

### Patterns Discovered

1. **Supplier Duopoly**: Prinova USA and PureBulk together cover most commodity raw materials. This is both an opportunity (consolidation is feasible) and a risk (limited alternatives for some components).

2. **Company-Specific SKUs**: Each company has its own variant of common ingredients (e.g., 33 different Vitamin D3 SKUs across companies). This suggests normalization is needed to identify true substitutes.

3. **Capsule Type Clustering**:
   - Bovine gelatin softgels: 8 products
   - Vegetarian capsules: 3 products
   - Vegan capsules (hypromellose): 3 products
   - PlantGel capsules: 1 product

   This is a prime substitution category with clear compliance implications.

4. **Protein Sources**:
   - Whey protein isolate: multiple variants
   - Whey protein concentrate: multiple variants
   - Plant proteins (pea, rice): sparse

   Opportunity for vegan/dairy-free substitution logic.

5. **Lecithin Variants**:
   - Soy lecithin: 7 products (allergen concern)
   - Sunflower lecithin: 10 products (allergen-free alternative)
   - Organic sunflower lecithin: 1 product

   Clear substitution path for allergen-free reformulation.

6. **BOM Complexity Distribution**:
   - Simple BOMs: 2-6 components (vitamins, single-ingredient supplements)
   - Medium BOMs: 8-14 components (electrolyte powders, protein blends)
   - Complex BOMs: 15-20+ components (multivitamins)

7. **No Quantity Data**: BOM_Component has no quantity/dosage field. Substitution must be 1:1 or inferred from external sources.

### Anomalies to Investigate

1. Some finished goods have very few components (2-4) which may indicate incomplete data
2. Hash suffixes on SKUs suggest these are normalized/deduplicated versions - original source data likely had more detail
3. CompanyId in Product table links raw materials to companies, but raw materials should theoretically be company-agnostic - this appears to be "which company uses this variant"
