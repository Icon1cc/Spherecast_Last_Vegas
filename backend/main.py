"""
Agnes Raw Material Engine - FastAPI Backend

RESTful API backend for the Agnes sourcing recommendation system.
Designed to work with a Lovable-built frontend.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import json
import sqlite3
from pathlib import Path

# Initialize FastAPI app
app = FastAPI(
    title="Agnes Raw Material Engine API",
    description="AI-powered sourcing recommendations for dietary supplements",
    version="1.0.0",
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Lovable domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "db.sqlite"


# ============ Pydantic Models for API ============

class BOMSummary(BaseModel):
    id: int
    product_sku: str
    company_name: str
    component_count: int


class ComponentInfo(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    sub_category: Optional[str] = None
    suppliers: list[str] = []


class BOMDetail(BaseModel):
    id: int
    product_sku: str
    company_name: str
    components: list[ComponentInfo]


class SubstitutionCandidate(BaseModel):
    source_component: str
    target_component: str
    confidence: float
    reasoning: str
    allergen_change: str
    dietary_change: str
    risks: list[str]


class ComplianceVerdict(BaseModel):
    substitution_id: str
    verdict: str  # approved, conditional, rejected, needs_review
    confidence: float
    reasoning: str
    conditions: list[str]
    missing_data: list[str]


class RecommendationChange(BaseModel):
    current_component: str
    recommended_component: str
    confidence: float
    rationale: str
    evidence_links: list[str]


class RecommendationImpact(BaseModel):
    supplier_reduction: int
    compliance_confidence: str
    estimated_cost_impact: str
    lead_time_impact: str


class SourcingRecommendation(BaseModel):
    recommendation_id: str
    bom_id: int
    bom_name: str
    company_name: str
    summary: str
    score: float
    changes: list[RecommendationChange]
    impact: RecommendationImpact
    risks: list[str]
    next_steps: list[str]
    needs_human_review: list[str]
    created_at: str


class AnalysisRequest(BaseModel):
    bom_id: int
    include_external_enrichment: bool = True
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class AnalysisStatus(BaseModel):
    status: str  # pending, running, completed, failed
    progress: int  # 0-100
    current_stage: str
    error: Optional[str] = None


# ============ Database Helpers ============

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def extract_component_name(sku: str) -> str:
    """Extract human-readable name from SKU."""
    if not sku.startswith("RM-"):
        return sku
    parts = sku.split("-")
    if len(parts) < 3:
        return sku
    return " ".join(parts[2:-1]).replace("-", " ").title()


# ============ API Endpoints ============

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "Agnes Raw Material Engine",
        "status": "healthy",
        "version": "1.0.0",
    }


@app.get("/api/companies", response_model=list[dict])
async def list_companies():
    """Get all companies."""
    conn = get_db_connection()
    cursor = conn.execute("SELECT Id as id, Name as name FROM Company ORDER BY Name")
    companies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return companies


@app.get("/api/suppliers", response_model=list[dict])
async def list_suppliers():
    """Get all suppliers with product counts."""
    conn = get_db_connection()
    cursor = conn.execute("""
        SELECT s.Id as id, s.Name as name, COUNT(sp.ProductId) as product_count
        FROM Supplier s
        LEFT JOIN Supplier_Product sp ON s.Id = sp.SupplierId
        GROUP BY s.Id
        ORDER BY product_count DESC
    """)
    suppliers = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return suppliers


@app.get("/api/boms", response_model=list[BOMSummary])
async def list_boms(company_id: Optional[int] = None, limit: int = 50):
    """Get list of BOMs with optional filtering."""
    conn = get_db_connection()

    query = """
        SELECT
            b.Id as id,
            p.SKU as product_sku,
            c.Name as company_name,
            COUNT(bc.ConsumedProductId) as component_count
        FROM BOM b
        JOIN Product p ON b.ProducedProductId = p.Id
        JOIN Company c ON p.CompanyId = c.Id
        LEFT JOIN BOM_Component bc ON b.Id = bc.BOMId
    """

    if company_id:
        query += f" WHERE c.Id = {company_id}"

    query += " GROUP BY b.Id ORDER BY c.Name, p.SKU LIMIT ?"

    cursor = conn.execute(query, (limit,))
    boms = [BOMSummary(**dict(row)) for row in cursor.fetchall()]
    conn.close()
    return boms


@app.get("/api/boms/{bom_id}", response_model=BOMDetail)
async def get_bom_detail(bom_id: int):
    """Get detailed BOM information including all components."""
    conn = get_db_connection()

    # Get BOM header
    cursor = conn.execute("""
        SELECT b.Id as id, p.SKU as product_sku, c.Name as company_name
        FROM BOM b
        JOIN Product p ON b.ProducedProductId = p.Id
        JOIN Company c ON p.CompanyId = c.Id
        WHERE b.Id = ?
    """, (bom_id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="BOM not found")

    bom_info = dict(row)

    # Get components
    cursor = conn.execute("""
        SELECT
            p.Id as id,
            p.SKU as sku,
            GROUP_CONCAT(DISTINCT s.Name) as suppliers
        FROM BOM_Component bc
        JOIN Product p ON bc.ConsumedProductId = p.Id
        LEFT JOIN Supplier_Product sp ON p.Id = sp.ProductId
        LEFT JOIN Supplier s ON sp.SupplierId = s.Id
        WHERE bc.BOMId = ?
        GROUP BY p.Id
    """, (bom_id,))

    components = []
    for comp_row in cursor.fetchall():
        sku = comp_row["sku"]
        name = extract_component_name(sku)

        # Simple categorization
        category = "other"
        sub_category = None
        if "vitamin" in sku.lower():
            category = "vitamin"
        elif "protein" in sku.lower() or "whey" in sku.lower():
            category = "protein"
        elif "capsule" in sku.lower() or "gelatin" in sku.lower():
            category = "capsule"
        elif "magnesium" in sku.lower() or "calcium" in sku.lower() or "zinc" in sku.lower():
            category = "mineral"

        components.append(ComponentInfo(
            id=comp_row["id"],
            sku=sku,
            name=name,
            category=category,
            sub_category=sub_category,
            suppliers=comp_row["suppliers"].split(",") if comp_row["suppliers"] else [],
        ))

    conn.close()

    return BOMDetail(
        id=bom_info["id"],
        product_sku=bom_info["product_sku"],
        company_name=bom_info["company_name"],
        components=components,
    )


@app.get("/api/boms/{bom_id}/components/categories")
async def get_component_categories(bom_id: int):
    """Get component categories for a BOM (for charts)."""
    conn = get_db_connection()
    cursor = conn.execute("""
        SELECT p.SKU FROM BOM_Component bc
        JOIN Product p ON bc.ConsumedProductId = p.Id
        WHERE bc.BOMId = ?
    """, (bom_id,))

    categories = {}
    for row in cursor.fetchall():
        sku = row[0].lower()
        if "vitamin" in sku:
            cat = "Vitamins"
        elif "protein" in sku or "whey" in sku:
            cat = "Proteins"
        elif "capsule" in sku or "gelatin" in sku:
            cat = "Capsules"
        elif "magnesium" in sku or "calcium" in sku or "zinc" in sku:
            cat = "Minerals"
        elif "flavor" in sku:
            cat = "Flavors"
        elif "oil" in sku or "lecithin" in sku:
            cat = "Oils/Emulsifiers"
        else:
            cat = "Other"

        categories[cat] = categories.get(cat, 0) + 1

    conn.close()

    # Format for chart
    return {
        "labels": list(categories.keys()),
        "values": list(categories.values()),
        "total": sum(categories.values()),
    }


@app.post("/api/analyze", response_model=dict)
async def analyze_bom(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Start analysis pipeline for a BOM.

    Returns a job ID that can be used to check status.
    """
    job_id = f"job_{request.bom_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # In a real implementation, this would queue a background task
    # For demo, we return mock results immediately

    return {
        "job_id": job_id,
        "status": "completed",  # Would be "pending" in async version
        "bom_id": request.bom_id,
    }


@app.get("/api/recommendations/{bom_id}", response_model=SourcingRecommendation)
async def get_recommendation(bom_id: int):
    """
    Get sourcing recommendation for a BOM.

    Returns cached recommendation or generates a new one.
    """
    # Get BOM info
    conn = get_db_connection()
    cursor = conn.execute("""
        SELECT b.Id, p.SKU, c.Name
        FROM BOM b
        JOIN Product p ON b.ProducedProductId = p.Id
        JOIN Company c ON p.CompanyId = c.Id
        WHERE b.Id = ?
    """, (bom_id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="BOM not found")

    bom_name = row[1]
    company_name = row[2]
    conn.close()

    # Generate mock recommendation for demo
    # In production, this would call the actual pipeline

    return SourcingRecommendation(
        recommendation_id=f"rec_{bom_id}_{datetime.now().strftime('%Y%m%d')}",
        bom_id=bom_id,
        bom_name=bom_name,
        company_name=company_name,
        summary=f"Identified 2 substitution opportunities for {bom_name}. "
                "Estimated supplier consolidation: 1 supplier reduction. "
                "Compliance confidence: High.",
        score=0.78,
        changes=[
            RecommendationChange(
                current_component="Vitamin D3 (Supplier A)",
                recommended_component="Vitamin D3 (Supplier B)",
                confidence=0.85,
                rationale="Same active ingredient with equivalent GRAS status. "
                         "Supplier B already provides 3 other components, enabling consolidation.",
                evidence_links=["FDA GRAS 21 CFR 182.5950", "Supplier B Spec Sheet"],
            ),
            RecommendationChange(
                current_component="Soy Lecithin",
                recommended_component="Sunflower Lecithin",
                confidence=0.72,
                rationale="Functionally equivalent emulsifier. Eliminates soy allergen from product, "
                         "expanding market to soy-free consumers.",
                evidence_links=["FDA GRAS 21 CFR 184.1400", "Allergen comparison study"],
            ),
        ],
        impact=RecommendationImpact(
            supplier_reduction=1,
            compliance_confidence="high",
            estimated_cost_impact="+3% (allergen-free premium)",
            lead_time_impact="unchanged",
        ),
        risks=[
            "Verify bioavailability equivalence for Vitamin D3 substitute",
            "Confirm sunflower lecithin meets viscosity specifications",
        ],
        next_steps=[
            "Request Certificate of Analysis from recommended suppliers",
            "Conduct 3-month stability study with new formulation",
            "Update product labels to reflect allergen-free status",
        ],
        needs_human_review=[
            "Sunflower lecithin pricing negotiation",
            "Customer communication plan for formula change",
        ],
        created_at=datetime.now().isoformat(),
    )


@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get summary statistics for the dashboard."""
    conn = get_db_connection()

    # Total counts
    stats = {}

    cursor = conn.execute("SELECT COUNT(*) FROM Company")
    stats["total_companies"] = cursor.fetchone()[0]

    cursor = conn.execute("SELECT COUNT(*) FROM BOM")
    stats["total_boms"] = cursor.fetchone()[0]

    cursor = conn.execute("SELECT COUNT(*) FROM Product WHERE Type = 'raw-material'")
    stats["total_raw_materials"] = cursor.fetchone()[0]

    cursor = conn.execute("SELECT COUNT(*) FROM Supplier")
    stats["total_suppliers"] = cursor.fetchone()[0]

    # Top suppliers
    cursor = conn.execute("""
        SELECT s.Name, COUNT(sp.ProductId) as count
        FROM Supplier s
        JOIN Supplier_Product sp ON s.Id = sp.SupplierId
        GROUP BY s.Id
        ORDER BY count DESC
        LIMIT 5
    """)
    stats["top_suppliers"] = [
        {"name": row[0], "product_count": row[1]}
        for row in cursor.fetchall()
    ]

    conn.close()

    return stats


# ============ Run Server ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
