"""
Agnes Raw Material Engine - Pydantic Schemas

This module defines all structured data schemas used throughout the pipeline
for consistent data validation and serialization.
"""

from typing import Optional
from pydantic import BaseModel, Field
from enum import Enum


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


class Verdict(str, Enum):
    APPROVED = "approved"
    CONDITIONAL = "conditional"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"


class EvidenceType(str, Enum):
    STRUCTURED_DATA = "structured_data"
    EXTERNAL_WEB = "external_web"
    HEURISTIC = "heuristic"


class AllergenChange(str, Enum):
    NONE = "none"
    IMPROVED = "improved"
    WORSENED = "worsened"


# Base Evidence Schema
class Evidence(BaseModel):
    source: str = Field(..., description="Source name or URL")
    type: EvidenceType = Field(..., description="Type of evidence")
    content: str = Field(..., description="Relevant content excerpt")
    relevance_score: float = Field(..., ge=0.0, le=1.0, description="Relevance score 0-1")


# Component Properties
class ComponentProperties(BaseModel):
    is_allergen: bool = False
    allergen_type: Optional[str] = None
    is_vegan: Optional[bool] = None
    is_vegetarian: Optional[bool] = None
    is_organic: Optional[bool] = None


# Normalized Component
class NormalizedComponent(BaseModel):
    sku: str
    product_id: int
    normalized_name: str
    category: str
    sub_category: Optional[str] = None
    properties: ComponentProperties = Field(default_factory=ComponentProperties)
    suppliers: list[str] = Field(default_factory=list)


# Component Group (output of BOM Analyzer)
class ComponentGroup(BaseModel):
    group_id: str
    category: str
    sub_category: Optional[str] = None
    components: list[NormalizedComponent]
    count: int


# BOM Analysis Result
class BOMAnalysisResult(BaseModel):
    bom_id: int
    product_sku: str
    company_name: str
    total_components: int
    component_groups: list[ComponentGroup]


# Substitution Candidate
class SubstitutionCandidate(BaseModel):
    source_sku: str
    source_name: str
    target_sku: str
    target_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning_summary: str
    functional_match: bool = True
    form_compatible: bool = True
    allergen_change: AllergenChange = AllergenChange.NONE
    dietary_change: AllergenChange = AllergenChange.NONE
    risks: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# Substitution Detection Result
class SubstitutionDetectionResult(BaseModel):
    bom_id: int
    component_group_id: str
    substitution_candidates: list[SubstitutionCandidate]
    no_substitutes_reason: Optional[str] = None


# Compliance Detail
class ComplianceDetail(BaseModel):
    status: str = Field(..., description="pass/fail/unknown")
    notes: str


# Compliance Verdict
class ComplianceVerdict(BaseModel):
    substitution_id: str
    verdict: Verdict
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning_summary: str
    evidence: list[Evidence] = Field(default_factory=list)
    compliance_details: dict[str, ComplianceDetail] = Field(default_factory=dict)
    conditions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)


# Recommendation Change
class RecommendationChange(BaseModel):
    component_id: str
    current: str
    recommended: str
    rationale: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_links: list[str] = Field(default_factory=list)


# Recommendation Impact
class RecommendationImpact(BaseModel):
    supplier_reduction: int = 0
    compliance_confidence: str = "maintained"
    estimated_cost_impact: str = "unknown"
    lead_time_impact: str = "unknown"


# Final Sourcing Recommendation
class SourcingRecommendation(BaseModel):
    recommendation_id: str
    bom_id: int
    bom_name: str
    company_name: str
    summary: str
    changes: list[RecommendationChange] = Field(default_factory=list)
    impact: RecommendationImpact = Field(default_factory=RecommendationImpact)
    risks: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    needs_human_review: list[str] = Field(default_factory=list)
    score: float = Field(default=0.0, ge=0.0, le=1.0)


# Standardized Reasoning Schema (for all LLM outputs)
class StandardizedReasoning(BaseModel):
    """
    Standard schema for all LLM reasoning outputs.
    Enforces consistent structure for trust and explainability.
    """
    decision: str = Field(..., description="The decision or action taken")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    reasoning_summary: str = Field(..., description="Brief explanation of reasoning")
    evidence: list[Evidence] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    def get_confidence_level(self) -> ConfidenceLevel:
        if self.confidence >= 0.85:
            return ConfidenceLevel.HIGH
        elif self.confidence >= 0.65:
            return ConfidenceLevel.MEDIUM
        elif self.confidence >= 0.40:
            return ConfidenceLevel.LOW
        else:
            return ConfidenceLevel.INSUFFICIENT


# External Evidence Record
class ExternalEvidenceRecord(BaseModel):
    product_id: Optional[int] = None
    supplier_id: Optional[int] = None
    source_type: EvidenceType
    source_url: Optional[str] = None
    content: str
    relevance_score: Optional[float] = None
