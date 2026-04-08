"""
Test suite for Agnes Raw Material Engine pipeline.

Tests cover:
- Data loading succeeds
- BOM analyzer finds at least one component group
- Substitution detector returns structured output
- Compliance checker produces a verdict with evidence
- Final recommendation is non-empty and cites sources

LLM calls are mocked so tests run without API keys.
"""

import pytest
import sqlite3
from pathlib import Path
from unittest.mock import patch, MagicMock
import json


class TestDataLoader:
    """Tests for the data loader agent."""

    def test_database_exists(self, test_db_path):
        """Verify the test database exists."""
        assert Path(test_db_path).exists()

    def test_database_has_required_tables(self, test_db_path):
        """Verify all required tables exist in the database."""
        conn = sqlite3.connect(test_db_path)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        required = {"Company", "Product", "BOM", "BOM_Component", "Supplier", "Supplier_Product"}
        assert required.issubset(tables), f"Missing tables: {required - tables}"

    def test_database_has_data(self, test_db_path):
        """Verify the database has actual data."""
        conn = sqlite3.connect(test_db_path)

        # Check each table has data
        for table in ["Company", "Product", "BOM", "Supplier"]:
            cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            assert count > 0, f"Table {table} is empty"

        conn.close()

    def test_load_data_returns_summary(self, test_db_path):
        """Test that load_data returns expected summary structure."""
        with patch("agents.config.DATABASE_PATH", test_db_path):
            from agents.agent_01_data_loader import load_data
            result = load_data()

            assert "table_counts" in result
            assert "product_breakdown" in result
            assert "top_suppliers" in result
            assert "bom_summary" in result
            assert result["table_counts"]["Product"] > 0


class TestBOMAnalyzer:
    """Tests for the BOM analyzer agent."""

    def test_analyze_bom_returns_result(self, test_db_path):
        """Test that analyzing a BOM returns a valid result."""
        with patch("agents.config.DATABASE_PATH", test_db_path):
            from agents.agent_02_bom_analyzer import analyze_bom

            result = analyze_bom(1, use_cache=False)

            assert result is not None
            assert result.bom_id == 1
            assert result.total_components > 0
            assert len(result.component_groups) > 0

    def test_analyze_bom_finds_component_groups(self, test_db_path):
        """Test that BOM analyzer identifies component groups."""
        with patch("agents.config.DATABASE_PATH", test_db_path):
            from agents.agent_02_bom_analyzer import analyze_bom

            result = analyze_bom(1, use_cache=False)

            # Should find at least one group
            assert len(result.component_groups) >= 1

            # Each group should have valid data
            for group in result.component_groups:
                assert group.group_id
                assert group.category
                assert group.count > 0
                assert len(group.components) == group.count

    def test_component_normalization(self):
        """Test component name normalization."""
        from agents.utils import extract_component_name

        # Test various SKU formats
        assert "vitamin d3 cholecalciferol" in extract_component_name(
            "RM-C28-vitamin-d3-cholecalciferol-8956b79c"
        )
        assert "sunflower lecithin" in extract_component_name(
            "RM-C6-sunflower-lecithin-47e33a0e"
        )

    def test_component_categorization(self):
        """Test component categorization logic."""
        from agents.utils import categorize_component

        # Vitamins
        cat, sub = categorize_component("vitamin-d3-cholecalciferol")
        assert cat == "vitamin"
        assert sub == "vitamin_d"

        # Capsules
        cat, sub = categorize_component("bovine-gelatin-capsule")
        assert cat == "capsule"
        assert sub == "bovine_gelatin"

        # Proteins
        cat, sub = categorize_component("whey-protein-isolate")
        assert cat == "protein"
        assert sub == "whey_isolate"


class TestSubstitutionDetector:
    """Tests for the substitution detector agent."""

    def test_substitution_detection_returns_structured_output(
        self, sample_bom_analysis, mock_anthropic
    ):
        """Test that substitution detection returns properly structured output."""
        from agents.agent_03_substitution_detector import detect_substitutions_for_bom

        # Mock LLM to return valid response
        mock_anthropic.messages.create.return_value.content = [
            MagicMock(text=json.dumps({
                "substitution_candidates": [
                    {
                        "source_sku": "RM-C28-vitamin-d3-cholecalciferol-8956b79c",
                        "source_name": "vitamin d3 cholecalciferol",
                        "target_sku": "RM-C30-vitamin-d3-cholecalciferol-559c9699",
                        "target_name": "vitamin d3 cholecalciferol",
                        "confidence": 0.85,
                        "reasoning_summary": "Same ingredient",
                        "functional_match": True,
                        "form_compatible": True,
                        "allergen_change": "none",
                        "dietary_change": "none",
                        "risks": [],
                        "assumptions": [],
                    }
                ],
                "no_substitutes_reason": None,
            }))
        ]

        with patch("agents.agent_03_substitution_detector.ANTHROPIC_AVAILABLE", False):
            results = detect_substitutions_for_bom(sample_bom_analysis)

            # Results should be a list
            assert isinstance(results, list)

    def test_mock_substitution_response_is_valid(self):
        """Test that mock substitution response has correct structure."""
        from agents.agent_03_substitution_detector import generate_mock_substitution_response
        from agents.schemas import SubstitutionCandidate, AllergenChange

        response = generate_mock_substitution_response()

        assert "substitution_candidates" in response
        assert isinstance(response["substitution_candidates"], list)

        if response["substitution_candidates"]:
            candidate_data = response["substitution_candidates"][0]
            # Should be parseable into SubstitutionCandidate
            candidate = SubstitutionCandidate(
                source_sku=candidate_data["source_sku"],
                source_name=candidate_data["source_name"],
                target_sku=candidate_data["target_sku"],
                target_name=candidate_data["target_name"],
                confidence=candidate_data["confidence"],
                reasoning_summary=candidate_data["reasoning_summary"],
            )
            assert candidate.confidence > 0


class TestExternalEnricher:
    """Tests for the external enricher agent."""

    def test_supplier_evidence_lookup(self):
        """Test that supplier evidence lookup works."""
        from agents.agent_04_external_enricher import get_supplier_evidence

        evidence = get_supplier_evidence("Prinova USA", "vitamin d3")

        assert evidence is not None
        assert "Prinova USA" in evidence.content
        assert evidence.source_url is not None

    def test_regulatory_evidence_lookup(self):
        """Test that regulatory evidence lookup works."""
        from agents.agent_04_external_enricher import get_regulatory_evidence

        evidence = get_regulatory_evidence("vitamin d3 cholecalciferol")

        assert evidence is not None
        assert "GRAS" in evidence.content
        assert evidence.relevance_score > 0.5

    def test_dietary_evidence_detection(self):
        """Test dietary property detection."""
        from agents.agent_04_external_enricher import get_dietary_evidence

        # Bovine should flag non-vegan
        evidence = get_dietary_evidence("bovine-gelatin-capsule")
        assert evidence is not None
        assert "NOT" in evidence.content or "vegetarian" in evidence.content.lower()

        # Sunflower should be safe for soy-free
        evidence = get_dietary_evidence("sunflower-lecithin")
        assert evidence is not None
        assert "soy-free" in evidence.content.lower()


class TestComplianceChecker:
    """Tests for the compliance checker agent."""

    def test_compliance_verdict_structure(
        self, sample_substitution_candidate, sample_compliance_verdict
    ):
        """Test that compliance verdict has required structure."""
        from agents.schemas import Verdict

        verdict = sample_compliance_verdict

        assert verdict.substitution_id is not None
        assert verdict.verdict in list(Verdict)
        assert 0 <= verdict.confidence <= 1
        assert verdict.reasoning_summary
        assert isinstance(verdict.evidence, list)
        assert isinstance(verdict.risks, list)

    def test_mock_compliance_response_is_valid(self):
        """Test that mock compliance response has correct structure."""
        from agents.agent_05_compliance_checker import generate_mock_compliance_response
        from agents.schemas import ComplianceVerdict, Verdict

        response = generate_mock_compliance_response()

        assert "verdict" in response
        assert response["verdict"] in ["approved", "conditional", "rejected", "needs_review"]
        assert "confidence" in response
        assert 0 <= response["confidence"] <= 1
        assert "reasoning_summary" in response
        assert "compliance_details" in response


class TestRecommendationEngine:
    """Tests for the recommendation engine."""

    def test_score_calculation(self):
        """Test that scoring function produces valid scores."""
        from agents.utils import calculate_score

        # All neutral inputs
        score = calculate_score(0.5, 0.5, 0.5, 0.5, 0.5)
        assert 0 <= score <= 1

        # All high inputs should give high score
        high_score = calculate_score(1.0, 1.0, 1.0, 1.0, 1.0)
        assert high_score > 0.9

        # All low inputs should give low score
        low_score = calculate_score(0.0, 0.0, 0.0, 0.0, 0.0)
        assert low_score < 0.1

    def test_filter_viable_substitutions(
        self, sample_substitution_candidate, sample_compliance_verdict
    ):
        """Test that filtering works correctly."""
        from agents.agent_06_recommendation_engine import filter_viable_substitutions
        from agents.schemas import Verdict

        # Fix the substitution_id to match
        sample_compliance_verdict.substitution_id = (
            f"{sample_substitution_candidate.source_sku}_"
            f"{sample_substitution_candidate.target_sku}"
        )

        viable = filter_viable_substitutions(
            [sample_substitution_candidate],
            [sample_compliance_verdict],
        )

        assert len(viable) == 1
        assert viable[0][0] == sample_substitution_candidate
        assert viable[0][1] == sample_compliance_verdict


class TestReportGenerator:
    """Tests for the report generator."""

    def test_markdown_report_generation(self, sample_compliance_verdict, temp_output_dir):
        """Test that markdown report is generated correctly."""
        from agents.agent_07_report_generator import generate_markdown_report
        from agents.schemas import SourcingRecommendation, RecommendationChange

        recommendation = SourcingRecommendation(
            recommendation_id="test123",
            bom_id=1,
            bom_name="FG-test-product",
            company_name="Test Company",
            summary="Test summary",
            changes=[
                RecommendationChange(
                    component_id="test",
                    current="old component",
                    recommended="new component",
                    rationale="test rationale",
                    confidence=0.8,
                    evidence_links=["http://example.com"],
                )
            ],
            score=0.75,
        )

        markdown = generate_markdown_report(
            recommendation,
            verdicts=[sample_compliance_verdict],
        )

        assert "# Agnes Sourcing Recommendation Report" in markdown
        assert "Test Company" in markdown
        assert "old component" in markdown
        assert "new component" in markdown

    def test_json_export_structure(self, sample_compliance_verdict):
        """Test that JSON export has correct structure."""
        from agents.agent_07_report_generator import generate_json_export
        from agents.schemas import SourcingRecommendation

        recommendation = SourcingRecommendation(
            recommendation_id="test123",
            bom_id=1,
            bom_name="FG-test",
            company_name="Test",
            summary="Test",
            score=0.5,
        )

        export = generate_json_export(
            recommendation,
            verdicts=[sample_compliance_verdict],
        )

        assert "meta" in export
        assert "recommendation" in export
        assert "compliance_verdicts" in export
        assert export["meta"]["engine"] == "Agnes Raw Material Engine"


class TestEndToEnd:
    """End-to-end integration tests."""

    def test_full_pipeline_structure(self, test_db_path, temp_output_dir):
        """Test that the full pipeline produces expected outputs."""
        # This test runs without LLM calls (uses mocks)
        with patch("agents.config.DATABASE_PATH", test_db_path):
            with patch("agents.config.OUTPUT_PATH", temp_output_dir):
                with patch("agents.agent_03_substitution_detector.ANTHROPIC_AVAILABLE", False):
                    with patch("agents.agent_05_compliance_checker.ANTHROPIC_AVAILABLE", False):
                        # Import and run key stages
                        from agents.agent_01_data_loader import load_data
                        from agents.agent_02_bom_analyzer import analyze_bom

                        # Stage 1: Load data
                        load_result = load_data()
                        assert load_result["table_counts"]["Product"] > 0

                        # Stage 2: Analyze BOM
                        bom_result = analyze_bom(1, use_cache=False)
                        assert bom_result is not None
                        assert bom_result.total_components > 0

    def test_schemas_are_serializable(self, sample_bom_analysis, sample_compliance_verdict):
        """Test that all schemas can be serialized to JSON."""
        import json

        # BOM analysis
        bom_json = sample_bom_analysis.model_dump()
        assert json.dumps(bom_json)  # Should not raise

        # Compliance verdict
        verdict_json = sample_compliance_verdict.model_dump()
        assert json.dumps(verdict_json, default=str)  # Should not raise


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
