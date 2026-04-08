"""
Agnes Raw Material Engine - Agent 01: Data Loader

Loads the SQL database, validates the schema, extends it with additional tables,
and prints a summary of what was loaded.
"""

import sqlite3
from pathlib import Path

from . import config
from .utils import get_logger, get_db_connection, timestamp

logger = get_logger(__name__)

EXTENDED_SCHEMA_SQL = """
-- Extended schema for Agnes pipeline

CREATE TABLE IF NOT EXISTS Component_Normalized (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RawProductId INTEGER NOT NULL,
    NormalizedName TEXT NOT NULL,
    Category TEXT NOT NULL,
    SubCategory TEXT,
    FOREIGN KEY (RawProductId) REFERENCES Product(Id)
);

CREATE TABLE IF NOT EXISTS Substitution_Candidate (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceProductId INTEGER NOT NULL,
    TargetProductId INTEGER NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningSummary TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SourceProductId) REFERENCES Product(Id),
    FOREIGN KEY (TargetProductId) REFERENCES Product(Id)
);

CREATE TABLE IF NOT EXISTS External_Evidence (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER,
    SupplierId INTEGER,
    SourceType TEXT NOT NULL,
    SourceUrl TEXT,
    Content TEXT NOT NULL,
    RelevanceScore REAL,
    FetchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProductId) REFERENCES Product(Id),
    FOREIGN KEY (SupplierId) REFERENCES Supplier(Id)
);

CREATE TABLE IF NOT EXISTS Compliance_Verdict (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SubstitutionCandidateId INTEGER NOT NULL,
    Verdict TEXT NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningJson TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SubstitutionCandidateId) REFERENCES Substitution_Candidate(Id)
);

CREATE TABLE IF NOT EXISTS Sourcing_Recommendation (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BOMId INTEGER NOT NULL,
    RecommendationJson TEXT NOT NULL,
    Score REAL NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BOMId) REFERENCES BOM(Id)
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_normalized_name ON Component_Normalized(NormalizedName);
CREATE INDEX IF NOT EXISTS idx_normalized_category ON Component_Normalized(Category);
CREATE INDEX IF NOT EXISTS idx_evidence_product ON External_Evidence(ProductId);
CREATE INDEX IF NOT EXISTS idx_evidence_supplier ON External_Evidence(SupplierId);
"""


def validate_base_schema(conn: sqlite3.Connection) -> bool:
    """Validate that required base tables exist."""
    required_tables = ["Company", "Product", "BOM", "BOM_Component", "Supplier", "Supplier_Product"]

    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )
    existing_tables = {row[0] for row in cursor.fetchall()}

    missing = set(required_tables) - existing_tables
    if missing:
        logger.error(f"Missing required tables: {missing}")
        return False

    logger.info(f"[{timestamp()}] Base schema validated: all required tables present")
    return True


def extend_schema(conn: sqlite3.Connection) -> None:
    """Create extended tables for the Agnes pipeline."""
    logger.info(f"[{timestamp()}] Extending database schema...")
    conn.executescript(EXTENDED_SCHEMA_SQL)
    conn.commit()
    logger.info(f"[{timestamp()}] Schema extended successfully")


def get_table_counts(conn: sqlite3.Connection) -> dict:
    """Get row counts for all tables."""
    tables = ["Company", "Product", "BOM", "BOM_Component", "Supplier", "Supplier_Product",
              "Component_Normalized", "Substitution_Candidate", "External_Evidence",
              "Compliance_Verdict", "Sourcing_Recommendation"]

    counts = {}
    for table in tables:
        try:
            cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            counts[table] = 0

    return counts


def get_product_type_breakdown(conn: sqlite3.Connection) -> dict:
    """Get breakdown of products by type."""
    cursor = conn.execute(
        "SELECT Type, COUNT(*) FROM Product GROUP BY Type"
    )
    return {row[0]: row[1] for row in cursor.fetchall()}


def get_top_suppliers(conn: sqlite3.Connection, limit: int = 10) -> list[tuple[str, int]]:
    """Get top suppliers by product count."""
    cursor = conn.execute("""
        SELECT s.Name, COUNT(DISTINCT sp.ProductId) as ProductCount
        FROM Supplier s
        JOIN Supplier_Product sp ON s.Id = sp.SupplierId
        GROUP BY s.Id
        ORDER BY ProductCount DESC
        LIMIT ?
    """, (limit,))
    return [(row[0], row[1]) for row in cursor.fetchall()]


def get_bom_summary(conn: sqlite3.Connection) -> dict:
    """Get BOM complexity summary."""
    cursor = conn.execute("""
        SELECT
            MIN(ComponentCount) as min_components,
            MAX(ComponentCount) as max_components,
            AVG(ComponentCount) as avg_components
        FROM (
            SELECT BOMId, COUNT(*) as ComponentCount
            FROM BOM_Component
            GROUP BY BOMId
        )
    """)
    row = cursor.fetchone()
    return {
        "min_components": row[0],
        "max_components": row[1],
        "avg_components": round(row[2], 1) if row[2] else 0,
    }


def print_summary(counts: dict, product_breakdown: dict, top_suppliers: list, bom_summary: dict) -> None:
    """Print a formatted summary of the loaded data."""
    print("\n" + "=" * 60)
    print("AGNES DATA LOADER - DATABASE SUMMARY")
    print("=" * 60)

    print("\n📊 TABLE ROW COUNTS:")
    print("-" * 40)
    for table, count in counts.items():
        status = "✓" if count > 0 else "○"
        print(f"  {status} {table}: {count:,}")

    print("\n📦 PRODUCT BREAKDOWN:")
    print("-" * 40)
    for ptype, count in product_breakdown.items():
        print(f"  • {ptype}: {count:,}")

    print("\n🏭 TOP SUPPLIERS:")
    print("-" * 40)
    for name, count in top_suppliers[:5]:
        print(f"  • {name}: {count} products")

    print("\n📋 BOM COMPLEXITY:")
    print("-" * 40)
    print(f"  • Min components per BOM: {bom_summary['min_components']}")
    print(f"  • Max components per BOM: {bom_summary['max_components']}")
    print(f"  • Avg components per BOM: {bom_summary['avg_components']}")

    print("\n" + "=" * 60)
    print(f"✓ Data loaded successfully at {timestamp()}")
    print("=" * 60 + "\n")


def load_data() -> dict:
    """
    Main function to load and validate the database.

    Returns:
        dict with summary statistics
    """
    logger.info(f"[{timestamp()}] Starting data loader...")
    logger.info(f"[{timestamp()}] Database path: {config.DATABASE_PATH}")

    # Check database exists
    if not Path(config.DATABASE_PATH).exists():
        raise FileNotFoundError(f"Database not found at {config.DATABASE_PATH}")

    # Connect and validate
    conn = get_db_connection()

    if not validate_base_schema(conn):
        conn.close()
        raise ValueError("Base schema validation failed")

    # Extend schema
    extend_schema(conn)

    # Gather statistics
    counts = get_table_counts(conn)
    product_breakdown = get_product_type_breakdown(conn)
    top_suppliers = get_top_suppliers(conn)
    bom_summary = get_bom_summary(conn)

    conn.close()

    # Print summary
    print_summary(counts, product_breakdown, top_suppliers, bom_summary)

    return {
        "table_counts": counts,
        "product_breakdown": product_breakdown,
        "top_suppliers": top_suppliers,
        "bom_summary": bom_summary,
        "loaded_at": timestamp(),
    }


def main():
    """Entry point for standalone execution."""
    try:
        result = load_data()
        logger.info(f"[{timestamp()}] Data loader completed successfully")
        return result
    except Exception as e:
        logger.error(f"[{timestamp()}] Data loader failed: {e}")
        raise


if __name__ == "__main__":
    main()
