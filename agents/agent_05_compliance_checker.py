"""
Agnes Raw Material Engine - Agent 05: Compliance Checker

For each candidate substitution, reasons about whether quality and compliance
constraints are still met based on the BOM context and external evidence.
Produces a structured compliance verdict with evidence citations.
"""

import json
from typing import Optional

from .schemas import (
    SubstitutionCandidate,
    ComplianceVerdict,
    ComplianceDetail,
    Evidence,
    EvidenceType,
    Verdict,
    ExternalEvidenceRecord,
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

# Try to import anthropic
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


COMPLIANCE_SYSTEM_PROMPT = """You are a regulatory compliance expert for dietary supplements in the US market. Your task is to evaluate whether a proposed component substitution maintains product compliance.

EVALUATION CRITERIA:
1. REGULATORY: Both components must have equivalent regulatory status (GRAS, food-grade, etc.)
2. SAFETY: Are there any safety concerns with the substitution?
3. QUALITY: Quality specifications must be equivalent or better
4. LABELING: Would this substitution require label changes?

CONFIDENCE SCORING:
- 0.85-1.0: High confidence - clear evidence supports the substitution
- 0.65-0.84: Medium confidence - some evidence, minor gaps
- 0.40-0.64: Low confidence - limited evidence, significant uncertainty
- 0.0-0.39: Insufficient - cannot make determination, needs human review

CRITICAL RULES:
1. If evidence is insufficient, return verdict "needs_review" - NEVER guess on compliance
2. Always cite specific evidence for your conclusions
3. Be conservative - false negatives are better than compliance errors
4. Flag any label change requirements explicitly

OUTPUT: Return valid JSON only, no markdown or explanation."""


def build_compliance_prompt(
    candidate: SubstitutionCandidate,
    evidence: list[ExternalEvidenceRecord],
    product_context: Optional[dict] = None,
) -> str:
    """Build the prompt for compliance evaluation."""

    evidence_text = "\n\n".join([
        f"Source: {e.source_type.value}\nURL: {e.source_url or 'N/A'}\nContent:\n{e.content}"
        for e in evidence
    ]) if evidence else "No external evidence available."

    context_text = ""
    if product_context:
        context_text = f"""
PRODUCT CONTEXT:
- Product: {product_context.get('product_sku', 'Unknown')}
- Company: {product_context.get('company_name', 'Unknown')}
- Product Type: {product_context.get('product_type', 'Dietary Supplement')}
"""

    return f"""Evaluate the compliance of this proposed component substitution.

ORIGINAL COMPONENT:
- SKU: {candidate.source_sku}
- Name: {candidate.source_name}

PROPOSED SUBSTITUTE:
- SKU: {candidate.target_sku}
- Name: {candidate.target_name}
- Initial Confidence: {candidate.confidence}
- Initial Assessment: {candidate.reasoning_summary}
- Allergen Change: {candidate.allergen_change.value}
- Dietary Change: {candidate.dietary_change.value}
- Identified Risks: {', '.join(candidate.risks) if candidate.risks else 'None identified'}
- Assumptions Made: {', '.join(candidate.assumptions) if candidate.assumptions else 'None'}
{context_text}
AVAILABLE EVIDENCE:
{evidence_text}

Evaluate this substitution against regulatory, safety, quality, and labeling criteria.

Return JSON in this exact format:
{{
    "verdict": "approved" | "conditional" | "rejected" | "needs_review",
    "confidence": <0.0-1.0>,
    "reasoning_summary": "<2-3 sentence summary>",
    "evidence": [
        {{
            "source": "<source name/url>",
            "type": "structured_data" | "external_web" | "heuristic",
            "content": "<relevant excerpt>",
            "relevance_score": <0.0-1.0>
        }}
    ],
    "compliance_details": {{
        "regulatory": {{"status": "pass" | "fail" | "unknown", "notes": "<explanation>"}},
        "safety": {{"status": "pass" | "fail" | "unknown", "notes": "<explanation>"}},
        "quality": {{"status": "pass" | "fail" | "unknown", "notes": "<explanation>"}},
        "labeling": {{"status": "pass" | "fail" | "unknown", "notes": "<explanation>"}}
    }},
    "conditions": ["<if conditional, list conditions that must be met>"],
    "risks": ["<identified risks>"],
    "assumptions": ["<assumptions made due to missing data>"],
    "missing_data": ["<data that would improve this assessment>"]
}}"""


@retry_with_backoff(max_retries=3, base_delay=2.0)
def call_llm_for_compliance(prompt: str) -> dict:
    """Call the LLM for compliance evaluation."""
    if not ANTHROPIC_AVAILABLE or not config.ANTHROPIC_API_KEY:
        logger.info(f"[{timestamp()}] Using mock LLM response (no API key)")
        return generate_mock_compliance_response()

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

    response = client.messages.create(
        model=config.LLM_MODEL,
        max_tokens=4096,
        system=COMPLIANCE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    content = response.content[0].text

    # Handle potential markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]

    return json.loads(content)


def generate_mock_compliance_response() -> dict:
    """Generate a mock response for testing without API keys."""
    return {
        "verdict": "conditional",
        "confidence": 0.75,
        "reasoning_summary": "The substitution appears viable from a regulatory standpoint as both components have GRAS status. However, verification of equivalent potency and purity specifications is recommended before final approval.",
        "evidence": [
            {
                "source": "FDA GRAS Database",
                "type": "structured_data",
                "content": "Vitamin D3 (cholecalciferol) is GRAS under 21 CFR 182.5950",
                "relevance_score": 0.95,
            }
        ],
        "compliance_details": {
            "regulatory": {"status": "pass", "notes": "Both components have GRAS status for use in dietary supplements"},
            "safety": {"status": "pass", "notes": "No additional safety concerns identified"},
            "quality": {"status": "unknown", "notes": "Purity and potency specifications should be verified"},
            "labeling": {"status": "pass", "notes": "No label changes required - same active ingredient"},
        },
        "conditions": ["Verify potency matches existing specification", "Confirm supplier has valid certificates of analysis"],
        "risks": ["Potential variation in bioavailability between suppliers"],
        "assumptions": ["Assumed similar manufacturing processes", "Assumed equivalent purity levels"],
        "missing_data": ["Supplier certificate of analysis", "Stability data for substitute"],
    }


def check_compliance(
    candidate: SubstitutionCandidate,
    evidence: list[ExternalEvidenceRecord],
    product_context: Optional[dict] = None,
    use_cache: bool = True,
) -> ComplianceVerdict:
    """
    Check compliance for a substitution candidate.

    Args:
        candidate: The substitution candidate to evaluate
        evidence: External evidence records
        product_context: Optional context about the finished product
        use_cache: Whether to use cached results

    Returns:
        ComplianceVerdict with detailed reasoning
    """
    cache_key = f"compliance_{hash_string(candidate.source_sku + candidate.target_sku)}"

    if use_cache:
        cached = load_json_cache(cache_key)
        if cached:
            logger.info(f"[{timestamp()}] Using cached compliance verdict")
            return ComplianceVerdict(**cached)

    logger.info(f"[{timestamp()}] Checking compliance: {candidate.source_name[:30]} → {candidate.target_name[:30]}")

    # Build prompt and call LLM
    prompt = build_compliance_prompt(candidate, evidence, product_context)
    llm_response = call_llm_for_compliance(prompt)

    # Parse response into structured format
    try:
        # Parse evidence
        evidence_items = []
        for ev in llm_response.get("evidence", []):
            evidence_items.append(Evidence(
                source=ev["source"],
                type=EvidenceType(ev["type"]),
                content=ev["content"],
                relevance_score=ev.get("relevance_score", 0.5),
            ))

        # Parse compliance details
        compliance_details = {}
        for key, detail in llm_response.get("compliance_details", {}).items():
            compliance_details[key] = ComplianceDetail(
                status=detail["status"],
                notes=detail["notes"],
            )

        verdict = ComplianceVerdict(
            substitution_id=f"{candidate.source_sku}_{candidate.target_sku}",
            verdict=Verdict(llm_response["verdict"]),
            confidence=llm_response["confidence"],
            reasoning_summary=llm_response["reasoning_summary"],
            evidence=evidence_items,
            compliance_details=compliance_details,
            conditions=llm_response.get("conditions", []),
            risks=llm_response.get("risks", []),
            assumptions=llm_response.get("assumptions", []),
            missing_data=llm_response.get("missing_data", []),
        )

    except Exception as e:
        logger.error(f"[{timestamp()}] Failed to parse compliance response: {e}")
        # Return a safe default
        verdict = ComplianceVerdict(
            substitution_id=f"{candidate.source_sku}_{candidate.target_sku}",
            verdict=Verdict.NEEDS_REVIEW,
            confidence=0.0,
            reasoning_summary=f"Failed to evaluate compliance: {str(e)}",
            evidence=[],
            missing_data=["Compliance evaluation failed - manual review required"],
        )

    # Cache result
    save_json_cache(cache_key, verdict.model_dump())

    return verdict


def check_compliance_batch(
    candidates: list[SubstitutionCandidate],
    evidence_map: dict[str, list[ExternalEvidenceRecord]],
    product_context: Optional[dict] = None,
) -> list[ComplianceVerdict]:
    """Check compliance for multiple candidates."""
    results = []

    for candidate in candidates:
        key = f"{candidate.source_sku}_{candidate.target_sku}"
        evidence = evidence_map.get(key, [])
        verdict = check_compliance(candidate, evidence, product_context)
        results.append(verdict)

    return results


def print_compliance_summary(verdicts: list[ComplianceVerdict]) -> None:
    """Print a summary of compliance check results."""
    print("\n" + "=" * 60)
    print("COMPLIANCE CHECKER - RESULTS SUMMARY")
    print("=" * 60)

    # Count by verdict
    verdict_counts = {}
    for v in verdicts:
        verdict_counts[v.verdict.value] = verdict_counts.get(v.verdict.value, 0) + 1

    print(f"\n📊 Evaluated {len(verdicts)} substitution candidates")

    print("\n⚖️  VERDICTS:")
    print("-" * 40)
    verdict_emoji = {
        "approved": "✅",
        "conditional": "⚠️ ",
        "rejected": "❌",
        "needs_review": "🔍",
    }
    for verdict_type, count in sorted(verdict_counts.items()):
        emoji = verdict_emoji.get(verdict_type, "•")
        print(f"  {emoji} {verdict_type}: {count}")

    # Show details
    print("\n📋 DETAILED RESULTS:")
    print("-" * 40)
    for verdict in verdicts:
        confidence_bar = "█" * int(verdict.confidence * 10) + "░" * (10 - int(verdict.confidence * 10))
        emoji = verdict_emoji.get(verdict.verdict.value, "•")

        print(f"\n  {emoji} {verdict.substitution_id[:50]}")
        print(f"     Verdict: {verdict.verdict.value.upper()}")
        print(f"     Confidence: [{confidence_bar}] {verdict.confidence:.0%}")
        print(f"     Summary: {verdict.reasoning_summary[:60]}...")

        if verdict.conditions:
            print(f"     Conditions: {verdict.conditions[0][:50]}...")
        if verdict.missing_data:
            print(f"     Missing: {verdict.missing_data[0][:50]}...")

    print("\n" + "=" * 60)
    print(f"✓ Compliance check completed at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    from .schemas import AllergenChange

    logger.info(f"[{timestamp()}] Starting compliance checker...")

    # Create sample data for testing
    sample_candidate = SubstitutionCandidate(
        source_sku="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
        source_name="vitamin d3 cholecalciferol",
        target_sku="RM-C30-vitamin-d3-cholecalciferol-559c9699",
        target_name="vitamin d3 cholecalciferol",
        confidence=0.85,
        reasoning_summary="Same active ingredient from different supplier",
        allergen_change=AllergenChange.NONE,
        dietary_change=AllergenChange.NONE,
        risks=["Verify potency matches"],
        assumptions=["Similar purity levels"],
    )

    sample_evidence = [
        ExternalEvidenceRecord(
            source_type=EvidenceType.STRUCTURED_DATA,
            source_url="https://www.ecfr.gov/current/title-21/182.5950",
            content="Vitamin D3 (cholecalciferol) is GRAS under 21 CFR 182.5950 for use as a nutrient supplement",
            relevance_score=0.95,
        ),
    ]

    try:
        verdict = check_compliance(sample_candidate, sample_evidence)
        print_compliance_summary([verdict])

        # Save results
        output_path = config.OUTPUT_PATH / "compliance_verdicts.json"
        with open(output_path, "w") as f:
            json.dump([verdict.model_dump()], f, indent=2, default=str)

        logger.info(f"[{timestamp()}] Results saved to {output_path}")

        return [verdict]

    except Exception as e:
        logger.error(f"[{timestamp()}] Compliance checker failed: {e}")
        raise


if __name__ == "__main__":
    main()
