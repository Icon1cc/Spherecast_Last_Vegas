# Spherecast Data Analysis

## Overview

The data is stored in a SQLite database (`data/db.sqlite`) containing supply chain information for CPG (Consumer Packaged Goods) companies, specifically focused on supplements and nutrition products.

---

## Database Statistics

| Table | Record Count | Description |
|-------|-------------|-------------|
| Company | 61 | CPG brands/companies |
| Product | 1,025 | All products (finished goods + raw materials) |
| BOM | 149 | Bill of Materials records |
| BOM_Component | 1,528 | Component mappings |
| Supplier | 40 | Raw material suppliers |
| Supplier_Product | 1,633 | Supplier-to-product mappings |
| Component_Normalized | 0 | **Empty - to be populated** |
| Substitution_Candidate | 0 | **Empty - to be populated** |
| External_Evidence | 0 | **Empty - to be populated** |
| Compliance_Verdict | 0 | **Empty - to be populated** |
| Sourcing_Recommendation | 0 | **Empty - to be populated** |

### Product Breakdown
- **Finished Goods**: 149 products
- **Raw Materials**: 876 components

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Company   │       │   Product   │       │  Supplier   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ Id (PK)     │──┐    │ Id (PK)     │    ┌──│ Id (PK)     │
│ Name        │  │    │ SKU         │    │  │ Name        │
└─────────────┘  │    │ CompanyId   │◄───┘  └─────────────┘
                 └───►│ Type        │              │
                      └─────────────┘              │
                            │                      │
              ┌─────────────┼──────────────────────┘
              │             │
              ▼             ▼
       ┌─────────────┐    ┌──────────────────┐
       │     BOM     │    │ Supplier_Product │
       ├─────────────┤    ├──────────────────┤
       │ Id (PK)     │    │ SupplierId (FK)  │
       │ ProducedPro │    │ ProductId (FK)   │
       │ ductId (FK) │    └──────────────────┘
       └─────────────┘
              │
              ▼
       ┌───────────────┐
       │ BOM_Component │
       ├───────────────┤
       │ BOMId (FK)    │
       │ ConsumedPro   │
       │ ductId (FK)   │
       └───────────────┘

=== Tables to be populated by your solution ===

┌──────────────────────┐     ┌────────────────────────┐
│ Component_Normalized │     │ Substitution_Candidate │
├──────────────────────┤     ├────────────────────────┤
│ Id (PK)              │     │ Id (PK)                │
│ RawProductId (FK)    │     │ SourceProductId (FK)   │
│ NormalizedName       │     │ TargetProductId (FK)   │
│ Category             │     │ Confidence             │
│ SubCategory          │     │ ReasoningSummary       │
└──────────────────────┘     │ CreatedAt              │
                             └────────────────────────┘
                                       │
                                       ▼
┌───────────────────┐         ┌────────────────────┐
│ External_Evidence │         │ Compliance_Verdict │
├───────────────────┤         ├────────────────────┤
│ Id (PK)           │         │ Id (PK)            │
│ ProductId (FK)    │         │ SubstitutionCandi  │
│ SupplierId (FK)   │         │ dateId (FK)        │
│ SourceType        │         │ Verdict            │
│ SourceUrl         │         │ Confidence         │
│ Content           │         │ ReasoningJson      │
│ RelevanceScore    │         │ CreatedAt          │
│ FetchedAt         │         └────────────────────┘
└───────────────────┘

┌──────────────────────────┐
│ Sourcing_Recommendation  │
├──────────────────────────┤
│ Id (PK)                  │
│ BOMId (FK)               │
│ RecommendationJson       │
│ Score                    │
│ CreatedAt                │
└──────────────────────────┘
```

---

## Detailed Table Descriptions

### 1. Company
Companies/brands that produce finished goods (supplements, nutrition products).

**Sample Data:**
| Id | Name |
|----|------|
| 1 | 21st Century |
| 6 | Animal |
| 28 | NOW Foods |
| 38 | Optimum Nutrition |
| 48 | Solgar |

**Total: 61 companies** including major brands like NOW Foods, Solgar, Garden of Life, Nordic Naturals, Thorne, GNC, etc.

---

### 2. Product
All products in the system - both finished goods (supplements) and raw materials (ingredients).

**Schema:**
```sql
CREATE TABLE Product (
    Id INTEGER PRIMARY KEY,
    SKU TEXT NOT NULL,
    CompanyId INTEGER NOT NULL,
    Type TEXT NOT NULL CHECK (Type IN ('finished-good', 'raw-material')),
    FOREIGN KEY (CompanyId) REFERENCES Company (Id)
);
```

**SKU Naming Convention:**
- **Finished Goods**: `FG-{source}-{product-id}`
  - Example: `FG-iherb-10421`, `FG-thrive-market-671635734464`
- **Raw Materials**: `RM-C{company-id}-{ingredient-name}-{hash}`
  - Example: `RM-C28-vitamin-d3-cholecalciferol-8956b79c`

**Product Type Distribution:**
| Type | Count |
|------|-------|
| finished-good | 149 |
| raw-material | 876 |

---

### 3. BOM (Bill of Materials)
Links finished goods to their recipes. Each BOM record represents one finished product.

**Schema:**
```sql
CREATE TABLE BOM (
    Id INTEGER PRIMARY KEY,
    ProducedProductId INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (ProducedProductId) REFERENCES Product (Id)
);
```

**Total: 149 BOMs** (one per finished good)

---

### 4. BOM_Component
Maps which raw materials are used in each finished good.

**Schema:**
```sql
CREATE TABLE BOM_Component (
    BOMId INTEGER NOT NULL,
    ConsumedProductId INTEGER NOT NULL,
    PRIMARY KEY (BOMId, ConsumedProductId),
    FOREIGN KEY (BOMId) REFERENCES BOM (Id),
    FOREIGN KEY (ConsumedProductId) REFERENCES Product (Id)
);
```

**Sample BOM Breakdown (BOM Id 1 - NOW Foods Vitamin D3):**
| Finished Good | Raw Material |
|---------------|--------------|
| FG-iherb-10421 | RM-C28-glycerin-85e43afb |
| FG-iherb-10421 | RM-C28-safflower-oil-a84bc3ce |
| FG-iherb-10421 | RM-C28-softgel-capsule-bovine-gelatin-5a1a1582 |
| FG-iherb-10421 | RM-C28-vitamin-d3-cholecalciferol-8956b79c |

**Components per BOM Statistics:**
- Min: 2 components
- Max: 17+ components
- Average: ~10 components

---

### 5. Supplier
Raw material suppliers/vendors.

**Top Suppliers by Product Coverage:**
| Supplier | Products Supplied |
|----------|-------------------|
| Prinova USA | 408 |
| PureBulk | 316 |
| Jost Chemical | 191 |
| Colorcon | 109 |
| Ashland | 100 |
| Ingredion | 86 |
| Cargill | 52 |
| Gold Coast Ingredients | 47 |
| ADM | 36 |
| American Botanicals | 33 |

**Total: 40 suppliers**

---

### 6. Supplier_Product
Maps which suppliers can provide which raw materials.

**Key Insight**: Most raw materials have 2+ suppliers, enabling substitution opportunities.

**Sample Multi-Supplier Materials:**
| Raw Material | Suppliers |
|--------------|-----------|
| calcium-citrate | Jost Chemical, PureBulk |
| cellulose | Ashland, Colorcon |
| vitamin-d3-cholecalciferol | Prinova USA, PureBulk |
| magnesium-stearate | Ashland, Colorcon |

---

### 7. Component_Normalized (Empty - To Be Populated)
Stores normalized/categorized versions of raw materials.

**Schema:**
```sql
CREATE TABLE Component_Normalized (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RawProductId INTEGER NOT NULL,
    NormalizedName TEXT NOT NULL,
    Category TEXT NOT NULL,
    SubCategory TEXT,
    FOREIGN KEY (RawProductId) REFERENCES Product(Id)
);
```

**Purpose**: Standardize ingredient names for substitution matching.

---

### 8. Substitution_Candidate (Empty - To Be Populated)
Stores potential substitution pairs with confidence scores.

**Schema:**
```sql
CREATE TABLE Substitution_Candidate (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceProductId INTEGER NOT NULL,
    TargetProductId INTEGER NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningSummary TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 9. External_Evidence (Empty - To Be Populated)
Stores external data gathered to support decisions.

**Schema:**
```sql
CREATE TABLE External_Evidence (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER,
    SupplierId INTEGER,
    SourceType TEXT NOT NULL,
    SourceUrl TEXT,
    Content TEXT NOT NULL,
    RelevanceScore REAL,
    FetchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 10. Compliance_Verdict (Empty - To Be Populated)
Stores compliance check results for substitutions.

**Schema:**
```sql
CREATE TABLE Compliance_Verdict (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SubstitutionCandidateId INTEGER NOT NULL,
    Verdict TEXT NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningJson TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 11. Sourcing_Recommendation (Empty - To Be Populated)
Final sourcing recommendations per BOM.

**Schema:**
```sql
CREATE TABLE Sourcing_Recommendation (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BOMId INTEGER NOT NULL,
    RecommendationJson TEXT NOT NULL,
    Score REAL NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Raw Material Categories

Based on SKU analysis, raw materials fall into these categories:

| Category | Count | Examples |
|----------|-------|----------|
| Vitamins | 122 | vitamin-d3, vitamin-c, vitamin-b12, biotin |
| Acids | 46 | ascorbic-acid, stearic-acid, citric-acid |
| Excipients | 41 | cellulose, microcrystalline-cellulose, starch |
| Flavors/Sweeteners | 39 | natural-flavors, stevia, acesulfame-potassium |
| Proteins | 29 | whey-protein-isolate, pea-protein, collagen |
| Capsules | 22 | gelatin, softgel-capsule, hypromellose |
| Extracts | 18 | green-tea-extract, turmeric-extract |
| Oils | 17 | fish-oil, safflower-oil, sunflower-oil |
| Other | 542 | minerals, amino acids, probiotics, etc. |

---

## Most Common Raw Materials

Materials used across multiple products (substitution-critical):

| Raw Material | Used In # Products |
|--------------|-------------------|
| magnesium-stearate | 12 |
| vitamin-d3-cholecalciferol | 11 |
| stearic-acid | 10 |
| cellulose-gel | 10 |
| whey-protein-isolate | 9 |
| whey-protein-concentrate | 9 |
| sunflower-lecithin | 9 |
| soy-lecithin | 9 |
| acesulfame-potassium | 9 |
| gelatin | 9 |

---

## Key Observations

1. **High Substitution Potential**: Many ingredients appear in multiple forms (e.g., soy lecithin vs sunflower lecithin, whey isolate vs concentrate)

2. **Supplier Redundancy**: Most materials have 2+ suppliers - good for cost optimization

3. **Empty Tables = Your Work**: The 5 empty tables represent the AI system you need to build:
   - Normalize components
   - Find substitutions
   - Gather external evidence
   - Check compliance
   - Generate recommendations

4. **Product Domain**: Focus is on supplements/nutrition products (Omega-3, vitamins, proteins, etc.)

5. **Data Quality**: SKUs contain ingredient names embedded, making NLP extraction possible
