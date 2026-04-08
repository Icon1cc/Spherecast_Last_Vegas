"""
Agnes Raw Material Engine - Agent 06: Recommendation Engine

Takes compliance-cleared substitutions and produces a final sourcing recommendation
per component category. Optimizes for supplier consolidation and lead time.
Outputs a structured JSON recommendation with full evidence trail.
"""

import json
from typing import Optional
from collections import defaultdict

from .schemas import (
    SubstitutionCandidate,
    ComplianceVerdict,
    SourcingRecommendation,
    RecommendationChange,
    RecommendationImpact,
    Verdict,
)
from .utils import (
    get_logger,
    get_db_connection,
    timestamp,
    save_json_cache,
    load_json_cache,
    hash_string,
    calculate_score,
)
from . import config

logger = get_logger(__name__)


def get_current_supplier_count(conn, bom_id: int) -> int:
    """Get the number of unique suppliers for a BOM."""
    cursor = conn.execute("""
        SELECT COUNT(DISTINCT sp.SupplierId)
        FROM BOM_Component bc
        JOIN Supplier_Product sp ON bc.ConsumedProductId = sp.ProductId
        WHERE bc.BOMId = ?
    """, (bom_id,))
    result = cursor.fetchone()
    return result[0] if result else 0


def get_supplier_overlap(conn, product_ids: list[int]) -> dict[str, list[int]]:
    """Get suppliers and their coverage of given products."""
    if not product_ids:
        return {}

    placeholders = ",".join("?" * len(product_ids))
    cursor = conn.execute(f"""
        SELECT s.Name, GROUP_CONCAT(sp.ProductId) as products
        FROM Supplier s
        JOIN Supplier_Product sp ON s.Id = sp.SupplierId
        WHERE sp.ProductId IN ({placeholders})
        GROUP BY s.Id
        ORDER BY COUNT(sp.ProductId) DESC
    """, product_ids)

    return {
        row["Name"]: [int(p) for p in row["products"].split(",")]
        for row in cursor.fetchall()
    }


def score_substitution(
    candidate: SubstitutionCandidate,
    verdict: ComplianceVerdict,
    supplier_consolidation_score: float = 0.5,
) -> float:
    """
    Calculate a score for a substitution recommendation.

    Scoring formula:
    score = w1*cost + w2*consolidation + w3*compliance + w4*evidence + w5*feasibility

    Weights from config.SCORING_WEIGHTS:
    - cost_advantage: 0.20
    - supplier_consolidation: 0.25
    - compliance_confidence: 0.30
    - evidence_quality: 0.15
    - operational_feasibility: 0.10
    """
    # Cost advantage (placeholder - no real cost data)
    cost_score = 0.5  # Neutral

    # Supplier consolidation
    consolidation_score = supplier_consolidation_score

    # Compliance confidence
    compliance_score = verdict.confidence

    # Evidence quality (average of evidence relevance scores)
    if verdict.evidence:
        evidence_score = sum(e.relevance_score for e in verdict.evidence) / len(verdict.evidence)
    else:
        evidence_score = 0.3  # Low score if no evidence

    # Operational feasibility (based on conditions and risks)
    feasibility_score = 1.0
    if verdict.conditions:
        feasibility_score -= 0.1 * min(len(verdict.conditions), 3)
    if verdict.risks:
        feasibility_score -= 0.1 * min(len(verdict.risks), 3)
    if verdict.missing_data:
        feasibility_score -= 0.1 * min(len(verdict.missing_data), 3)
    feasibility_score = max(0.1, feasibility_score)

    return calculate_score(
        cost_advantage=cost_score,
        consolidation=consolidation_score,
        compliance=compliance_score,
        evidence_quality=evidence_score,
        feasibility=feasibility_score,
    )


def filter_viable_substitutions(
    candidates: list[SubstitutionCandidate],
    verdicts: list[ComplianceVerdict],
    min_confidence: float = 0.4,
) -> list[tuple[SubstitutionCandidate, ComplianceVerdict]]:
    """Filter to only viable substitutions based on compliance verdicts."""
    viable = []

    verdict_map = {v.substitution_id: v for v in verdicts}

    for candidate in candidates:
        sub_id = f"{candidate.source_sku}_{candidate.target_sku}"
        verdict = verdict_map.get(sub_id)

        if not verdict:
            continue

        # Filter out rejected and insufficient confidence
        if verdict.verdict == Verdict.REJECTED:
            continue
        if verdict.confidence < min_confidence:
            continue

        viable.append((candidate, verdict))

    return viable


def generate_recommendation(
    bom_id: int,
    bom_name: str,
    company_name: str,
    viable_substitutions: list[tuple[SubstitutionCandidate, ComplianceVerdict]],
) -> SourcingRecommendation:
    """Generate a final sourcing recommendation for a BOM."""
    logger.info(f"[{timestamp()}] Generating recommendation for BOM {bom_id}...")

    conn = get_db_connection()
    current_supplier_count = get_current_supplier_count(conn, bom_id)

    # Score and rank substitutions
    scored = []
    for candidate, verdict in viable_substitutions:
        # Calculate supplier consolidation score (placeholder)
        consolidation_score = 0.5

        score = score_substitution(candidate, verdict, consolidation_score)
        scored.append((candidate, verdict, score))

    # Sort by score descending
    scored.sort(key=lambda x: x[2], reverse=True)

    # Build recommendation changes
    changes = []
    recommended_suppliers = set()

    for candidate, verdict, score in scored:
        # Get evidence links
        evidence_links = [e.source for e in verdict.evidence if e.source]

        change = RecommendationChange(
            component_id=candidate.source_sku,
            current=candidate.source_name,
            recommended=candidate.target_name,
            rationale=verdict.reasoning_summary,
            confidence=verdict.confidence,
            evidence_links=evidence_links,
        )
        changes.append(change)

    conn.close()

    # Calculate impact
    supplier_reduction = 0  # Would need more analysis for real value
    compliance_confidence = "maintained"
    if scored:
        avg_confidence = sum(s[2] for s in scored) / len(scored)
        if avg_confidence > 0.8:
            compliance_confidence = "improved"
        elif avg_confidence < 0.6:
            compliance_confidence = "uncertain"

    impact = RecommendationImpact(
        supplier_reduction=supplier_reduction,
        compliance_confidence=compliance_confidence,
        estimated_cost_impact="unknown",
        lead_time_impact="unknown",
    )

    # Collect all risks and needs-review items
    all_risks = []
    needs_review = []

    for candidate, verdict, _ in scored:
        all_risks.extend(verdict.risks)
        if verdict.verdict == Verdict.NEEDS_REVIEW:
            needs_review.append(f"{candidate.source_name} → {candidate.target_name}")
        if verdict.missing_data:
            needs_review.extend([f"Missing: {d}" for d in verdict.missing_data[:2]])

    # Build next steps
    next_steps = []
    if changes:
        next_steps.append("Review recommended substitutions with procurement team")
    if needs_review:
        next_steps.append("Address items flagged for human review")
    next_steps.append("Request certificates of analysis for recommended substitutes")
    next_steps.append("Conduct stability testing if changing suppliers")

    # Generate summary
    if not changes:
        summary = "No viable substitution opportunities identified for this BOM."
    else:
        approved_count = sum(1 for _, v, _ in scored if v.verdict == Verdict.APPROVED)
        conditional_count = sum(1 for _, v, _ in scored if v.verdict == Verdict.CONDITIONAL)
        summary = (
            f"Identified {len(changes)} substitution opportunities: "
            f"{approved_count} approved, {conditional_count} conditional. "
            f"Estimated compliance confidence: {compliance_confidence}."
        )

    # Calculate overall score
    overall_score = sum(s[2] for s in scored) / len(scored) if scored else 0.0

    recommendation = SourcingRecommendation(
        recommendation_id=hash_string(f"{bom_id}_{timestamp()}"),
        bom_id=bom_id,
        bom_name=bom_name,
        company_name=company_name,
        summary=summary,
        changes=changes,
        impact=impact,
        risks=list(set(all_risks))[:5],  # Dedupe and limit
        next_steps=next_steps,
        needs_human_review=list(set(needs_review))[:5],
        score=overall_score,
    )

    return recommendation


def print_recommendation_summary(recommendation: SourcingRecommendation) -> None:
    """Print a formatted recommendation summary."""
    print("\n" + "=" * 60)
    print("RECOMMENDATION ENGINE - FINAL OUTPUT")
    print("=" * 60)

    print(f"\n📦 BOM: {recommendation.bom_name}")
    print(f"   Company: {recommendation.company_name}")
    print(f"   Overall Score: {recommendation.score:.0%}")

    print(f"\n📝 SUMMARY:")
    print(f"   {recommendation.summary}")

    if recommendation.changes:
        print(f"\n🔄 RECOMMENDED CHANGES ({len(recommendation.changes)}):")
        print("-" * 40)
        for change in recommendation.changes:
            confidence_bar = "█" * int(change.confidence * 10) + "░" * (10 - int(change.confidence * 10))
            print(f"\n   • {change.current[:30]}")
            print(f"     → {change.recommended[:30]}")
            print(f"     Confidence: [{confidence_bar}] {change.confidence:.0%}")
            print(f"     Rationale: {change.rationale[:50]}...")
            if change.evidence_links:
                print(f"     Evidence: {change.evidence_links[0][:40]}...")

    print(f"\n📊 IMPACT:")
    print(f"   • Supplier reduction: {recommendation.impact.supplier_reduction}")
    print(f"   • Compliance confidence: {recommendation.impact.compliance_confidence}")
    print(f"   • Cost impact: {recommendation.impact.estimated_cost_impact}")
    print(f"   • Lead time impact: {recommendation.impact.lead_time_impact}")

    if recommendation.risks:
        print(f"\n⚠️  RISKS:")
        for risk in recommendation.risks[:3]:
            print(f"   • {risk[:60]}")

    if recommendation.needs_human_review:
        print(f"\n🔍 NEEDS HUMAN REVIEW:")
        for item in recommendation.needs_human_review[:3]:
            print(f"   • {item[:60]}")

    print(f"\n📋 NEXT STEPS:")
    for step in recommendation.next_steps:
        print(f"   1. {step}")

    print("\n" + "=" * 60)
    print(f"✓ Recommendation generated at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    from .schemas import AllergenChange, Evidence, EvidenceType

    logger.info(f"[{timestamp()}] Starting recommendation engine...")

    # Create sample data for testing
    sample_candidates = [
        SubstitutionCandidate(
            source_sku="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
            source_name="vitamin d3 cholecalciferol",
            target_sku="RM-C30-vitamin-d3-cholecalciferol-559c9699",
            target_name="vitamin d3 cholecalciferol (alt supplier)",
            confidence=0.85,
            reasoning_summary="Same active ingredient from different supplier",
        ),
    ]

    sample_verdicts = [
        ComplianceVerdict(
            substitution_id="RM-C28-vitamin-d3-cholecalciferol-8956b79c_RM-C30-vitamin-d3-cholecalciferol-559c9699",
            verdict=Verdict.CONDITIONAL,
            confidence=0.78,
            reasoning_summary="Substitution viable pending verification of potency specifications",
            evidence=[
                Evidence(
                    source="FDA GRAS Database",
                    type=EvidenceType.STRUCTURED_DATA,
                    content="Both components have GRAS status",
                    relevance_score=0.95,
                )
            ],
            conditions=["Verify potency matches specification"],
            risks=["Potential variation in bioavailability"],
            assumptions=["Similar purity levels"],
            missing_data=["Certificate of analysis for substitute"],
        ),
    ]

    try:
        viable = filter_viable_substitutions(sample_candidates, sample_verdicts)

        recommendation = generate_recommendation(
            bom_id=1,
            bom_name="FG-iherb-10421",
            company_name="NOW Foods",
            viable_substitutions=viable,
        )

        print_recommendation_summary(recommendation)

        # Save results
        output_path = config.OUTPUT_PATH / "recommendation.json"
        with open(output_path, "w") as f:
            json.dump(recommendation.model_dump(), f, indent=2, default=str)

        logger.info(f"[{timestamp()}] Results saved to {output_path}")

        return recommendation

    except Exception as e:
        logger.error(f"[{timestamp()}] Recommendation engine failed: {e}")
        raise


if __name__ == "__main__":
    main()
