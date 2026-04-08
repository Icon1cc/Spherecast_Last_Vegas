# 24-Hour Execution Plan

## Strategy

**Core Framing**: Build an AI-powered "Substitution Intelligence Engine" that transforms sparse BOM data into actionable sourcing recommendations with full evidence trails.

**Why This Wins**:
1. Directly addresses the hardest judging criteria (reasoning, evidence, trustworthiness)
2. Shows clear business value (supplier consolidation, compliance risk reduction)
3. Demonstrates sophisticated AI use (RAG, structured reasoning, confidence scoring)
4. Handles uncertainty gracefully (the differentiator from mediocre solutions)

---

## Hour-by-Hour Timeline

### Phase 1: Foundation (Hours 0-4)

| Hour | Person A | Person B | Person C |
|------|----------|----------|----------|
| 0-1 | Set up Python environment, install deps | Load SQLite DB, validate schema | Set up LLM API keys, test basic calls |
| 1-2 | Write data_loader agent | Write bom_analyzer agent | Design structured output schemas |
| 2-3 | Test data loading pipeline | Implement component clustering | Write prompt templates for substitution |
| 3-4 | Build component normalization logic | Test BOM analysis on 3 examples | Set up vector store (ChromaDB) |

**Phase 1 Exit Criteria**:
- [ ] Database loaded and queryable
- [ ] BOM analyzer identifies component groups
- [ ] LLM calls working with structured output
- [ ] ChromaDB initialized

### Phase 2: Intelligence Layer (Hours 4-10)

| Hour | Person A | Person B | Person C |
|------|----------|----------|----------|
| 4-5 | Substitution detector: LLM prompt | External enricher: supplier website scraping | Compliance checker: design reasoning schema |
| 5-6 | Substitution detector: structured output | External enricher: regulatory data sources | Compliance checker: implement prompt |
| 6-7 | Test substitution logic on vitamin examples | Build evidence storage layer | Test compliance on gelatin substitution |
| 7-8 | Refine substitution confidence scoring | Implement source citation | Add uncertainty flags |
| 8-9 | Integration: substitution → enrichment | Cache external data for demo | Integration: enrichment → compliance |
| 9-10 | End-to-end test: vitamins | End-to-end test: proteins | End-to-end test: capsules |

**Phase 2 Exit Criteria**:
- [ ] Substitution detector produces candidates with confidence
- [ ] External enricher retrieves and cites sources
- [ ] Compliance checker produces verdicts with evidence
- [ ] Three component categories fully working

### Phase 3: Recommendation Engine (Hours 10-14)

| Hour | Person A | Person B | Person C |
|------|----------|----------|----------|
| 10-11 | Recommendation scoring function | Report generator: markdown output | Pipeline orchestration |
| 11-12 | Supplier consolidation logic | Report generator: JSON export | Error handling and logging |
| 12-13 | Cost inference heuristics | Build summary view | Add caching layer |
| 13-14 | Integration testing | Demo scenario preparation | Fix bugs from integration |

**Phase 3 Exit Criteria**:
- [ ] Recommendation engine produces ranked options
- [ ] Reports are human-readable with evidence
- [ ] Full pipeline runs end-to-end
- [ ] Demo scenario works reliably

### Phase 4: Hardening & Demo (Hours 14-20)

| Hour | Person A | Person B | Person C |
|------|----------|----------|----------|
| 14-15 | Run pipeline on all 149 BOMs | Identify edge cases | Fix failures |
| 15-16 | Tune confidence thresholds | Add "needs review" flags | Performance optimization |
| 16-17 | Prepare demo script | Create sample outputs | Write evaluation doc |
| 17-18 | Demo dry run #1 | Fix issues found | Update docs |
| 18-19 | Demo dry run #2 | Prepare backup scenarios | Final testing |
| 19-20 | Buffer for unexpected issues | Buffer | Buffer |

**Phase 4 Exit Criteria**:
- [ ] Demo runs smoothly 3 times in a row
- [ ] Backup scenarios prepared
- [ ] All documentation complete

### Phase 5: Presentation (Hours 20-24)

| Hour | Person A | Person B | Person C |
|------|----------|----------|----------|
| 20-21 | Build presentation slides | Record demo video (backup) | Prepare Q&A answers |
| 21-22 | Rehearse presentation | Refine slides | Final code cleanup |
| 22-23 | Full rehearsal with demo | Time optimization | Rest/prepare |
| 23-24 | Final prep and submission | Submission | Submission |

---

## What to Build vs What to Fake

### MUST BUILD (Core Judging Criteria)
| Component | Why |
|-----------|-----|
| Substitution detection logic | Core challenge |
| Compliance reasoning with evidence | Top judging criterion |
| Confidence scoring | Trust/hallucination control |
| Source citation | Evidence trails |
| Structured JSON outputs | Explainability |
| Pipeline that runs end-to-end | Demo must work |

### CAN FAKE/SIMPLIFY
| Component | How to Fake | Why It's OK |
|-----------|-------------|-------------|
| Real-time pricing | Use placeholder costs or "estimated" | Not in data, judges know this |
| Live supplier scraping | Pre-cache 10-20 supplier pages | Demo reliability > dynamism |
| Full regulatory database | Hardcode GRAS status for common ingredients | Show the pattern, not exhaustive coverage |
| Lead time data | Use heuristics (domestic=2wks, intl=6wks) | Reasonable assumptions |
| UI | Terminal output + markdown reports | Explicitly not judged |
| All 876 raw materials | Focus on 3-4 categories deeply | Quality > quantity |

### DO NOT FAKE
| Component | Why |
|-----------|-----|
| LLM reasoning | This is the core value proposition |
| Evidence citations | Must be real and verifiable |
| Confidence scores | Must reflect actual uncertainty |
| "I don't know" responses | Must refuse when evidence is insufficient |

---

## Prioritization Matrix

| Feature | Impact on Judging | Build Time | Priority |
|---------|------------------|------------|----------|
| Substitution detection with confidence | HIGH | 4h | P0 |
| Compliance reasoning with evidence | HIGH | 4h | P0 |
| Source citation (web/db) | HIGH | 3h | P0 |
| Structured output schemas | HIGH | 2h | P0 |
| Uncertainty handling ("needs review") | HIGH | 2h | P0 |
| Recommendation scoring | MEDIUM | 3h | P1 |
| Supplier consolidation logic | MEDIUM | 2h | P1 |
| End-to-end pipeline | MEDIUM | 2h | P1 |
| Markdown report generation | MEDIUM | 2h | P1 |
| External data caching | LOW | 2h | P2 |
| Multiple BOM analysis | LOW | 2h | P2 |
| Cost estimation heuristics | LOW | 1h | P2 |
| UI/visualization | NONE | - | Skip |

---

## External Data Strategy

### Tier 1: Pre-Cache Before Hackathon (if allowed)
- Supplier specification sheets for top 10 suppliers
- FDA GRAS database export for common ingredients
- Certification body lists (NSF, USP, organic certifiers)

### Tier 2: Live During Hackathon
| Source | Data | Method |
|--------|------|--------|
| Supplier websites | Certifications, specs | Web scraping with caching |
| FDA GRAS notices | Safety status | API query |
| PubChem | Chemical properties | API query |
| Wikipedia | Background info | WebFetch |

### Tier 3: Fallback When Missing
- Return "unknown - verification required"
- Note which specific data would resolve uncertainty
- Never hallucinate compliance claims

### Storage
```
external_data/
├── suppliers/          # Cached supplier pages
├── regulatory/         # FDA data
├── certifications/     # Cert body lookups
└── embeddings.db       # ChromaDB vector store
```

---

## Risk Mitigation

### Risk 1: LLM API Rate Limits or Downtime
**Probability**: Medium
**Impact**: Critical
**Mitigation**:
- Cache all LLM responses
- Prepare offline demo with pre-generated outputs
- Have backup API keys for different providers
- Build pipeline to retry with exponential backoff

### Risk 2: External Data Sources Unavailable
**Probability**: Medium
**Impact**: High
**Mitigation**:
- Pre-cache demo scenario data
- Design system to degrade gracefully ("external data unavailable")
- Have 3 demo scenarios with cached data

### Risk 3: Substitution Logic Produces Bad Results
**Probability**: Medium
**Impact**: High
**Mitigation**:
- Conservative confidence thresholds (flag anything < 0.7)
- Test extensively on known-good examples
- Build "veto" list for obviously wrong substitutions
- Show "needs human review" rather than bad recommendation

---

## Demo Script Outline

### Setup (30 seconds)
"Agnes is an AI Supply Chain Manager. Today we're showing how she helps procurement teams make smarter raw material sourcing decisions."

### Demo Flow (7-8 minutes)

**Scene 1: The Problem (1 min)**
- Show a multivitamin BOM with 17 components
- "Which of these can be sourced from alternative suppliers? Which substitutions maintain compliance?"

**Scene 2: Component Analysis (1.5 min)**
- Run BOM analyzer
- Show component clustering (vitamins, capsules, excipients)
- "Agnes identifies 3 substitution opportunities"

**Scene 3: Deep Dive - Gelatin Substitution (2 min)**
- Current: bovine gelatin softgel
- Options: vegetarian capsule, vegan hypromellose
- Show compliance reasoning:
  - "Bovine gelatin is not suitable for vegetarian/vegan consumers"
  - "Hypromellose is plant-derived, kosher, halal certified"
  - Sources: [Supplier spec sheet], [FDA GRAS notice]
- Confidence: 0.85
- Tradeoffs: "Higher cost (+15%), different dissolution profile"

**Scene 4: Supplier Consolidation (1.5 min)**
- "Current BOM uses 7 suppliers"
- "Agnes recommends consolidating to 4 suppliers"
- Show which components can move to existing suppliers
- Evidence: supplier catalogs showing they carry both products

**Scene 5: Final Recommendation (1 min)**
- Structured JSON output
- Human-readable report
- Clear action items with evidence links

**Scene 6: Uncertainty Handling (1 min)**
- Show example where data is insufficient
- "Agnes flags this for human review rather than guessing"
- "Missing: organic certification verification for Component X"

### Q&A Prep Topics
- Why these confidence thresholds?
- How would this scale to 1000 BOMs?
- What about real-time pricing integration?
- How do you prevent hallucinations?
- What's the human-in-the-loop workflow?

---

## Success Metrics for Demo

| Metric | Target |
|--------|--------|
| Pipeline runs without errors | 100% |
| Substitutions are plausible | 100% |
| Evidence citations are real | 100% |
| Confidence scores correlate with quality | Subjective |
| "I don't know" appears when appropriate | At least 1 example |
| Total demo time | < 10 minutes |
| Recovery from unexpected state | < 30 seconds |
