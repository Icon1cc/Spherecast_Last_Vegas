"""
Agnes Raw Material Engine - Pipeline Orchestrator

Runs all agents in sequence with error handling. Accepts flags to skip steps
(e.g., --skip-enrichment to use cached results). Logs progress and errors clearly.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .utils import get_logger, timestamp
from . import config

# Import all agents
from . import agent_01_data_loader as data_loader
from . import agent_02_bom_analyzer as bom_analyzer
from . import agent_03_substitution_detector as substitution_detector
from . import agent_04_external_enricher as external_enricher
from . import agent_05_compliance_checker as compliance_checker
from . import agent_06_recommendation_engine as recommendation_engine
from . import agent_07_report_generator as report_generator

# Alias functions for cleaner code
load_data = data_loader.load_data
analyze_bom = bom_analyzer.analyze_bom
analyze_all_boms = bom_analyzer.analyze_all_boms
detect_substitutions_for_bom = substitution_detector.detect_substitutions_for_bom
enrich_candidates = external_enricher.enrich_candidates
check_compliance_batch = compliance_checker.check_compliance_batch
filter_viable_substitutions = recommendation_engine.filter_viable_substitutions
generate_recommendation = recommendation_engine.generate_recommendation
save_report = report_generator.save_report

logger = get_logger(__name__)


class PipelineConfig:
    """Configuration for pipeline execution."""

    def __init__(
        self,
        bom_id: Optional[int] = None,
        skip_enrichment: bool = False,
        skip_compliance: bool = False,
        use_cache: bool = True,
        output_dir: Optional[Path] = None,
        categories: Optional[list[str]] = None,
    ):
        self.bom_id = bom_id
        self.skip_enrichment = skip_enrichment
        self.skip_compliance = skip_compliance
        self.use_cache = use_cache
        self.output_dir = output_dir or config.OUTPUT_PATH
        self.categories = categories  # Filter to specific component categories


class PipelineResult:
    """Result of a pipeline execution."""

    def __init__(self):
        self.success = False
        self.bom_id = None
        self.bom_analysis = None
        self.substitution_results = []
        self.evidence_map = {}
        self.verdicts = []
        self.recommendation = None
        self.report_paths = None
        self.errors = []

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "bom_id": self.bom_id,
            "substitution_count": len(self.substitution_results),
            "verdict_count": len(self.verdicts),
            "recommendation_score": self.recommendation.score if self.recommendation else None,
            "errors": self.errors,
        }


def run_pipeline(pipeline_config: PipelineConfig) -> PipelineResult:
    """
    Execute the full Agnes pipeline for a single BOM.

    Pipeline stages:
    1. Load data (always runs)
    2. Analyze BOM
    3. Detect substitutions
    4. Enrich with external data (skippable)
    5. Check compliance (skippable)
    6. Generate recommendations
    7. Generate reports

    Args:
        pipeline_config: Configuration for this pipeline run

    Returns:
        PipelineResult with all outputs and any errors
    """
    result = PipelineResult()
    result.bom_id = pipeline_config.bom_id

    print("\n" + "=" * 70)
    print("🚀 AGNES RAW MATERIAL ENGINE - PIPELINE EXECUTION")
    print("=" * 70)
    print(f"\n⏱️  Started at: {timestamp()}")
    print(f"📦 BOM ID: {pipeline_config.bom_id or 'All BOMs'}")
    print(f"💾 Use cache: {pipeline_config.use_cache}")
    print(f"⏭️  Skip enrichment: {pipeline_config.skip_enrichment}")
    print(f"⏭️  Skip compliance: {pipeline_config.skip_compliance}")
    print("-" * 70)

    try:
        # Stage 1: Load Data
        print("\n📥 STAGE 1: Loading data...")
        load_data()
        print("   ✓ Data loaded successfully")

        # Stage 2: Analyze BOM
        print("\n🔍 STAGE 2: Analyzing BOM...")
        if pipeline_config.bom_id:
            result.bom_analysis = analyze_bom(
                pipeline_config.bom_id,
                use_cache=pipeline_config.use_cache
            )
            if not result.bom_analysis:
                raise ValueError(f"BOM {pipeline_config.bom_id} not found")
        else:
            analyses = analyze_all_boms(limit=5)
            if analyses:
                result.bom_analysis = analyses[0]
            else:
                raise ValueError("No BOMs found in database")

        print(f"   ✓ Analyzed BOM: {result.bom_analysis.product_sku}")
        print(f"   ✓ Found {result.bom_analysis.total_components} components in {len(result.bom_analysis.component_groups)} groups")

        # Stage 3: Detect Substitutions
        print("\n🔄 STAGE 3: Detecting substitutions...")
        result.substitution_results = detect_substitutions_for_bom(
            result.bom_analysis,
            categories_to_process=pipeline_config.categories,
        )

        total_candidates = sum(
            len(r.substitution_candidates)
            for r in result.substitution_results
        )
        print(f"   ✓ Found {total_candidates} substitution candidates")

        # Collect all candidates for next stages
        all_candidates = []
        for sub_result in result.substitution_results:
            all_candidates.extend(sub_result.substitution_candidates)

        if not all_candidates:
            print("   ⚠️  No substitution candidates found, skipping remaining stages")
            result.success = True
            return result

        # Stage 4: External Enrichment
        if not pipeline_config.skip_enrichment:
            print("\n🌐 STAGE 4: Enriching with external data...")
            result.evidence_map = enrich_candidates(
                all_candidates,
                store_in_db=True
            )
            total_evidence = sum(len(v) for v in result.evidence_map.values())
            print(f"   ✓ Gathered {total_evidence} evidence records")
        else:
            print("\n⏭️  STAGE 4: Skipped (--skip-enrichment)")
            result.evidence_map = {}

        # Stage 5: Compliance Check
        if not pipeline_config.skip_compliance:
            print("\n⚖️  STAGE 5: Checking compliance...")
            product_context = {
                "product_sku": result.bom_analysis.product_sku,
                "company_name": result.bom_analysis.company_name,
            }

            # Convert evidence map to correct format
            evidence_map_for_compliance = {}
            for key, evidence_list in result.evidence_map.items():
                evidence_map_for_compliance[key] = evidence_list

            result.verdicts = check_compliance_batch(
                all_candidates,
                evidence_map_for_compliance,
                product_context,
            )
            print(f"   ✓ Evaluated {len(result.verdicts)} substitutions")

            # Count by verdict
            verdict_counts = {}
            for v in result.verdicts:
                verdict_counts[v.verdict.value] = verdict_counts.get(v.verdict.value, 0) + 1
            for vtype, count in verdict_counts.items():
                print(f"      • {vtype}: {count}")
        else:
            print("\n⏭️  STAGE 5: Skipped (--skip-compliance)")
            result.verdicts = []

        # Stage 6: Generate Recommendations
        print("\n📊 STAGE 6: Generating recommendations...")
        viable = filter_viable_substitutions(all_candidates, result.verdicts)
        print(f"   ✓ {len(viable)} viable substitutions after filtering")

        result.recommendation = generate_recommendation(
            bom_id=result.bom_analysis.bom_id,
            bom_name=result.bom_analysis.product_sku,
            company_name=result.bom_analysis.company_name,
            viable_substitutions=viable,
        )
        print(f"   ✓ Recommendation score: {result.recommendation.score:.0%}")

        # Stage 7: Generate Reports
        print("\n📄 STAGE 7: Generating reports...")
        md_path, json_path = save_report(
            result.recommendation,
            result.bom_analysis,
            result.verdicts,
            pipeline_config.output_dir,
        )
        result.report_paths = (md_path, json_path)
        print(f"   ✓ Markdown report: {md_path}")
        print(f"   ✓ JSON export: {json_path}")

        result.success = True

    except Exception as e:
        logger.error(f"[{timestamp()}] Pipeline failed: {e}")
        result.errors.append(str(e))
        result.success = False
        raise

    finally:
        # Print summary
        print("\n" + "-" * 70)
        print("📋 PIPELINE SUMMARY")
        print("-" * 70)
        print(f"   Status: {'✓ SUCCESS' if result.success else '✗ FAILED'}")
        print(f"   BOM: {result.bom_analysis.product_sku if result.bom_analysis else 'N/A'}")
        print(f"   Substitutions found: {total_candidates if 'total_candidates' in dir() else 0}")
        print(f"   Verdicts: {len(result.verdicts)}")
        if result.recommendation:
            print(f"   Recommendation score: {result.recommendation.score:.0%}")
        if result.errors:
            print(f"   Errors: {result.errors}")
        print(f"   Completed at: {timestamp()}")
        print("=" * 70 + "\n")

    return result


def main():
    """Entry point with CLI argument parsing."""
    parser = argparse.ArgumentParser(
        description="Agnes Raw Material Engine - Run the full pipeline"
    )
    parser.add_argument(
        "--bom-id",
        type=int,
        default=1,
        help="BOM ID to analyze (default: 1)"
    )
    parser.add_argument(
        "--skip-enrichment",
        action="store_true",
        help="Skip external data enrichment stage"
    )
    parser.add_argument(
        "--skip-compliance",
        action="store_true",
        help="Skip compliance checking stage"
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable caching (re-run all stages)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for reports"
    )
    parser.add_argument(
        "--categories",
        type=str,
        nargs="+",
        default=None,
        help="Filter to specific component categories"
    )

    args = parser.parse_args()

    pipeline_config = PipelineConfig(
        bom_id=args.bom_id,
        skip_enrichment=args.skip_enrichment,
        skip_compliance=args.skip_compliance,
        use_cache=not args.no_cache,
        output_dir=Path(args.output_dir) if args.output_dir else None,
        categories=args.categories,
    )

    try:
        result = run_pipeline(pipeline_config)
        sys.exit(0 if result.success else 1)
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
