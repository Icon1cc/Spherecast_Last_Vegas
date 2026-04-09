-- Agnes enrichment schema for PostgreSQL
-- Run: psql $POSTGRES_URL -f migrations/002_enrichment_postgres.sql

-- ingredient_profile: one row per unique CAS number
-- Stores compliance/regulatory facts once per compound,
-- avoiding duplication across the 17+ Product rows for the same ingredient.
CREATE TABLE IF NOT EXISTS ingredient_profile (
  cas_number          TEXT PRIMARY KEY,
  canonical_name      TEXT NOT NULL,
  functional_role     TEXT,           -- 'active' | 'excipient' | 'processing_aid' | 'unknown'
  patent_lock         TEXT,           -- 'yes' | 'no' | 'uncertain' | 'unknown'
  single_manufacturer TEXT,           -- 'yes' | 'no' | 'unknown'
  market_ban_eu       TEXT,           -- 'permitted' | 'banned' | 'restricted' | 'unknown'
  market_ban_us       TEXT,           -- 'permitted' | 'banned' | 'restricted' | 'unknown'
  vegan_status        TEXT,           -- 'yes' | 'no' | 'uncertain' | 'unknown'
  vegetarian_status   TEXT,
  halal_status        TEXT,           -- 'certified' | 'compliant' | 'non_compliant' | 'unknown'
  kosher_status       TEXT,
  non_gmo_status      TEXT,           -- 'certified' | 'standard' | 'gmo' | 'unknown'
  organic_status      TEXT,           -- 'certified' | 'conventional' | 'unknown'
  allergen_flags      JSONB DEFAULT '[]',
  label_form_claim    TEXT,
  health_claim_form   TEXT,
  enriched_at         TIMESTAMPTZ,
  pipeline_version    TEXT DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_ingredient_profile_role
  ON ingredient_profile(functional_role);

CREATE INDEX IF NOT EXISTS idx_ingredient_profile_vegan
  ON ingredient_profile(vegan_status);

CREATE INDEX IF NOT EXISTS idx_ingredient_profile_market_eu
  ON ingredient_profile(market_ban_eu);

-- component_normalized: bridge raw product_id → canonical cas_number
ALTER TABLE component_normalized
  ADD COLUMN IF NOT EXISTS cas_number TEXT REFERENCES ingredient_profile(cas_number),
  ADD COLUMN IF NOT EXISTS ingredient_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_component_normalized_cas
  ON component_normalized(cas_number);

-- supplier_product: per-(supplier, product) enrichment data
ALTER TABLE supplier_product
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS sup_url TEXT,
  ADD COLUMN IF NOT EXISTS product_page_url TEXT,
  ADD COLUMN IF NOT EXISTS spec_sheet_url TEXT,
  ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC,
  ADD COLUMN IF NOT EXISTS price_unit TEXT,
  ADD COLUMN IF NOT EXISTS price_moq TEXT,
  ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS price_as_of DATE,
  ADD COLUMN IF NOT EXISTS certifications JSONB,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
