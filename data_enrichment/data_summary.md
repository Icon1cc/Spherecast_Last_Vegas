# Spherecast Hackathon — Database Summary

---

## Entity Roles (Critical Distinction)

| Entity | Role |
|---|---|
| **Company** | The brand that sells finished products to consumers (e.g. Centrum, Optimum Nutrition, Liquid I.V.) |
| **Product (finished-good)** | The consumer-facing product (e.g. a multivitamin bottle, protein powder) |
| **Product (raw-material)** | An ingredient/component — each company has its own RM records even for identical substances |
| **Supplier** | B2B ingredient supplier delivering raw materials to companies (e.g. Prinova USA, Cargill) |
| **BOM** | Bill of Materials — the recipe for one finished good |
| **BOM_Component** | A single ingredient (raw-material) in a BOM |
| **Supplier_Product** | Which supplier can deliver which raw material |

**In short: Suppliers → deliver RMs → Companies consume RMs → produce finished goods they sell to consumers.**

---

## Schema — All Columns

```
Company:          Id (PK), Name
Product:          Id (PK), SKU, CompanyId (FK→Company), Type (finished-good | raw-material)
BOM:              Id (PK), ProducedProductId (FK→Product)
BOM_Component:    BOMId (FK→BOM, PK), ConsumedProductId (FK→Product, PK)
Supplier:         Id (PK), Name
Supplier_Product: SupplierId (FK→Supplier, PK), ProductId (FK→Product, PK)
```

**There are NO columns for**: CAS number, purity/assay %, price, volume/quantity, lead time, MOQ, certifications, physical form, concentration, or country of origin. All of this must come from external enrichment.

---

## Table Row Counts

| Table | Rows |
|---|---|
| `Company` | 61 |
| `Product` | 1,025 (149 finished-goods + 876 raw-materials) |
| `BOM` | 149 |
| `BOM_Component` | 1,528 |
| `Supplier` | 40 |
| `Supplier_Product` | 1,633 |

---

## Domain
**Health supplement / nutraceutical CPG** — vitamins, protein powders, electrolyte drinks, omega-3s, probiotics. Real brands, approximated BOMs.

---

## Products

### Finished Goods (149)
SKU format: `FG-{retailer}-{id}` encodes the sales channel. All 149 finished goods have exactly one BOM.

| Retailer | FG count | Volume tier |
|---|---|---|
| Target | 20 | Mass-market high |
| Walmart | 18 | Mass-market high |
| Thrive Market | 16 | Premium/specialty |
| The Vitamin Shoppe | 15 | Specialty |
| Amazon | 15 | Mixed |
| Walgreens | 14 | Mass-market |
| iHerb | 13 | Online specialty |
| Vitacost | 12 | Online specialty |
| CVS | 10 | Mass-market |
| Costco | 9 | Mass-market bulk |
| Sam's Club | 5 | Bulk/wholesale |
| GNC | 2 | Specialty |

**BOM complexity stats**: avg 10.3 ingredients, min 2, max 48.

Companies with most finished goods: Nature Made (22), Vitacost (10), The Vitamin Shoppe (10), One A Day (10), Optimum Nutrition (9), up&up (7), Liquid I.V. (5), Equate (4).

### Raw Materials (876)
SKU format: `RM-C{CompanyId}-{ingredient-name}-{hash}`. The hash ensures uniqueness; two records with the same ingredient name but different hashes may or may not be the same substance — this is the core deduplication challenge.

**Key fact: Zero orphaned raw materials.** All 876 RMs have at least one supplier in `Supplier_Product`.

---

## BOM Deep Dives — Representative Examples

### Simplest BOMs (2 ingredients)
**Wellmade magnesium glycinate** (`FG-thrive-market-671635734464`):
- `magnesium-glycinate` + `vegan-capsule-hypromellose`
→ Just active + capsule shell. Zero excipients. Easy substitution analysis.

**Nordic Naturals Vitamin D3** (`FG-walmart-109808244`):
- `vitamin-d3-cholecalciferol` + `soft-gel-capsule-bovine-gelatin` + `glycerin`
→ Active in oil-fill softgel. Bovine gelatin = non-vegan/halal constraint.

**Vitacost Vitamin D3** (`FG-vitacost-vitacost-vitamin-d3-as-cholecalciferol`):
- `vitamin-d3-cholecalciferol` + `gelatin` + `oil-fill`
→ Structurally identical to Nordic Naturals. Same 3-ingredient softgel pattern. Prime substitution candidate for D3 consolidation — but `oil-fill` (generic) vs `glycerin` (named) needs spec check.

### Medium BOM — Electrolyte drink
**LMNT Grapefruit Salt** (`FG-thrive-market-drink-lmnt-electrolyte-drink-mix-grapefruit-salt`, 6 ingredients):
- `salt-sodium-chloride` + `potassium-chloride` + `magnesium-malate` + `citric-acid` + `natural-flavor` + `stevia-leaf-extract`
→ Clean-label, no artificial sweeteners. The mineral forms are specific: `potassium-chloride` (not citrate), `magnesium-malate` (not oxide). Substituting to `magnesium-oxide` would change the product character.

**Liquid I.V.** (`FG-iherb-105065`, 14 ingredients):
- Electrolyte base: `dextrose` + `pure-cane-sugar` + `salt` + `dipotassium-phosphate` + `potassium-citrate` + `sodium-citrate`
- Vitamins: `vitamin-c-ascorbic-acid` + `vitamin-b3-niacinamide` + `vitamin-b5-d-calcium-pantothenate` + `vitamin-b6-pyridoxine-hydrochloride` + `vitamin-b12-cyanocobalamin`
- Other: `citric-acid` + `silicon-dioxide` + `stevia-leaf-extract-rebaudioside-a`
→ Much more complex than LMNT. Sugar-based (dextrose + cane sugar) vs LMNT's no-sugar. Not interchangeable as products but individual ingredients overlap heavily with other electrolyte brands.

### Ritual Men's Multivitamin (14 ingredients) — premium/transparent formulation
- Active: `vitamin-a-retinyl-palmitate` + `vitamin-d3-cholecalciferol` + `vitamin-e-alpha-tocopherol` (d-alpha, natural) + `vitamin-k2-menaquinone-7` + `vitamin-b12-methylcobalamin` (premium form!) + `omega-3-dha` + `zinc-zinc-bisglycinate` + `magnesium-dimagnesium-malate` + `boron-calcium-fructoborate`
- Excipients: `cellulose` + `gellan-gum` + `hypromellose` + `silica`
- Coating: `non-gmo-corn-zein` (Tier 3 certified: non-GMO claim)
→ Uses premium ingredient forms throughout: methylcobalamin (not cyanocobalamin), MK-7 (not K1/phytonadione), d-alpha tocopherol (natural, not dl-synthetic). These cannot be substituted with cheaper synthetic forms without changing the product's marketing claims.

### Animal Protein Powder (`FG-iherb-116514`, 13 ingredients):
- Protein: `whey-protein-concentrate` + `whey-protein-isolate`
- Flavoring: `natural-flavor` + `artificial-flavor` + `cocoa-processed-with-alkali`
- Sweeteners: `sucralose` + `acesulfame-potassium`
- Stabilizers: `carrageenan` + `cellulose-gum` + `xanthan-gum`
- Lecithins: `soy-lecithin` + `sunflower-lecithin`
- Salt: `sodium-chloride`
→ Contains carrageenan (EU food safety scrutiny), artificial sweeteners, both soy and sunflower lecithin. Carrageenan substitution would be label-relevant.

### Most Complex BOM — Equate multivitamin (`FG-walmart-10324636`, 48 ingredients):
Full list includes: `calcium-carbonate`, `magnesium-oxide`, `zinc-oxide`, `ferrous-fumarate` wait — actually `cholecalciferol`, `retinyl-acetate`, `pyridoxine-hydrochloride`, `thiamine-mononitrate`, `riboflavin`, `folic-acid`, `cyanocobalamin`, `nicotinamide`, `d-calcium-pantothenate`, `biotin`, `phytonadione` (K1), `chromium-chloride`, `cupric-oxide`, `sodium-selenite`, `manganese-sulfate`, `sodium-molybdate`, `potassium-iodide`, `lycopene`, `beta-carotene`, `sodium-ascorbate`, `ascorbyl-palmitate`, `dl-alpha-tocopherol`, `dl-alpha-tocopheryl-acetate`, `tocopherols`, `gum-arabic`, `glucose`, `sorbitol`, `sucrose`, `polydextrose`, `sodium-benzoate`, `sorbic-acid`, `bht`, `tricalcium-phosphate`, `starch`, `sodium-starch-glycolate`, `carboxymethylcellulose-sodium`, `hydroxypropyl-methylcellulose`, `polyvinyl-alcohol`, `magnesium-stearate`, `silica`, `gelatin`, `maltodextrin`, `microcrystalline-cellulose`, `sunflower-oil`, `medium-chain-triglycerides`, `dl-tartaric-acid`
→ Uses dl-alpha tocopherol AND dl-alpha tocopheryl acetate AND tocopherols — three vitamin E forms in one product. Uses preservatives sodium-benzoate + sorbic-acid + BHT. Uses sorbitol + sucrose + glucose + polydextrose — multiple sugars. Highly complex; most excipients are commodity-grade with many potential substitution targets.

---

## Companies (61 total)

Key brands: Equate (Walmart private label), up&up (Target private label), One A Day, Nature Made, Centrum, Kirkland Signature (Costco), Walgreens, Optimum Nutrition, Garden of Life, NOW Foods, Ritual, Liquid I.V., LMNT, Orgain, Thorne, Jarrow Formulas, Nordic Naturals, Solgar, New Chapter, Aloha, Body Fortress, GNC, Care/of, Seeking Health, Vitacost, Sports Research, Pedialyte, PRIME HYDRATION+, Electrolit, BBEEAAUU, GMU SPORT (likely European brands).

Most raw materials per company: Equate (74), up&up (65), One A Day (48), The Vitamin Shoppe (45), Nature Made (39), Walgreens (34), Vitacost (33), Centrum (32).

---

## Suppliers (40 total)

| Supplier | Products covered | Companies served |
|---|---|---|
| Prinova USA | 408 | ~30+ |
| PureBulk | 316 | ~25+ |
| Jost Chemical | 191 | ~20+ |
| Colorcon | 109 | 27 |
| Ashland | 100 | 25 |
| Ingredion | 86 | ~20+ |
| Cargill | 52 | 33 |
| Gold Coast Ingredients | 47 | 31 |
| ADM | 36 | 25 |
| American Botanicals | 33 | 12 |
| Univar Solutions | 32 | ~15+ |
| Mueggenburg USA | 30 | ~10+ |
| Capsuline | 26 | 21 (capsule shells) |
| Actus Nutrition | 23 | 14 (protein) |
| Balchem | 22 | 14 |
| Darling Ingredients / Rousselot | 18 | 17 (gelatin/collagen) |
| Magtein / ThreoTech LLC | 1 | 1 (patented ingredient — no substitution) |
| FutureCeuticals | 1 | 1 (Ritual only) |
| IFF | 1 | 1 |
| Icelandirect | 1 | 1 |
| Source-Omega LLC | 1 | 1 |

**Key observation**: max 2 suppliers per individual company-RM record. But the same *canonical* ingredient is covered by many more suppliers across companies — the consolidation opportunity is in aggregating those.

**Zero orphaned RMs**: every one of the 876 raw materials has a supplier mapping.

---

## Supplier Reach — Cross-Company Overlap

The following company pairs share the most suppliers (prime consolidation candidates — least friction to consolidate to shared supplier):

| Company A | Company B | Shared suppliers |
|---|---|---|
| The Vitamin Shoppe | Vitacost | 15 |
| Equate | One A Day | 14 |
| Nature Made | up&up | 14 |
| Equate | The Vitamin Shoppe | 13 |
| One A Day | The Vitamin Shoppe | 13 |
| The Vitamin Shoppe | up&up | 13 |
| ALL ONE | The Vitamin Shoppe | 12 |
| ALL ONE | Vitacost | 12 |
| Equate | Vitacost | 12 |
| Equate | up&up | 12 |

These pairs already share 12–15 suppliers. Any new consolidation recommendation within these pairs has a very short path to execution — no new vendor qualification needed.

---

## Ingredient Identity and Substitutability

### No CAS/Purity Data in DB
The database contains **zero** columns for CAS numbers, purity/assay %, physical form, or concentration. These are the single most important missing pieces for Agnes. They must be sourced externally (supplier spec sheets, CAS databases, USP monographs).

### Confirming Ingredient Identity (External Enrichment Required)
To confirm two RM records are truly the same substance, compare:
1. **CAS number** — definitive chemical identity. Example: cholecalciferol = Vitamin D3 = CAS 67-97-0, regardless of SKU label.
2. **Specification / CoA** — supplier's Certificate of Analysis
3. **Assay %** — purity/potency (e.g. pure crystalline ascorbic acid ≥99% vs. vitamin C in a food blend at 40% are not equivalent inputs)
4. **Physical form** — powder vs. oil vs. granule vs. liquid (e.g. Vitamin D3 comes as dry powder AND as oil solution — these are not drop-in substitutes in the same formula)
5. **Excipients/diluents** — some ingredients are pre-diluted in a carrier (e.g. Vitamin D3 1% in MCT oil; the MCT oil is effectively another ingredient)
6. **Grade** — USP, EP, FCC, food grade, pharmaceutical grade

### Three-Tier Substitutability Framework

**Tier 1 — Identical substance, freely substitutable**
Same CAS, same form, same grade. Example: `vitamin-d3-cholecalciferol` vs `cholecalciferol` vs `vitamin-d3` — all CAS 67-97-0. If assay and physical form match → substitution is safe. Agnes can confidently consolidate these.

**Tier 2 — Same active element, different chemical form — needs bioequivalence + label compliance check**

| Ingredient family | Forms found in DB | Substitutability |
|---|---|---|
| Vitamin E | `dl-alpha-tocopherol` (synthetic), `dl-alpha-tocopheryl-acetate` (synthetic ester), `d-alpha-tocopheryl-succinate` (natural succinate), `d-alpha-tocopheryl-acetate` (natural acetate), `vitamin-e-alpha-tocopherol` (natural free) | **Critical**: d- prefix = natural (RRR-configuration, CAS 59-02-9); dl- prefix = synthetic racemate (CAS 10191-41-0). Natural d-alpha has ~1.36× higher biopotency per mg. Products claiming "natural vitamin E" cannot use dl-synthetic. |
| Vitamin D | `vitamin-d3`/`cholecalciferol` (CAS 67-97-0), `vitamin-d` (ambiguous — D2 or D3?), `cholecalciferol` alone | D2 (ergocalciferol, CAS 50-14-6) ≠ D3. ~4–5 ambiguous `vitamin-d` records need external resolution. |
| Vitamin B12 | `cyanocobalamin` (13 records, cheap synthetic), `methylcobalamin` (1 record, premium active — Ritual only), `vitamin-b12` generic (3 records) | Methylcobalamin is the active form; cyanocobalamin requires conversion. Premium brands (Ritual) explicitly use methylcobalamin. Cannot substitute down without label change. |
| Vitamin K | `phytonadione` / `phylloquinone` (K1), `vitamin-k2-menaquinone-7` (MK-7, K2) | K1 ≠ K2 biologically. K2 MK-7 is the premium form with longer half-life. |
| Zinc | `zinc-oxide`, `zinc-sulfate`, `zinc-bisglycinate`, `zinc-chelate`, `zinc-citrate`, `zinc-gluconate` | Same element, completely different bioavailability and label claims. |
| Magnesium | 10+ forms: `oxide`, `citrate`, `glycinate`, `bisglycinate`, `malate`, `carbonate`, `aspartate`, `taurate`, `l-threonate-magtein`, `amino-acid-chelate` | Magtein is patented (CAS 778571-57-6, supplier: Magtein/ThreoTech LLC) — zero substitution possible. Other forms differ in laxative threshold, absorption, and label claims. |
| Folate/Folic acid | `folic-acid` (synthetic, CAS 59-33-0), `folate` (could be 5-MTHF) | NOT interchangeable if product claims "active folate" or "methylfolate". |
| Iron | `ferrous-fumarate` (2 records), `iron-glycinate` (1 record), `iron` generic (3 records) | Ferrous fumarate → high elemental iron but GI side effects; glycinate chelate → better tolerance, premium claim. |
| Calcium | `calcium-carbonate`, `calcium-citrate`, `calcium-ascorbate`, `calcium-lactate-gluconate`, `dicalcium-phosphate`, `tricalcium-phosphate`, `dibasic-calcium-phosphate-dihydrate` | Carbonate = highest elemental Ca% but needs stomach acid; citrate = better absorbed, more expensive. |
| Potassium | `potassium-chloride`, `potassium-citrate`, `potassium-gluconate`, `potassium-aspartate`, `dipotassium-phosphate`, `potassium-alginate`, `potassium-iodide` | All different — iodide is a trace mineral source, chloride is electrolyte salt, alginate is a hydrocolloid. |
| Stevia | `stevia-leaf-extract`, `stevia-leaf-extract-rebaudioside-a`, `organic-stevia-leaf-extract-rebaudioside-a`, `organic-stevia-extract`, `organic-stevia` | Rebaudioside-A specification matters for sweetness profile. Organic vs. conventional is a Tier 3 certification issue. |
| Vitamin C | `ascorbic-acid`, `sodium-ascorbate`, `calcium-ascorbate`, `vitamin-c-ascorbic-acid`, `vitamin-c-l-ascorbic-acid`, `ascorbyl-palmitate` | Ascorbyl palmitate is fat-soluble (used as antioxidant preservative, not as vitamin C dose). Sodium/calcium ascorbate are buffered — lower acidity, different dose calculations. |

**Tier 3 — Certified variant — only substitutable if supplier holds same certification**

| Signal in SKU | Constraint |
|---|---|
| `organic-*` | USDA Organic cert from supplier required |
| `grass-fed-*` | Third-party certification required |
| `non-gmo-*` | Non-GMO Project verification or equivalent |
| `vegetable-*` / `vegan-capsule` | Vegan/vegetarian label compliance |
| `gelatin-capsule-bovine` / `softgel-bovine-gelatin` / `soft-gel-capsule-bovine-gelatin` | Non-halal, non-kosher, non-vegan — not substitutable into certified products |
| `organic-dairy-whey-protein-concentrate` | Organic cert — cannot substitute with conventional whey |
| `non-gmo-corn-zein` (Ritual coating) | Non-GMO certification required |
| `methylcobalamin` | Premium form claim — cannot downgrade to cyanocobalamin |
| `grass-fed-whey-protein-concentrate` | Grass-fed certification — cannot substitute with standard whey |

---

## Excipient & Packaging Catalog

All excipients and packaging materials are stored as **raw-material type Products** — no separate table. Identified from SKU name parsing:

### Capsule Shells & Delivery Forms
| SKU pattern | Notes |
|---|---|
| `gelatin-capsule-bovine` | Standard hard cap, non-vegan/halal |
| `softgel-bovine-gelatin` / `soft-gel-capsule-bovine-gelatin` | Softgel form, oil-soluble actives |
| `vegetarian-capsule` | HPMC or pullulan, Tier 3: vegetarian claim |
| `vegan-capsule` / `vegan-capsule-hypromellose` | Explicitly vegan |
| `hypromellose-capsule` | HPMC, usually vegan |
| `oil-fill` | Generic oil fill for softgels — spec unknown without CoA |

### Fillers / Binders
`microcrystalline-cellulose` (6+ companies), `cellulose`, `cellulose-gel`, `dicalcium-phosphate`, `tricalcium-phosphate`, `dibasic-calcium-phosphate-dihydrate`, `starch`, `maltodextrin`, `sorbitol`, `glucose`, `polydextrose`, `tapioca-syrup`

### Disintegrants
`croscarmellose-sodium` (6+ companies), `sodium-starch-glycolate`, `modified-food-starch`

### Flow Agents / Lubricants (largest consolidation opportunity in excipients)
`magnesium-stearate` (13 records), `vegetable-magnesium-stearate` (3 records), `silicon-dioxide` (multiple), `silica` (multiple), `stearic-acid`, `vegetable-stearic-acid`, `talc`, `magnesium-silicate`

### Coating Systems
`polyvinyl-alcohol` (PVA, film coating base), `hydroxypropyl-methylcellulose` (HPMC), `hypromellose`, `polyethylene-glycol` (plasticizer), `carnauba-wax`, `carboxymethylcellulose-sodium`, `non-gmo-corn-zein` (Ritual), `organic-coating`, `pharmaceutical-glaze`, `shellac`

### Colorants
`titanium-dioxide` (EU-banned in food since 2022 — compliance risk for EU-sold products), `red-40-lake`, `blue-2-lake`, `yellow-6-lake`, `fd-and-c-red-no-40-lake`, `fd-and-c-blue-no-2-lake`, `fd-and-c-yellow-no-6-lake`, `coloring-concentrates`, `lycopene` (natural colorant)

### Preservatives / Antioxidants
`BHT` (butylated hydroxytoluene — banned or restricted in some jurisdictions), `sodium-benzoate` (restricted in combination with ascorbic acid — can form benzene), `sorbic-acid`, `ascorbyl-palmitate` (fat-soluble antioxidant), `tocopherols`, `organic-rosemary-extract`

### Sweeteners
`sucralose` (multiple companies), `acesulfame-potassium` (6+ companies), `stevia` variants, `sorbitol`, `erythritol`, `sugar`, `dextrose`, `glucose`, `pure-cane-sugar`, `organic-cane-sugar`, `coconut-sugar`, `monk-fruit-extract`, `tapioca-syrup`

### Gums / Stabilizers / Hydrocolloids
`xanthan-gum` (8 companies), `cellulose-gum` (4 companies), `gum-arabic` / `acacia-gum` (multiple), `carrageenan` (EU scrutiny — potential link to GI inflammation), `gellan-gum`, `inulin` (also a prebiotic fiber), `organic-inulin`, `pectin`, `sodium-alginate`, `potassium-alginate`

### Carrier Oils
`soybean-oil` (5 companies), `sunflower-oil` (3 companies), `medium-chain-triglycerides` (MCT, 4 companies), `safflower-oil`, `olive-oil`, `coconut-mct-oil`, `palm-oil`, `corn-oil`, `blend-of-oils-coconut-and-or-palm-with-beeswax-and-or-carnauba`

### Flavors
`natural-flavor` / `natural-flavors` (~15 companies), `artificial-flavor` (3 companies), `natural-and-artificial-flavors` (4 companies), `natural-strawberry-flavor`, `natural-vanilla-flavor`, `natural-french-vanilla-flavor`, `natural-peach-flavor`, `natural-cherry-flavor`, `natural-tangerine-flavor`, `natural-passionfruit-flavor`, `natural-lemon-lime-flavor`, `orange-flavor`, `organic-flavor`, `organic-vanilla-flavors`

### Specialty / Proprietary Ingredients (non-substitutable)
| Ingredient | Supplier | Notes |
|---|---|---|
| `magnesium-l-threonate-magtein` | Magtein / ThreoTech LLC | Patented (CAS 778571-57-6) — only one supplier globally |
| `aquamin-mg-soluble` | Stauber (distributes Aquamin) | Trademarked marine magnesium from Marigot Ltd |
| `bifidobacterium-lactis-bl-04` | Custom Probiotics / IFF | Specific strain designation — cannot substitute with generic bifidobacterium |
| `omega-3-dha` (Ritual) | Unknown (likely algal) | Premium algae-sourced DHA — product positions as vegan omega-3 |
| `non-gmo-corn-zein` | Colorcon likely | Corn protein coating — proprietary Colorcon product line |
| `collagen-peptides` | Darling Ingredients / Rousselot | Bovine collagen — Rousselot is the dominant global supplier |
| `boron-calcium-fructoborate` | Ritual | Specific mineral form, branded as FruiteX-B likely |
| `organic-food-complex` / `organic-food-complex-blend` | New Chapter (C60) | Branded whole-food nutrient complex |
| `effervescent-base` | BodyTech (C10) | Proprietary blend for tablet effervescence |
| `cultured-nutrients` | New Chapter (C57) | Proprietary fermented nutrient complex |

---

## Normalization Techniques for Ingredient Deduplication

Since SKUs encode ingredient names as free-text slugs, Agnes needs a normalization pipeline:

### Step 1: Parse SKU slug
Strip `RM-C{N}-` prefix and `-{8char_hash}` suffix → extract ingredient name slug.

### Step 2: Normalize slug to canonical name
- Remove word-order variation: `vitamin-d3-cholecalciferol` = `cholecalciferol-vitamin-d3`
- Expand abbreviations: `hcl` → `hydrochloride`, `dl-alpha` → `dl-alpha-tocopherol`
- Strip qualifiers for grouping: `organic-`, `grass-fed-`, `vegetable-` → tag separately, group under base name
- Handle synonyms: `niacinamide` = `nicotinamide`, `ascorbic-acid` = `vitamin-c`, `cholecalciferol` = `vitamin-d3`
- Handle compound names: `vitamin-b6-pyridoxine-hydrochloride` = `pyridoxine-hydrochloride` = `pyridoxine-hcl`

### Step 3: Assign canonical ingredient + form tag
Example output:
```
vitamin-d3-cholecalciferol  →  canonical: vitamin_d3  |  form: cholecalciferol  |  cert: []
organic-stevia-leaf-extract-rebaudioside-a  →  canonical: stevia  |  form: rebaudioside-a  |  cert: [organic]
vegetable-magnesium-stearate  →  canonical: magnesium_stearate  |  form: stearate  |  cert: [vegan]
grass-fed-whey-protein-concentrate  →  canonical: whey_protein_concentrate  |  form: concentrate  |  cert: [grass-fed]
```

### Step 4: CAS lookup (external)
For each canonical+form pair, look up CAS number via PubChem API or ChemSpider → enables exact chemical identity matching across all companies.

---

## Compliance Considerations

### Active Ingredients
- **Vitamin E stereochemistry**: `d-alpha` (natural, CAS 59-02-9) ≠ `dl-alpha` (synthetic, CAS 10191-41-0). Products claiming "natural vitamin E" cannot use synthetic form.
- **Vitamin D2 vs D3**: `vitamin-d` generic label is ambiguous — could be D2 or D3. Products claiming "D3" cannot use D2.
- **Vitamin K1 vs K2**: `phytonadione`/`phylloquinone` (K1) ≠ `menaquinone-7` (MK-7, K2). Many premium products now specifically use MK-7.
- **Methylcobalamin vs cyanocobalamin**: Premium B12 form. Products marketed as "active B12" or "methylated" cannot use cyanocobalamin.

### Excipients — Regulatory Risk
| Ingredient | Risk |
|---|---|
| `titanium-dioxide` (E171) | **Banned in EU food since 2022** — any EU-sold product must reformulate |
| `carrageenan` | EU food scrutiny; degraded carrageenan is a suspected carcinogen |
| `sodium-benzoate` + `ascorbic-acid` in same BOM | Can form benzene — regulatory concern |
| `BHT` | Banned in some jurisdictions; Japan restricts in food |
| `sorbic-acid` | Some EU food category restrictions |
| `artificial colorants` (Red 40, Blue 2, Yellow 6) | EU requires "may have adverse effect on activity and attention in children" warning label |
| `sodium-aluminum-silicate` | Aluminum-based additive under EU review |
| `carnauba-wax` | Generally safe, but animal welfare concern flag for vegan products |

### Packaging / Capsule Compliance
| Material | Constraint |
|---|---|
| `gelatin-capsule-bovine` / `softgel-bovine-gelatin` | Non-halal, non-kosher, non-vegan. Any halal/kosher/vegan labeled product must use HPMC or pullulan alternatives |
| `bovine-collagen-peptides` | Non-vegan, non-halal. Rousselot has specific pork-free lines for halal |
| `carrageenan` | Some vegan consumers avoid it despite being plant-derived |

---

## Aggregate Demand — No Volume Data, Use Proxies

**There are no quantity or volume columns in any table.** Demand must be estimated.

### Method A: BOM Frequency
Count how many finished goods (and how many distinct companies) use a canonical ingredient.
- Within a company: how many of their SKUs contain the ingredient → internal leverage
- Across companies: how many companies independently source it → cross-company consolidation potential
- **Important caveat**: high frequency ≠ guaranteed substitutability. Frequency signals *potential scale*; CAS/form/cert check determines whether it can be acted on.

### Method B: Retailer Tier as Volume Proxy
| Tier | Retailers | Implied volume |
|---|---|---|
| Mass-market | Walmart, Target, Costco, Sam's Club, CVS, Walgreens | High |
| Mid-market | Amazon | Mixed |
| Specialty online | iHerb, Vitacost, Thrive Market | Lower |
| Specialty retail | The Vitamin Shoppe, GNC | Lower |

Walmart/Costco ingredient → much higher implied volume than iHerb/GNC equivalent.

### Method C: BOM Complexity as Proxy
48-ingredient Equate multivitamin (Walmart) → high production volume per ingredient. 2-ingredient magnesium glycinate (Wellmade, Thrive Market) → lower volume.

### Consolidation Signal Example
> "15 companies all source some form of `magnesium-stearate` from potentially 15 separate supplier relationships. Agnes recommends consolidating to **Prinova USA + Colorcon** (already supply 11 of those 15, and both also supply `vegetable-magnesium-stearate` for vegan-certified products). Estimated friction: low. Compliance check: Tier 3 — verify Colorcon vegetable grade certification for 3 companies with vegan label claims."

Demand aggregation = count(companies) × count(BOMs), weighted by retailer tier.

### Top Consolidation Targets by Canonical Ingredient Frequency

| Canonical Ingredient | Type | Approx SKU variants | Approx companies | Notes |
|---|---|---|---|---|
| magnesium (all forms) | active | 48 | ~30 | Split into non-interchangeable form clusters first |
| vitamin-d3 / cholecalciferol | active | 36 | ~25 | ~32 are CAS 67-97-0; ~4 ambiguous `vitamin-d` |
| potassium (all forms) | active/electrolyte | 37 | ~25 | Many non-interchangeable forms |
| vitamin-c / ascorbic-acid | active | 25 | ~20 | Ascorbyl-palmitate is different function |
| zinc (all forms) | active | 21 | ~15 | Form matters for bioavailability claims |
| magnesium-stearate | excipient | 15 | ~13 | Safest consolidation — commodity excipient |
| xanthan-gum | excipient | 8 | 8 | Commodity stabilizer |
| croscarmellose-sodium | excipient | 6+ | ~6 | Commodity disintegrant |
| stevia / rebaudioside-a | sweetener | 10+ | ~10 | Organic vs. conventional split |
| whey-protein-concentrate/isolate | protein | 15 | ~10 | Grass-fed / organic variants are Tier 3 |

---

## Graph Analysis — Strongly Recommended

The data is a **tripartite graph**: Company → FinishedGood → Ingredient ← Supplier

Key graph-derived insights not achievable with SQL alone:
- **Supplier reach overlap**: Cargill serves 33 companies; ADM serves 25; Colorcon and Ashland each serve 25–27. Any ingredient covered by these four is a near-frictionless consolidation target.
- **Strongest consolidation clusters**: The Vitamin Shoppe + Vitacost (15 shared suppliers), Equate + One A Day (14), Nature Made + up&up (14) → natural consolidation groups.
- **Community detection**: cluster companies by shared BOM ingredient profiles → reveals formulation families (multivitamin cluster, electrolyte cluster, protein powder cluster, vitamin D single-ingredient cluster).
- **Ingredient co-occurrence**: magnesium-stearate + silicon-dioxide + microcrystalline-cellulose + croscarmellose-sodium always appear together → "tablet excipient bundle" → bundle-level consolidation rather than per-ingredient.
- **Canonical ingredient nodes**: build a node for the canonical ingredient connecting all company-specific RM variants → demand aggregation becomes trivial.

---

## Slide Deck Notes (from Spherecast presentation)

- **Scope explicitly includes**: ingredients, packaging, labels, and filling materials (not just active ingredients)
- **External enrichment is expected**: scraping supplier websites, certification databases, regulatory references — explicitly stated as "likely needed for strong results"
- **Omega-3 example from slides**: algae-based/vegan DHA/EPA/ALA (Sunday Natural) vs. standard fish oil (ESN) vs. wild-caught Alaskan non-GMO fish oil (Sports Research) — same category, three completely different sourcing constraint profiles. This is the archetypal substitution-compliance tension.
- **Judging priorities**: reasoning quality, evidence trails, trustworthiness/low hallucination, substitution logic soundness — **UI polish is explicitly not a priority**
- **Spherecast's own vision**: "from single node to network" — Brand ↔ Manufacturer ↔ Supplier graph validates graph-first approach
- **Contact**: leon@spherecast.ai (Founding LLM Engineer, San Francisco)
