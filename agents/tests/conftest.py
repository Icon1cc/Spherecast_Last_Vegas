"""
Pytest configuration and fixtures for Agnes tests.
"""

import pytest
import sqlite3
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
# Add agents directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


@pytest.fixture
def test_db_path():
    """Return path to the test database."""
    db_path = Path(__file__).parent.parent.parent / "data" / "db.sqlite"
    if not db_path.exists():
        pytest.skip("Test database not found")
    return str(db_path)


@pytest.fixture
def mock_anthropic():
    """Mock the Anthropic client for tests without API keys."""
    with patch("anthropic.Anthropic") as mock:
        mock_instance = MagicMock()
        mock.return_value = mock_instance

        # Mock response
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='{"substitution_candidates": []}')]
        mock_instance.messages.create.return_value = mock_response

        yield mock_instance


@pytest.fixture
def sample_bom_analysis():
    """Create a sample BOM analysis result for testing."""
    from agents.schemas import (
        BOMAnalysisResult,
        ComponentGroup,
        NormalizedComponent,
        ComponentProperties,
    )

    return BOMAnalysisResult(
        bom_id=1,
        product_sku="FG-iherb-10421",
        company_name="NOW Foods",
        total_components=4,
        component_groups=[
            ComponentGroup(
                group_id="test123",
                category="vitamin",
                sub_category="vitamin_d",
                components=[
                    NormalizedComponent(
                        sku="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
                        product_id=100,
                        normalized_name="vitamin d3 cholecalciferol",
                        category="vitamin",
                        sub_category="vitamin_d",
                        properties=ComponentProperties(),
                        suppliers=["Prinova USA", "PureBulk"],
                    )
                ],
                count=1,
            )
        ],
    )


@pytest.fixture
def sample_substitution_candidate():
    """Create a sample substitution candidate for testing."""
    from agents.schemas import SubstitutionCandidate, AllergenChange

    return SubstitutionCandidate(
        source_sku="RM-C28-vitamin-d3-cholecalciferol-8956b79c",
        source_name="vitamin d3 cholecalciferol",
        target_sku="RM-C30-vitamin-d3-cholecalciferol-559c9699",
        target_name="vitamin d3 cholecalciferol",
        confidence=0.85,
        reasoning_summary="Same active ingredient from different supplier",
        functional_match=True,
        form_compatible=True,
        allergen_change=AllergenChange.NONE,
        dietary_change=AllergenChange.NONE,
        risks=["Verify potency matches"],
        assumptions=["Similar purity levels"],
    )


@pytest.fixture
def sample_compliance_verdict():
    """Create a sample compliance verdict for testing."""
    from agents.schemas import (
        ComplianceVerdict,
        Verdict,
        Evidence,
        EvidenceType,
        ComplianceDetail,
    )

    return ComplianceVerdict(
        substitution_id="RM-C28-vitamin-d3_RM-C30-vitamin-d3",
        verdict=Verdict.CONDITIONAL,
        confidence=0.78,
        reasoning_summary="Substitution viable pending verification",
        evidence=[
            Evidence(
                source="FDA GRAS Database",
                type=EvidenceType.STRUCTURED_DATA,
                content="Vitamin D3 is GRAS",
                relevance_score=0.95,
            )
        ],
        compliance_details={
            "regulatory": ComplianceDetail(status="pass", notes="GRAS status confirmed"),
        },
        conditions=["Verify potency"],
        risks=["Bioavailability variation"],
        missing_data=["Certificate of analysis"],
    )


@pytest.fixture
def temp_output_dir():
    """Create a temporary directory for test outputs."""
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)
