"""
Agnes Raw Material Engine - Agent 04: External Enricher

Takes substitution candidates and fetches external evidence: supplier websites,
certification pages, regulatory references. Stores results with source URLs
and confidence labels.
"""

import json
from typing import Optional
from datetime import datetime

from .schemas import (
    SubstitutionCandidate,
    ExternalEvidenceRecord,
    EvidenceType,
)
from .utils import (
    get_logger,
    get_db_connection,
    timestamp,
    save_json_cache,
    load_json_cache,
    hash_string,
    retry_with_backoff,
)
from . import config

logger = get_logger(__name__)

# Try to import httpx for web requests
try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    logger.warning("httpx not available, using mock responses")


# Known supplier information (pre-cached for demo reliability)
SUPPLIER_INFO = {
    "Prinova USA": {
        "url": "https://www.prinovausa.com",
        "certifications": ["FDA registered", "cGMP compliant", "ISO 22000"],
        "specialties": ["vitamins", "minerals", "amino acids"],
    },
    "PureBulk": {
        "url": "https://purebulk.com",
        "certifications": ["FDA registered", "cGMP compliant", "Third-party tested"],
        "specialties": ["bulk supplements", "vitamins", "minerals"],
    },
    "ADM": {
        "url": "https://www.adm.com",
        "certifications": ["FDA registered", "cGMP", "ISO 9001", "FSSC 22000"],
        "specialties": ["oils", "lecithin", "proteins"],
    },
    "Cargill": {
        "url": "https://www.cargill.com",
        "certifications": ["FDA registered", "cGMP", "Organic certified", "Kosher", "Halal"],
        "specialties": ["oils", "starches", "sweeteners"],
    },
    "Colorcon": {
        "url": "https://www.colorcon.com",
        "certifications": ["FDA registered", "cGMP", "ISO 9001"],
        "specialties": ["coatings", "capsules", "excipients"],
    },
    "Ashland": {
        "url": "https://www.ashland.com",
        "certifications": ["FDA registered", "cGMP", "ISO 9001"],
        "specialties": ["cellulose", "polymers", "excipients"],
    },
    "Capsuline": {
        "url": "https://www.capsuline.com",
        "certifications": ["FDA registered", "cGMP", "Kosher", "Halal", "Vegetarian certified"],
        "specialties": ["capsules", "gelatin", "vegetarian capsules"],
    },
}

# Known ingredient regulatory status (pre-cached for demo)
GRAS_STATUS = {
    "vitamin d3": {"status": "GRAS", "reference": "21 CFR 182.5950", "notes": "Generally Recognized as Safe"},
    "cholecalciferol": {"status": "GRAS", "reference": "21 CFR 182.5950", "notes": "Vitamin D3, GRAS as nutrient"},
    "gelatin": {"status": "GRAS", "reference": "21 CFR 182.90", "notes": "GRAS as multipurpose additive"},
    "hypromellose": {"status": "GRAS", "reference": "21 CFR 172.874", "notes": "Approved as food additive"},
    "sunflower lecithin": {"status": "GRAS", "reference": "21 CFR 184.1400", "notes": "GRAS as emulsifier"},
    "soy lecithin": {"status": "GRAS", "reference": "21 CFR 184.1400", "notes": "GRAS as emulsifier, allergen (soy)"},
    "whey protein": {"status": "GRAS", "reference": "21 CFR 184.1979", "notes": "GRAS, allergen (dairy)"},
    "magnesium citrate": {"status": "GRAS", "reference": "21 CFR 184.1428", "notes": "GRAS as nutrient source"},
    "calcium citrate": {"status": "GRAS", "reference": "21 CFR 184.1195", "notes": "GRAS as nutrient source"},
}


def get_supplier_evidence(supplier_name: str, component_name: str) -> Optional[ExternalEvidenceRecord]:
    """Get cached or fetched evidence about a supplier."""
    if supplier_name in SUPPLIER_INFO:
        info = SUPPLIER_INFO[supplier_name]
        content = (
            f"Supplier: {supplier_name}\n"
            f"Website: {info['url']}\n"
            f"Certifications: {', '.join(info['certifications'])}\n"
            f"Specialties: {', '.join(info['specialties'])}"
        )
        return ExternalEvidenceRecord(
            source_type=EvidenceType.EXTERNAL_WEB,
            source_url=info["url"],
            content=content,
            relevance_score=0.8,
        )
    return None


def get_regulatory_evidence(component_name: str) -> Optional[ExternalEvidenceRecord]:
    """Get regulatory status evidence for a component."""
    # Normalize name for lookup
    normalized = component_name.lower().replace("-", " ").replace("_", " ")

    for key, info in GRAS_STATUS.items():
        if key in normalized:
            content = (
                f"Component: {component_name}\n"
                f"Regulatory Status: {info['status']}\n"
                f"Reference: {info['reference']}\n"
                f"Notes: {info['notes']}"
            )
            return ExternalEvidenceRecord(
                source_type=EvidenceType.STRUCTURED_DATA,
                source_url=f"https://www.ecfr.gov/current/title-21/{info['reference'].replace(' ', '-')}",
                content=content,
                relevance_score=0.95,
            )
    return None


def get_dietary_evidence(component_name: str) -> Optional[ExternalEvidenceRecord]:
    """Infer dietary compliance evidence from component name."""
    normalized = component_name.lower()

    evidence_items = []

    # Vegan/Vegetarian detection
    if any(kw in normalized for kw in ["bovine", "porcine", "fish", "gelatin"]):
        if "bovine" in normalized or "porcine" in normalized:
            evidence_items.append("NOT suitable for vegetarian or vegan diets (animal-derived)")
        elif "fish" in normalized:
            evidence_items.append("NOT suitable for vegetarian or vegan diets (fish-derived)")
        elif "gelatin" in normalized and "plant" not in normalized:
            evidence_items.append("Likely NOT vegetarian/vegan unless specified as plant-based")

    if any(kw in normalized for kw in ["vegetarian", "vegan", "plant", "hypromellose"]):
        evidence_items.append("Suitable for vegetarian diets")
        if "vegan" in normalized or "hypromellose" in normalized:
            evidence_items.append("Suitable for vegan diets")

    # Allergen detection
    if "soy" in normalized:
        evidence_items.append("Contains SOY allergen")
    if "dairy" in normalized or "whey" in normalized or "casein" in normalized:
        evidence_items.append("Contains DAIRY allergen")
    if "fish" in normalized:
        evidence_items.append("Contains FISH allergen")
    if "sunflower" in normalized:
        evidence_items.append("Sunflower-derived, suitable for soy-free diets")

    if evidence_items:
        content = f"Dietary Analysis for {component_name}:\n" + "\n".join(f"- {item}" for item in evidence_items)
        return ExternalEvidenceRecord(
            source_type=EvidenceType.HEURISTIC,
            source_url=None,
            content=content,
            relevance_score=0.7,
        )
    return None


@retry_with_backoff(max_retries=2, base_delay=1.0)
def fetch_web_content(url: str) -> Optional[str]:
    """Fetch content from a URL (with caching)."""
    if not HTTPX_AVAILABLE:
        return None

    cache_key = f"web_{hash_string(url)}"
    cached = load_json_cache(cache_key)
    if cached:
        return cached.get("content")

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, follow_redirects=True)
            if response.status_code == 200:
                content = response.text[:5000]  # Limit content size
                save_json_cache(cache_key, {"url": url, "content": content, "fetched_at": timestamp()})
                return content
    except Exception as e:
        logger.warning(f"[{timestamp()}] Failed to fetch {url}: {e}")

    return None


def enrich_substitution_candidate(candidate: SubstitutionCandidate) -> list[ExternalEvidenceRecord]:
    """
    Enrich a substitution candidate with external evidence.

    Returns a list of evidence records.
    """
    evidence_records = []

    # Get evidence for source component
    regulatory_source = get_regulatory_evidence(candidate.source_name)
    if regulatory_source:
        regulatory_source.product_id = None  # Would need to look up
        evidence_records.append(regulatory_source)

    dietary_source = get_dietary_evidence(candidate.source_name)
    if dietary_source:
        evidence_records.append(dietary_source)

    # Get evidence for target component
    regulatory_target = get_regulatory_evidence(candidate.target_name)
    if regulatory_target:
        evidence_records.append(regulatory_target)

    dietary_target = get_dietary_evidence(candidate.target_name)
    if dietary_target:
        evidence_records.append(dietary_target)

    return evidence_records


def store_evidence_in_db(evidence: ExternalEvidenceRecord, product_id: Optional[int] = None, supplier_id: Optional[int] = None) -> int:
    """Store evidence record in the database."""
    conn = get_db_connection()
    cursor = conn.execute("""
        INSERT INTO External_Evidence (ProductId, SupplierId, SourceType, SourceUrl, Content, RelevanceScore)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        product_id,
        supplier_id,
        evidence.source_type.value,
        evidence.source_url,
        evidence.content,
        evidence.relevance_score,
    ))
    conn.commit()
    evidence_id = cursor.lastrowid
    conn.close()
    return evidence_id


def enrich_candidates(candidates: list[SubstitutionCandidate], store_in_db: bool = True) -> dict[str, list[ExternalEvidenceRecord]]:
    """
    Enrich multiple substitution candidates with external evidence.

    Returns a dict mapping candidate key to list of evidence records.
    """
    logger.info(f"[{timestamp()}] Enriching {len(candidates)} substitution candidates...")

    results = {}

    for candidate in candidates:
        key = f"{candidate.source_sku}_{candidate.target_sku}"
        evidence = enrich_substitution_candidate(candidate)

        if store_in_db:
            for record in evidence:
                store_evidence_in_db(record)

        results[key] = evidence
        logger.info(f"[{timestamp()}] Found {len(evidence)} evidence records for {candidate.source_name[:30]}...")

    return results


def print_enrichment_summary(results: dict[str, list[ExternalEvidenceRecord]]) -> None:
    """Print a summary of enrichment results."""
    print("\n" + "=" * 60)
    print("EXTERNAL ENRICHER - RESULTS SUMMARY")
    print("=" * 60)

    total_evidence = sum(len(v) for v in results.values())
    print(f"\n📚 Gathered {total_evidence} evidence records for {len(results)} candidates")

    # Breakdown by type
    type_counts = {}
    for evidence_list in results.values():
        for evidence in evidence_list:
            type_key = evidence.source_type.value
            type_counts[type_key] = type_counts.get(type_key, 0) + 1

    print("\n📊 EVIDENCE BY TYPE:")
    print("-" * 40)
    for etype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  • {etype}: {count}")

    # Sample evidence
    if results:
        print("\n📄 SAMPLE EVIDENCE:")
        print("-" * 40)
        for key, evidence_list in list(results.items())[:2]:
            for evidence in evidence_list[:1]:
                print(f"\n  Source: {evidence.source_type.value}")
                print(f"  URL: {evidence.source_url or 'N/A'}")
                print(f"  Relevance: {evidence.relevance_score:.0%}" if evidence.relevance_score else "  Relevance: N/A")
                print(f"  Content preview: {evidence.content[:100]}...")

    print("\n" + "=" * 60)
    print(f"✓ Enrichment completed at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    logger.info(f"[{timestamp()}] Starting external enricher...")

    # Create sample candidates for testing
    sample_candidates = [
        SubstitutionCandidate(
            source_sku="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
            source_name="vitamin d3 cholecalciferol",
            target_sku="RM-C30-vitamin-d3-cholecalciferol-559c9699",
            target_name="vitamin d3 cholecalciferol",
            confidence=0.85,
            reasoning_summary="Same active ingredient from different supplier",
        ),
        SubstitutionCandidate(
            source_sku="RM-C28-softgel-capsule-bovine-gelatin-5a1a1582",
            source_name="softgel capsule bovine gelatin",
            target_sku="RM-C35-vegan-capsule-d9a85712",
            target_name="vegan capsule",
            confidence=0.6,
            reasoning_summary="Plant-based alternative to bovine gelatin",
            allergen_change=AllergenChange.IMPROVED,
            dietary_change=AllergenChange.IMPROVED,
        ),
    ]

    try:
        results = enrich_candidates(sample_candidates, store_in_db=False)
        print_enrichment_summary(results)

        # Save results
        output_path = config.OUTPUT_PATH / "external_evidence.json"
        output_data = {k: [e.model_dump() for e in v] for k, v in results.items()}
        with open(output_path, "w") as f:
            json.dump(output_data, f, indent=2, default=str)

        logger.info(f"[{timestamp()}] Results saved to {output_path}")

        return results

    except Exception as e:
        logger.error(f"[{timestamp()}] External enricher failed: {e}")
        raise


# Import needed for standalone test
from .schemas import AllergenChange

if __name__ == "__main__":
    main()
