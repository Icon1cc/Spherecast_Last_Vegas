"""
Agnes Raw Material Engine - Utility Functions

Common utilities for logging, database access, LLM calls, and caching.
"""

import json
import logging
import sqlite3
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from functools import wraps
import time

from . import config

# Set up logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)


def get_db_connection() -> sqlite3.Connection:
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def timestamp() -> str:
    """Get current timestamp string."""
    return datetime.now().isoformat()


def hash_string(s: str) -> str:
    """Generate a short hash for a string."""
    return hashlib.md5(s.encode()).hexdigest()[:8]


def load_json_cache(cache_key: str) -> Optional[dict]:
    """Load cached data if available."""
    cache_file = config.CACHE_PATH / f"{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, "r") as f:
            return json.load(f)
    return None


def save_json_cache(cache_key: str, data: dict) -> None:
    """Save data to cache."""
    config.CACHE_PATH.mkdir(parents=True, exist_ok=True)
    cache_file = config.CACHE_PATH / f"{cache_key}.json"
    with open(cache_file, "w") as f:
        json.dump(data, f, indent=2, default=str)


def retry_with_backoff(max_retries: int = 3, base_delay: float = 1.0):
    """Decorator for retrying functions with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        time.sleep(delay)
            raise last_exception
        return wrapper
    return decorator


def extract_component_name(sku: str) -> str:
    """
    Extract human-readable component name from SKU.

    Example: RM-C28-vitamin-d3-cholecalciferol-8956b79c -> vitamin d3 cholecalciferol
    """
    if not sku.startswith("RM-"):
        return sku

    # Remove RM-Cxx- prefix and hash suffix
    parts = sku.split("-")
    if len(parts) < 3:
        return sku

    # Skip first two parts (RM, Cxx) and last part (hash)
    name_parts = parts[2:-1]
    return " ".join(name_parts).replace("-", " ")


def categorize_component(name: str) -> tuple[str, Optional[str]]:
    """
    Categorize a component based on its name.
    Returns (category, sub_category).
    """
    name_lower = name.lower()

    # Vitamins
    if "vitamin" in name_lower:
        if "vitamin-d" in name_lower or "cholecalciferol" in name_lower:
            return ("vitamin", "vitamin_d")
        elif "vitamin-c" in name_lower or "ascorbic" in name_lower:
            return ("vitamin", "vitamin_c")
        elif "vitamin-b" in name_lower:
            return ("vitamin", "vitamin_b")
        elif "vitamin-e" in name_lower or "tocopherol" in name_lower:
            return ("vitamin", "vitamin_e")
        elif "vitamin-a" in name_lower or "retinol" in name_lower:
            return ("vitamin", "vitamin_a")
        elif "vitamin-k" in name_lower:
            return ("vitamin", "vitamin_k")
        return ("vitamin", None)

    # Minerals
    if any(m in name_lower for m in ["magnesium", "calcium", "zinc", "iron", "selenium", "copper", "manganese", "chromium", "potassium", "sodium"]):
        mineral = next(m for m in ["magnesium", "calcium", "zinc", "iron", "selenium", "copper", "manganese", "chromium", "potassium", "sodium"] if m in name_lower)
        return ("mineral", mineral)

    # Proteins
    if any(p in name_lower for p in ["protein", "whey", "casein", "collagen"]):
        if "whey" in name_lower:
            if "isolate" in name_lower:
                return ("protein", "whey_isolate")
            elif "concentrate" in name_lower:
                return ("protein", "whey_concentrate")
            return ("protein", "whey")
        elif "collagen" in name_lower:
            return ("protein", "collagen")
        return ("protein", None)

    # Capsules
    if any(c in name_lower for c in ["capsule", "gelatin", "softgel", "hypromellose"]):
        if "bovine" in name_lower:
            return ("capsule", "bovine_gelatin")
        elif "vegetarian" in name_lower:
            return ("capsule", "vegetarian")
        elif "vegan" in name_lower or "hypromellose" in name_lower:
            return ("capsule", "vegan")
        elif "plantgel" in name_lower:
            return ("capsule", "plant_based")
        return ("capsule", "gelatin")

    # Fatty acids / oils
    if any(f in name_lower for f in ["omega", "fish", "oil", "mct", "dha", "epa"]):
        if "omega" in name_lower or "fish" in name_lower:
            return ("fatty_acid", "omega_3")
        elif "mct" in name_lower:
            return ("fatty_acid", "mct")
        return ("fatty_acid", None)

    # Lecithin
    if "lecithin" in name_lower:
        if "soy" in name_lower:
            return ("excipient", "soy_lecithin")
        elif "sunflower" in name_lower:
            return ("excipient", "sunflower_lecithin")
        return ("excipient", "lecithin")

    # Sweeteners
    if any(s in name_lower for s in ["sucralose", "stevia", "aspartame", "sweetener", "sugar", "monk fruit"]):
        return ("sweetener", None)

    # Flavors
    if "flavor" in name_lower:
        return ("flavor", None)

    return ("other", None)


def detect_allergen(name: str) -> tuple[bool, Optional[str]]:
    """Detect if a component is an allergen."""
    name_lower = name.lower()

    allergen_map = {
        "soy": ["soy", "soya"],
        "dairy": ["whey", "casein", "milk", "lactose"],
        "fish": ["fish", "anchovy", "sardine"],
        "shellfish": ["shellfish", "shrimp", "crab"],
        "tree_nuts": ["almond", "walnut", "cashew", "hazelnut"],
        "peanuts": ["peanut"],
        "wheat": ["wheat", "gluten"],
        "eggs": ["egg"],
    }

    for allergen_type, keywords in allergen_map.items():
        if any(kw in name_lower for kw in keywords):
            return (True, allergen_type)

    return (False, None)


def detect_dietary_properties(name: str) -> dict:
    """Detect dietary properties from component name."""
    name_lower = name.lower()

    properties = {
        "is_vegan": None,
        "is_vegetarian": None,
        "is_organic": None,
    }

    # Vegan indicators
    if any(v in name_lower for v in ["vegan", "plant-based", "plantgel"]):
        properties["is_vegan"] = True
        properties["is_vegetarian"] = True
    elif any(nv in name_lower for nv in ["bovine", "gelatin", "fish", "whey", "casein"]):
        properties["is_vegan"] = False
        if "bovine" in name_lower or "gelatin" in name_lower:
            properties["is_vegetarian"] = False

    # Organic indicators
    if "organic" in name_lower:
        properties["is_organic"] = True

    return properties


def format_currency(amount: Optional[float]) -> str:
    """Format a number as currency."""
    if amount is None:
        return "Unknown"
    return f"${amount:,.2f}"


def calculate_score(
    cost_advantage: float = 0.5,
    consolidation: float = 0.5,
    compliance: float = 0.5,
    evidence_quality: float = 0.5,
    feasibility: float = 0.5,
) -> float:
    """
    Calculate weighted recommendation score.
    All inputs should be 0-1 normalized.
    """
    weights = config.SCORING_WEIGHTS

    score = (
        weights["cost_advantage"] * cost_advantage +
        weights["supplier_consolidation"] * consolidation +
        weights["compliance_confidence"] * compliance +
        weights["evidence_quality"] * evidence_quality +
        weights["operational_feasibility"] * feasibility
    )

    return round(score, 3)
