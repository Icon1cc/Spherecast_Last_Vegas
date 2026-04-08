"""
Agnes Raw Material Engine - Agent 02: BOM Analyzer

Reads all BOMs from the database, clusters components by likely function
(e.g., omega-3 sources, emulsifiers, capsule shells), and writes a structured
JSON output of component groups with metadata.
"""

import json
from collections import defaultdict
from typing import Optional

from .schemas import (
    NormalizedComponent,
    ComponentProperties,
    ComponentGroup,
    BOMAnalysisResult,
)
from .utils import (
    get_logger,
    get_db_connection,
    timestamp,
    extract_component_name,
    categorize_component,
    detect_allergen,
    detect_dietary_properties,
    save_json_cache,
    load_json_cache,
    hash_string,
)
from . import config

logger = get_logger(__name__)


def get_bom_details(conn, bom_id: int) -> Optional[dict]:
    """Get BOM details including product and company info."""
    cursor = conn.execute("""
        SELECT
            b.Id as bom_id,
            p.Id as product_id,
            p.SKU as product_sku,
            c.Name as company_name
        FROM BOM b
        JOIN Product p ON b.ProducedProductId = p.Id
        JOIN Company c ON p.CompanyId = c.Id
        WHERE b.Id = ?
    """, (bom_id,))

    row = cursor.fetchone()
    if not row:
        return None

    return {
        "bom_id": row["bom_id"],
        "product_id": row["product_id"],
        "product_sku": row["product_sku"],
        "company_name": row["company_name"],
    }


def get_bom_components(conn, bom_id: int) -> list[dict]:
    """Get all components for a BOM with supplier info."""
    cursor = conn.execute("""
        SELECT
            p.Id as product_id,
            p.SKU as sku,
            GROUP_CONCAT(DISTINCT s.Name) as suppliers
        FROM BOM_Component bc
        JOIN Product p ON bc.ConsumedProductId = p.Id
        LEFT JOIN Supplier_Product sp ON p.Id = sp.ProductId
        LEFT JOIN Supplier s ON sp.SupplierId = s.Id
        WHERE bc.BOMId = ?
        GROUP BY p.Id
    """, (bom_id,))

    return [
        {
            "product_id": row["product_id"],
            "sku": row["sku"],
            "suppliers": row["suppliers"].split(",") if row["suppliers"] else [],
        }
        for row in cursor.fetchall()
    ]


def normalize_component(component: dict) -> NormalizedComponent:
    """Normalize a component with category and property detection."""
    sku = component["sku"]
    name = extract_component_name(sku)
    category, sub_category = categorize_component(sku)
    is_allergen, allergen_type = detect_allergen(sku)
    dietary = detect_dietary_properties(sku)

    properties = ComponentProperties(
        is_allergen=is_allergen,
        allergen_type=allergen_type,
        is_vegan=dietary["is_vegan"],
        is_vegetarian=dietary["is_vegetarian"],
        is_organic=dietary["is_organic"],
    )

    return NormalizedComponent(
        sku=sku,
        product_id=component["product_id"],
        normalized_name=name,
        category=category,
        sub_category=sub_category,
        properties=properties,
        suppliers=component["suppliers"],
    )


def cluster_components(components: list[NormalizedComponent]) -> list[ComponentGroup]:
    """Cluster components into groups by category and sub-category."""
    groups: dict[str, list[NormalizedComponent]] = defaultdict(list)

    for comp in components:
        # Create group key from category + sub_category
        group_key = comp.category
        if comp.sub_category:
            group_key = f"{comp.category}:{comp.sub_category}"
        groups[group_key].append(comp)

    result = []
    for group_key, comps in groups.items():
        parts = group_key.split(":")
        category = parts[0]
        sub_category = parts[1] if len(parts) > 1 else None

        result.append(ComponentGroup(
            group_id=hash_string(group_key),
            category=category,
            sub_category=sub_category,
            components=comps,
            count=len(comps),
        ))

    # Sort by count descending
    result.sort(key=lambda g: g.count, reverse=True)
    return result


def analyze_bom(bom_id: int, use_cache: bool = True) -> Optional[BOMAnalysisResult]:
    """
    Analyze a single BOM and return structured component groups.

    Args:
        bom_id: The BOM ID to analyze
        use_cache: Whether to use cached results

    Returns:
        BOMAnalysisResult or None if BOM not found
    """
    cache_key = f"bom_analysis_{bom_id}"

    if use_cache:
        cached = load_json_cache(cache_key)
        if cached:
            logger.info(f"[{timestamp()}] Using cached analysis for BOM {bom_id}")
            return BOMAnalysisResult(**cached)

    logger.info(f"[{timestamp()}] Analyzing BOM {bom_id}...")

    conn = get_db_connection()

    # Get BOM details
    bom_details = get_bom_details(conn, bom_id)
    if not bom_details:
        logger.warning(f"[{timestamp()}] BOM {bom_id} not found")
        conn.close()
        return None

    # Get components
    raw_components = get_bom_components(conn, bom_id)
    conn.close()

    if not raw_components:
        logger.warning(f"[{timestamp()}] BOM {bom_id} has no components")
        return None

    # Normalize components
    normalized = [normalize_component(c) for c in raw_components]

    # Cluster by category
    groups = cluster_components(normalized)

    result = BOMAnalysisResult(
        bom_id=bom_id,
        product_sku=bom_details["product_sku"],
        company_name=bom_details["company_name"],
        total_components=len(normalized),
        component_groups=groups,
    )

    # Cache result
    save_json_cache(cache_key, result.model_dump())

    return result


def analyze_all_boms(limit: Optional[int] = None) -> list[BOMAnalysisResult]:
    """Analyze all BOMs in the database."""
    conn = get_db_connection()

    query = "SELECT Id FROM BOM ORDER BY Id"
    if limit:
        query += f" LIMIT {limit}"

    cursor = conn.execute(query)
    bom_ids = [row[0] for row in cursor.fetchall()]
    conn.close()

    logger.info(f"[{timestamp()}] Analyzing {len(bom_ids)} BOMs...")

    results = []
    for bom_id in bom_ids:
        result = analyze_bom(bom_id)
        if result:
            results.append(result)

    return results


def print_analysis_summary(results: list[BOMAnalysisResult]) -> None:
    """Print a summary of the BOM analysis."""
    print("\n" + "=" * 60)
    print("BOM ANALYZER - ANALYSIS SUMMARY")
    print("=" * 60)

    print(f"\n📋 Analyzed {len(results)} BOMs")

    # Aggregate category stats
    category_counts: dict[str, int] = defaultdict(int)
    for result in results:
        for group in result.component_groups:
            key = group.category
            if group.sub_category:
                key = f"{group.category}:{group.sub_category}"
            category_counts[key] += group.count

    print("\n📊 COMPONENT CATEGORIES (across all BOMs):")
    print("-" * 40)
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1])[:15]:
        print(f"  • {cat}: {count}")

    # Sample detailed view
    if results:
        sample = results[0]
        print(f"\n📦 SAMPLE BOM DETAIL: {sample.product_sku}")
        print(f"   Company: {sample.company_name}")
        print(f"   Components: {sample.total_components}")
        print("   Groups:")
        for group in sample.component_groups:
            sub = f" ({group.sub_category})" if group.sub_category else ""
            print(f"     - {group.category}{sub}: {group.count} components")

    print("\n" + "=" * 60)
    print(f"✓ Analysis completed at {timestamp()}")
    print("=" * 60 + "\n")


def main():
    """Entry point for standalone execution."""
    logger.info(f"[{timestamp()}] Starting BOM analyzer...")

    try:
        # Analyze first 20 BOMs for demo
        results = analyze_all_boms(limit=20)

        # Print summary
        print_analysis_summary(results)

        # Save full output
        output_path = config.OUTPUT_PATH / "bom_analysis.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w") as f:
            json.dump([r.model_dump() for r in results], f, indent=2)

        logger.info(f"[{timestamp()}] Results saved to {output_path}")

        return results

    except Exception as e:
        logger.error(f"[{timestamp()}] BOM analyzer failed: {e}")
        raise


if __name__ == "__main__":
    main()
