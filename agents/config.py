"""
Agnes Raw Material Engine - Shared Configuration

This module contains all configuration settings, constants, and environment
variable loading for the Agnes pipeline.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATABASE_PATH = os.getenv("DATABASE_PATH", str(DATA_DIR / "db.sqlite"))
CHROMA_PATH = os.getenv("CHROMA_PATH", str(DATA_DIR / "chroma"))
CACHE_PATH = DATA_DIR / "cache"
OUTPUT_PATH = PROJECT_ROOT / "output"

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Model Configuration
LLM_MODEL = "claude-sonnet-4-20250514"
LLM_MODEL_FAST = "claude-3-haiku-20240307"
EMBEDDING_MODEL = "text-embedding-3-small"

# Confidence Thresholds
CONFIDENCE_HIGH = 0.85
CONFIDENCE_MEDIUM = 0.65
CONFIDENCE_LOW = 0.40
CONFIDENCE_INSUFFICIENT = 0.20

# Scoring Weights for Recommendations
SCORING_WEIGHTS = {
    "cost_advantage": 0.20,
    "supplier_consolidation": 0.25,
    "compliance_confidence": 0.30,
    "evidence_quality": 0.15,
    "operational_feasibility": 0.10,
}

# Component Categories
COMPONENT_CATEGORIES = [
    "vitamin",
    "mineral",
    "protein",
    "amino_acid",
    "fatty_acid",
    "capsule",
    "excipient",
    "sweetener",
    "flavor",
    "preservative",
    "other",
]

# Allergen Types
ALLERGEN_TYPES = [
    "soy",
    "dairy",
    "fish",
    "shellfish",
    "tree_nuts",
    "peanuts",
    "wheat",
    "eggs",
]

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Rate Limiting
LLM_REQUESTS_PER_MINUTE = 50
LLM_RETRY_ATTEMPTS = 3
LLM_RETRY_DELAY_SECONDS = 2
