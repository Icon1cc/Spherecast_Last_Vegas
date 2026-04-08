CREATE TABLE IF NOT EXISTS company (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES company(id),
  type TEXT NOT NULL CHECK (type IN ('finished-good', 'raw-material'))
);

CREATE TABLE IF NOT EXISTS bom (
  id SERIAL PRIMARY KEY,
  produced_product_id INTEGER NOT NULL UNIQUE REFERENCES product(id)
);

CREATE TABLE IF NOT EXISTS bom_component (
  bom_id INTEGER NOT NULL REFERENCES bom(id),
  consumed_product_id INTEGER NOT NULL REFERENCES product(id),
  PRIMARY KEY (bom_id, consumed_product_id)
);

CREATE TABLE IF NOT EXISTS supplier (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_product (
  supplier_id INTEGER NOT NULL REFERENCES supplier(id),
  product_id INTEGER NOT NULL REFERENCES product(id),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE TABLE IF NOT EXISTS component_normalized (
  id SERIAL PRIMARY KEY,
  raw_product_id INTEGER NOT NULL REFERENCES product(id),
  normalized_name TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT
);

CREATE TABLE IF NOT EXISTS substitution_candidate (
  id SERIAL PRIMARY KEY,
  source_product_id INTEGER NOT NULL REFERENCES product(id),
  target_product_id INTEGER NOT NULL REFERENCES product(id),
  confidence REAL NOT NULL,
  reasoning_summary TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS external_evidence (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES product(id),
  supplier_id INTEGER REFERENCES supplier(id),
  source_type TEXT NOT NULL,
  source_url TEXT,
  content TEXT NOT NULL,
  relevance_score REAL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_verdict (
  id SERIAL PRIMARY KEY,
  substitution_candidate_id INTEGER NOT NULL REFERENCES substitution_candidate(id),
  verdict TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sourcing_recommendation (
  id SERIAL PRIMARY KEY,
  bom_id INTEGER NOT NULL REFERENCES bom(id),
  recommendation_json JSONB NOT NULL,
  score REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_session (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_message (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_analysis_preference (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id INTEGER REFERENCES product(id),
  price_weight INTEGER DEFAULT 5 CHECK (price_weight BETWEEN 1 AND 10),
  quality_weight INTEGER DEFAULT 5 CHECK (quality_weight BETWEEN 1 AND 10),
  compliance_weight INTEGER DEFAULT 5 CHECK (compliance_weight BETWEEN 1 AND 10),
  supplier_consolidation_weight INTEGER DEFAULT 5 CHECK (supplier_consolidation_weight BETWEEN 1 AND 10),
  lead_time_weight INTEGER DEFAULT 5 CHECK (lead_time_weight BETWEEN 1 AND 10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_type ON product(type);
CREATE INDEX IF NOT EXISTS idx_product_company ON product(company_id);
CREATE INDEX IF NOT EXISTS idx_bom_component_bom ON bom_component(bom_id);
CREATE INDEX IF NOT EXISTS idx_supplier_product_supplier ON supplier_product(supplier_id);
CREATE INDEX IF NOT EXISTS idx_component_normalized_name ON component_normalized(normalized_name);
CREATE INDEX IF NOT EXISTS idx_chat_session_user ON chat_session(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_session ON chat_message(session_id);
