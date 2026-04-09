"""
Agnes Enrichment Schema — flat Pydantic model for per-(ingredient, supplier) enrichment results.

Atomic unit: one record = one (ingredient_slug, sup_id) pair.
ingredient_slug is derived from the RM SKU by stripping the company prefix (RM-C{N}-)
and the hash suffix (-{8hex}). This deduplicates across companies using the same ingredient.

Same ingredient from two suppliers → two records.
Same ingredient used by N companies → still two records (rm_ids captures all company rm_ids).

Design principles:
  - Criteria are direct top-level fields (verdict strings), not a results[] array
  - One shared refs[] for all source URLs instead of per-criterion evidence
  - No per-criterion confidence (speeds up pipeline)
  - verify[] lists criterion keys needing human review
  - discovered[] for suppliers found during scraping, not yet in DB
"""

from pydantic import BaseModel
from typing import Optional


class DiscoveredSupplier(BaseModel):
    name: str
    url: Optional[str] = None
    product_url: Optional[str] = None
    country: Optional[str] = None          # ISO 3166 e.g. "US", "DE"
    region: Optional[str] = None           # north_america|europe|asia|other
    certifications: list[str] = []
    notes: Optional[str] = None


class Ref(BaseModel):
    url: Optional[str] = None
    type: str                               # web_search|playwright|db|kb
    note: str                               # human-readable: what this URL supports


class EnrichmentRecord(BaseModel):
    # ── Identity ──────────────────────────────────────────────────────────────
    id: str                                 # "{ingredient_slug}__{sup_id}__{YYYYMMDD}"
    ingredient_slug: str                    # e.g. "vitamin-d3-cholecalciferol"
    rm_ids: list[int]                       # all Product.Id values for this ingredient (across companies)
    sup_id: int                             # Supplier.Id in SQLite
    sup_name: str
    sup_url: Optional[str] = None           # supplier homepage
    sup_product_url: Optional[str] = None   # supplier's page for this RM
    sup_spec_url: Optional[str] = None      # CoA / TDS PDF
    country: Optional[str] = None          # supplier country ISO 3166
    region: Optional[str] = None           # north_america|europe|asia|other

    # ── Pricing ────────────────────────────────���──────────────────────────────
    price: Optional[str] = None            # "$35/kg MOQ:25kg" or "not_listed"
    price_per_unit: Optional[float] = None
    price_unit: Optional[str] = None       # "kg"|"lb"|"g"
    price_moq: Optional[str] = None        # "25 kg"
    price_date: Optional[str] = None       # ISO date

    # ── FG traceability (all FG SKUs across all companies using this ingredient)
    fg_skus: list[str] = []

    # ── Criteria (direct verdict strings) ────────────────────────────────────
    # Required — always populate (use "unknown" if not found)
    cas_number: Optional[str] = None
    canonical_name: Optional[str] = None
    functional_role: Optional[str] = None  # active|excipient|processing_aid|unknown
    patent_lock: Optional[str] = None      # yes|no|uncertain|unknown
    single_manufacturer: Optional[str] = None  # yes|no|unknown
    market_ban_eu: Optional[str] = None    # permitted|banned|restricted|unknown
    market_ban_us: Optional[str] = None
    vegan_status: Optional[str] = None     # yes|no|uncertain|unknown
    vegetarian_status: Optional[str] = None
    halal_status: Optional[str] = None     # certified|compliant|non_compliant|unknown
    kosher_status: Optional[str] = None
    non_gmo_status: Optional[str] = None   # certified|standard|gmo|unknown
    organic_status: Optional[str] = None   # certified|conventional|unknown
    allergen_flags: Optional[list] = None  # [] or ["soy","milk"]
    label_form_claim: Optional[str] = None # from FG supplement facts panel
    health_claim_form: Optional[str] = None  # branded form claim or "none"

    # Optional — only include when applicable
    salt_ester_form: Optional[str] = None
    dose_conversion_factor: Optional[str] = None  # elemental % as decimal string
    stereoisomer_form: Optional[str] = None       # d|dl|l|racemic
    strain_designation: Optional[str] = None      # probiotic strain code
    bioequivalence: Optional[str] = None

    # ── Human review flags ────────────────────────────────────────────────────
    verify: list[str] = []                 # criterion keys needing verification

    # ── Discovered suppliers (not in DB) ─────────────────────────────────────
    discovered: list[DiscoveredSupplier] = []

    # ── References (shared across all criteria) ───────────────────────────────
    refs: list[Ref] = []

    # ── Metadata ──────────────────────────────────────────────────────────────
    enriched_at: str
    pipeline_version: str = "1.0"
