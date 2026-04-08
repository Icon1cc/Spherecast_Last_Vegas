"""
Agnes Raw Material Engine - Agent 07: Report Generator

Takes the final recommendations and produces a human-readable markdown report
and a JSON export suitable for an API response.
"""

import json
from datetime import datetime
from pathlib import Path

from .schemas import (
    SourcingRecommendation,
    BOMAnalysisResult,
    ComplianceVerdict,
    Verdict,
)
from .utils import (
    get_logger,
    timestamp,
)
from . import config

logger = get_logger(__name__)


def generate_markdown_report(
    recommendation: SourcingRecommendation,
    bom_analysis: BOMAnalysisResult = None,
    verdicts: list[ComplianceVerdict] = None,
) -> str:
    """Generate a human-readable markdown report."""

    report_lines = [
        "# Agnes Sourcing Recommendation Report",
        "",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Recommendation ID:** `{recommendation.recommendation_id}`",
        "",
        "---",
        "",
        "## Executive Summary",
        "",
        f"**BOM:** {recommendation.bom_name}",
        f"**Company:** {recommendation.company_name}",
        f"**Overall Score:** {recommendation.score:.0%}",
        "",
        recommendation.summary,
        "",
    ]

    # Impact section
    report_lines.extend([
        "## Impact Assessment",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Supplier Reduction | {recommendation.impact.supplier_reduction} |",
        f"| Compliance Confidence | {recommendation.impact.compliance_confidence} |",
        f"| Estimated Cost Impact | {recommendation.impact.estimated_cost_impact} |",
        f"| Lead Time Impact | {recommendation.impact.lead_time_impact} |",
        "",
    ])

    # Recommended changes
    if recommendation.changes:
        report_lines.extend([
            "## Recommended Substitutions",
            "",
        ])

        for i, change in enumerate(recommendation.changes, 1):
            confidence_level = "High" if change.confidence >= 0.85 else "Medium" if change.confidence >= 0.65 else "Low"

            report_lines.extend([
                f"### {i}. {change.current}",
                "",
                f"**Recommended Substitute:** {change.recommended}",
                "",
                f"**Confidence:** {change.confidence:.0%} ({confidence_level})",
                "",
                f"**Rationale:** {change.rationale}",
                "",
            ])

            if change.evidence_links:
                report_lines.append("**Evidence:**")
                for link in change.evidence_links:
                    report_lines.append(f"- {link}")
                report_lines.append("")

    # Risks section
    if recommendation.risks:
        report_lines.extend([
            "## Identified Risks",
            "",
        ])
        for risk in recommendation.risks:
            report_lines.append(f"- {risk}")
        report_lines.append("")

    # Human review section
    if recommendation.needs_human_review:
        report_lines.extend([
            "## Items Requiring Human Review",
            "",
            "> These items could not be fully evaluated automatically and require manual verification.",
            "",
        ])
        for item in recommendation.needs_human_review:
            report_lines.append(f"- [ ] {item}")
        report_lines.append("")

    # Next steps
    report_lines.extend([
        "## Recommended Next Steps",
        "",
    ])
    for i, step in enumerate(recommendation.next_steps, 1):
        report_lines.append(f"{i}. {step}")
    report_lines.append("")

    # BOM analysis details (if provided)
    if bom_analysis:
        report_lines.extend([
            "---",
            "",
            "## Appendix: BOM Analysis Details",
            "",
            f"**Total Components:** {bom_analysis.total_components}",
            "",
            "### Component Groups",
            "",
            "| Category | Sub-Category | Count |",
            "|----------|--------------|-------|",
        ])
        for group in bom_analysis.component_groups:
            sub = group.sub_category or "-"
            report_lines.append(f"| {group.category} | {sub} | {group.count} |")
        report_lines.append("")

    # Compliance details (if provided)
    if verdicts:
        report_lines.extend([
            "## Appendix: Compliance Verdicts",
            "",
        ])

        for verdict in verdicts:
            emoji = {
                Verdict.APPROVED: "✅",
                Verdict.CONDITIONAL: "⚠️",
                Verdict.REJECTED: "❌",
                Verdict.NEEDS_REVIEW: "🔍",
            }.get(verdict.verdict, "•")

            report_lines.extend([
                f"### {emoji} {verdict.substitution_id[:50]}",
                "",
                f"**Verdict:** {verdict.verdict.value.upper()}",
                f"**Confidence:** {verdict.confidence:.0%}",
                "",
                verdict.reasoning_summary,
                "",
            ])

            if verdict.compliance_details:
                report_lines.append("**Compliance Details:**")
                report_lines.append("")
                report_lines.append("| Criterion | Status | Notes |")
                report_lines.append("|-----------|--------|-------|")
                for criterion, detail in verdict.compliance_details.items():
                    status_emoji = "✅" if detail.status == "pass" else "❌" if detail.status == "fail" else "❓"
                    report_lines.append(f"| {criterion} | {status_emoji} {detail.status} | {detail.notes[:50]}... |")
                report_lines.append("")

    # Footer
    report_lines.extend([
        "---",
        "",
        "*This report was generated by the Agnes Raw Material Engine.*",
        "*All recommendations should be verified by qualified personnel before implementation.*",
    ])

    return "\n".join(report_lines)


def generate_json_export(
    recommendation: SourcingRecommendation,
    bom_analysis: BOMAnalysisResult = None,
    verdicts: list[ComplianceVerdict] = None,
) -> dict:
    """Generate a JSON export suitable for API response."""

    export = {
        "meta": {
            "generated_at": timestamp(),
            "version": "1.0.0",
            "engine": "Agnes Raw Material Engine",
        },
        "recommendation": recommendation.model_dump(),
    }

    if bom_analysis:
        export["bom_analysis"] = bom_analysis.model_dump()

    if verdicts:
        export["compliance_verdicts"] = [v.model_dump() for v in verdicts]

    return export


def save_report(
    recommendation: SourcingRecommendation,
    bom_analysis: BOMAnalysisResult = None,
    verdicts: list[ComplianceVerdict] = None,
    output_dir: Path = None,
) -> tuple[Path, Path]:
    """
    Save both markdown and JSON reports.

    Returns:
        Tuple of (markdown_path, json_path)
    """
    output_dir = output_dir or config.OUTPUT_PATH
    output_dir.mkdir(parents=True, exist_ok=True)

    base_name = f"report_{recommendation.bom_id}_{recommendation.recommendation_id}"

    # Generate and save markdown
    markdown_content = generate_markdown_report(recommendation, bom_analysis, verdicts)
    markdown_path = output_dir / f"{base_name}.md"
    with open(markdown_path, "w") as f:
        f.write(markdown_content)

    # Generate and save JSON
    json_content = generate_json_export(recommendation, bom_analysis, verdicts)
    json_path = output_dir / f"{base_name}.json"
    with open(json_path, "w") as f:
        json.dump(json_content, f, indent=2, default=str)

    logger.info(f"[{timestamp()}] Reports saved to {output_dir}")

    return markdown_path, json_path


def print_report_preview(markdown_content: str, max_lines: int = 50) -> None:
    """Print a preview of the markdown report."""
    lines = markdown_content.split("\n")

    print("\n" + "=" * 60)
    print("REPORT GENERATOR - PREVIEW")
    print("=" * 60)

    for line in lines[:max_lines]:
        print(line)

    if len(lines) > max_lines:
        print(f"\n... ({len(lines) - max_lines} more lines)")

    print("\n" + "=" * 60)
    print(f"✓ Report generated at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    from .schemas import (
        RecommendationChange,
        RecommendationImpact,
        Evidence,
        EvidenceType,
        ComplianceDetail,
    )

    logger.info(f"[{timestamp()}] Starting report generator...")

    # Create sample recommendation for testing
    sample_recommendation = SourcingRecommendation(
        recommendation_id="test123",
        bom_id=1,
        bom_name="FG-iherb-10421",
        company_name="NOW Foods",
        summary="Identified 1 substitution opportunity with conditional approval. Verification of potency specifications recommended before implementation.",
        changes=[
            RecommendationChange(
                component_id="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
                current="vitamin d3 cholecalciferol",
                recommended="vitamin d3 cholecalciferol (alt supplier)",
                rationale="Same active ingredient from alternative supplier with equivalent regulatory status",
                confidence=0.78,
                evidence_links=["FDA GRAS Database - 21 CFR 182.5950"],
            )
        ],
        impact=RecommendationImpact(
            supplier_reduction=0,
            compliance_confidence="maintained",
            estimated_cost_impact="unknown",
            lead_time_impact="unknown",
        ),
        risks=["Potential variation in bioavailability between suppliers"],
        next_steps=[
            "Review recommended substitution with procurement team",
            "Request certificate of analysis from alternative supplier",
            "Conduct stability testing if changing suppliers",
        ],
        needs_human_review=["Verify potency matches existing specification"],
        score=0.72,
    )

    sample_verdict = ComplianceVerdict(
        substitution_id="RM-C28-vitamin-d3_RM-C30-vitamin-d3",
        verdict=Verdict.CONDITIONAL,
        confidence=0.78,
        reasoning_summary="Substitution viable pending verification of potency specifications",
        evidence=[
            Evidence(
                source="FDA GRAS Database",
                type=EvidenceType.STRUCTURED_DATA,
                content="Vitamin D3 (cholecalciferol) is GRAS under 21 CFR 182.5950",
                relevance_score=0.95,
            )
        ],
        compliance_details={
            "regulatory": ComplianceDetail(status="pass", notes="Both components have GRAS status"),
            "safety": ComplianceDetail(status="pass", notes="No additional safety concerns"),
            "quality": ComplianceDetail(status="unknown", notes="Verify potency specifications"),
            "labeling": ComplianceDetail(status="pass", notes="No label changes required"),
        },
        conditions=["Verify potency matches specification"],
        risks=["Potential variation in bioavailability"],
        missing_data=["Certificate of analysis for substitute"],
    )

    try:
        # Generate markdown report
        markdown = generate_markdown_report(sample_recommendation, verdicts=[sample_verdict])
        print_report_preview(markdown)

        # Save reports
        md_path, json_path = save_report(sample_recommendation, verdicts=[sample_verdict])

        print(f"\n📄 Markdown report: {md_path}")
        print(f"📋 JSON export: {json_path}")

        return md_path, json_path

    except Exception as e:
        logger.error(f"[{timestamp()}] Report generator failed: {e}")
        raise


if __name__ == "__main__":
    main()
