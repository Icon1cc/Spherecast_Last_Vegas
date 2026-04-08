"""
Agnes Raw Material Engine - Agent 03: Substitution Detector

For each component group, queries an LLM to identify which components are
functionally interchangeable. Uses structured output. Writes substitution
candidates with confidence scores.
"""

import json
from typing import Optional

from .schemas import (
    BOMAnalysisResult,
    ComponentGroup,
    SubstitutionCandidate,
    SubstitutionDetectionResult,
    AllergenChange,
    StandardizedReasoning,
    Evidence,
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

# Try to import anthropic, fall back to mock for testing
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("Anthropic SDK not available, using mock responses")


SUBSTITUTION_SYSTEM_PROMPT = """You are an expert supply chain analyst specializing in dietary supplements and nutraceuticals. Your task is to identify functionally interchangeable raw materials.

RULES:
1. Only suggest substitutes with the SAME functional purpose
2. Consider form factors (softgel vs tablet vs powder may not be interchangeable)
3. Consider allergens (soy lecithin is NOT interchangeable with sunflower lecithin for allergen-free products, but sunflower CAN replace soy)
4. Consider dietary restrictions (bovine gelatin is NOT interchangeable with vegetarian options for vegetarian products, but vegetarian CAN replace bovine)
5. If uncertain, set confidence LOW and explain why
6. Be conservative - false negatives are better than false positives in compliance contexts

OUTPUT: Return valid JSON only, no markdown or explanation."""


def get_cross_company_substitutes(conn, category: str, sub_category: Optional[str], exclude_ids: list[int]) -> list[dict]:
    """Find potential substitutes from other companies in the same category."""
    query = """
        SELECT DISTINCT
            p.Id as product_id,
            p.SKU as sku,
            c.Name as company,
            GROUP_CONCAT(DISTINCT s.Name) as suppliers
        FROM Product p
        JOIN Company c ON p.CompanyId = c.Id
        LEFT JOIN Supplier_Product sp ON p.Id = sp.ProductId
        LEFT JOIN Supplier s ON sp.SupplierId = s.Id
        WHERE p.Type = 'raw-material'
        AND p.Id NOT IN ({})
        AND p.SKU LIKE ?
        GROUP BY p.Id
        LIMIT 20
    """.format(",".join("?" * len(exclude_ids)))

    # Build pattern based on category
    if sub_category:
        pattern = f"%{sub_category.replace('_', '%')}%"
    else:
        pattern = f"%{category}%"

    params = exclude_ids + [pattern]
    cursor = conn.execute(query, params)

    return [
        {
            "product_id": row["product_id"],
            "sku": row["sku"],
            "company": row["company"],
            "suppliers": row["suppliers"].split(",") if row["suppliers"] else [],
        }
        for row in cursor.fetchall()
    ]


def build_substitution_prompt(group: ComponentGroup, potential_substitutes: list[dict]) -> str:
    """Build the prompt for substitution detection."""
    components_text = "\n".join([
        f"- SKU: {c.sku}\n  Name: {c.normalized_name}\n  Suppliers: {', '.join(c.suppliers) or 'Unknown'}"
        for c in group.components
    ])

    substitutes_text = "\n".join([
        f"- SKU: {s['sku']}\n  Company: {s['company']}\n  Suppliers: {', '.join(s['suppliers']) or 'Unknown'}"
        for s in potential_substitutes
    ])

    return f"""Analyze substitution options for the following component group.

CURRENT COMPONENTS (Category: {group.category}, Sub-category: {group.sub_category or 'N/A'}):
{components_text}

POTENTIAL SUBSTITUTES FROM OTHER SOURCES:
{substitutes_text}

For each current component, identify which potential substitutes could replace it.

Return JSON in this exact format:
{{
    "substitution_candidates": [
        {{
            "source_sku": "<current component SKU>",
            "source_name": "<current component name>",
            "target_sku": "<substitute SKU>",
            "target_name": "<substitute name>",
            "confidence": <0.0-1.0>,
            "reasoning_summary": "<1-2 sentence explanation>",
            "functional_match": true/false,
            "form_compatible": true/false,
            "allergen_change": "none"/"improved"/"worsened",
            "dietary_change": "none"/"improved"/"worsened",
            "risks": ["<risk 1>", ...],
            "assumptions": ["<assumption 1>", ...]
        }}
    ],
    "no_substitutes_reason": "<if no candidates found, explain why, otherwise null>"
}}"""


@retry_with_backoff(max_retries=3, base_delay=2.0)
def call_llm_for_substitution(prompt: str) -> dict:
    """Call the LLM for substitution analysis."""
    if not ANTHROPIC_AVAILABLE or not config.ANTHROPIC_API_KEY:
        logger.info(f"[{timestamp()}] Using mock LLM response (no API key)")
        return generate_mock_substitution_response()

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

    response = client.messages.create(
        model=config.LLM_MODEL,
        max_tokens=4096,
        system=SUBSTITUTION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    # Parse JSON from response
    content = response.content[0].text

    # Handle potential markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]

    return json.loads(content)


def generate_mock_substitution_response() -> dict:
    """Generate a mock response for testing without API keys."""
    return {
        "substitution_candidates": [
            {
                "source_sku": "RM-C28-vitamin-d3-cholecalciferol-8956b79c",
                "source_name": "vitamin d3 cholecalciferol",
                "target_sku": "RM-C30-vitamin-d3-cholecalciferol-559c9699",
                "target_name": "vitamin d3 cholecalciferol",
                "confidence": 0.85,
                "reasoning_summary": "Same active ingredient (cholecalciferol) from different supplier. Functionally equivalent.",
                "functional_match": True,
                "form_compatible": True,
                "allergen_change": "none",
                "dietary_change": "none",
                "risks": ["Verify potency/concentration matches"],
                "assumptions": ["Same form factor assumed", "Similar purity levels assumed"],
            }
        ],
        "no_substitutes_reason": None,
    }


def detect_substitutions_for_group(
    group: ComponentGroup,
    bom_id: int,
    use_cache: bool = True,
) -> SubstitutionDetectionResult:
    """Detect substitution candidates for a component group."""
    cache_key = f"substitution_{bom_id}_{group.group_id}"

    if use_cache:
        cached = load_json_cache(cache_key)
        if cached:
            logger.info(f"[{timestamp()}] Using cached substitution for group {group.group_id}")
            return SubstitutionDetectionResult(**cached)

    logger.info(f"[{timestamp()}] Detecting substitutions for group {group.category}:{group.sub_category}")

    # Get potential substitutes from database
    conn = get_db_connection()
    exclude_ids = [c.product_id for c in group.components]
    potential_substitutes = get_cross_company_substitutes(
        conn, group.category, group.sub_category, exclude_ids
    )
    conn.close()

    if not potential_substitutes:
        logger.info(f"[{timestamp()}] No potential substitutes found for group {group.group_id}")
        return SubstitutionDetectionResult(
            bom_id=bom_id,
            component_group_id=group.group_id,
            substitution_candidates=[],
            no_substitutes_reason="No alternative components found in database for this category",
        )

    # Build prompt and call LLM
    prompt = build_substitution_prompt(group, potential_substitutes)
    llm_response = call_llm_for_substitution(prompt)

    # Parse response into structured format
    candidates = []
    for candidate_data in llm_response.get("substitution_candidates", []):
        try:
            candidate = SubstitutionCandidate(
                source_sku=candidate_data["source_sku"],
                source_name=candidate_data["source_name"],
                target_sku=candidate_data["target_sku"],
                target_name=candidate_data["target_name"],
                confidence=candidate_data["confidence"],
                reasoning_summary=candidate_data["reasoning_summary"],
                functional_match=candidate_data.get("functional_match", True),
                form_compatible=candidate_data.get("form_compatible", True),
                allergen_change=AllergenChange(candidate_data.get("allergen_change", "none")),
                dietary_change=AllergenChange(candidate_data.get("dietary_change", "none")),
                risks=candidate_data.get("risks", []),
                assumptions=candidate_data.get("assumptions", []),
            )
            candidates.append(candidate)
        except Exception as e:
            logger.warning(f"[{timestamp()}] Failed to parse candidate: {e}")
            continue

    result = SubstitutionDetectionResult(
        bom_id=bom_id,
        component_group_id=group.group_id,
        substitution_candidates=candidates,
        no_substitutes_reason=llm_response.get("no_substitutes_reason"),
    )

    # Cache result
    save_json_cache(cache_key, result.model_dump())

    return result


def detect_substitutions_for_bom(
    bom_analysis: BOMAnalysisResult,
    categories_to_process: Optional[list[str]] = None,
) -> list[SubstitutionDetectionResult]:
    """Detect substitutions for all component groups in a BOM."""
    results = []

    for group in bom_analysis.component_groups:
        # Skip if category filter is specified and this group doesn't match
        if categories_to_process and group.category not in categories_to_process:
            continue

        # Skip groups with only one component (nothing to compare)
        if group.count < 1:
            continue

        result = detect_substitutions_for_group(group, bom_analysis.bom_id)
        if result.substitution_candidates:
            results.append(result)

    return results


def print_substitution_summary(results: list[SubstitutionDetectionResult]) -> None:
    """Print a summary of substitution detection results."""
    print("\n" + "=" * 60)
    print("SUBSTITUTION DETECTOR - RESULTS SUMMARY")
    print("=" * 60)

    total_candidates = sum(len(r.substitution_candidates) for r in results)
    print(f"\n📊 Found {total_candidates} substitution candidates across {len(results)} groups")

    if results:
        print("\n🔄 SUBSTITUTION CANDIDATES:")
        print("-" * 40)

        for result in results:
            for candidate in result.substitution_candidates[:3]:  # Limit display
                confidence_bar = "█" * int(candidate.confidence * 10) + "░" * (10 - int(candidate.confidence * 10))
                print(f"\n  {candidate.source_name[:30]}")
                print(f"  → {candidate.target_name[:30]}")
                print(f"  Confidence: [{confidence_bar}] {candidate.confidence:.0%}")
                print(f"  Reasoning: {candidate.reasoning_summary[:60]}...")
                if candidate.risks:
                    print(f"  Risks: {', '.join(candidate.risks[:2])}")

    print("\n" + "=" * 60)
    print(f"✓ Detection completed at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    from .agent_02_bom_analyzer import analyze_bom

    logger.info(f"[{timestamp()}] Starting substitution detector...")

    try:
        # Analyze a sample BOM first
        bom_analysis = analyze_bom(1)  # BOM #1 is a simple vitamin D product
        if not bom_analysis:
            raise ValueError("Failed to analyze BOM")

        # Detect substitutions
        results = detect_substitutions_for_bom(bom_analysis)

        # Print summary
        print_substitution_summary(results)

        # Save results
        output_path = config.OUTPUT_PATH / "substitution_candidates.json"
        with open(output_path, "w") as f:
            json.dump([r.model_dump() for r in results], f, indent=2)

        logger.info(f"[{timestamp()}] Results saved to {output_path}")

        return results

    except Exception as e:
        logger.error(f"[{timestamp()}] Substitution detector failed: {e}")
        raise


if __name__ == "__main__":
    main()
