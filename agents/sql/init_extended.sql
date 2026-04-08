-- Agnes Raw Material Engine - Extended Schema
-- Run this to extend the existing database with pipeline tables

PRAGMA foreign_keys = ON;

-- Store normalized component names for substitution matching
CREATE TABLE IF NOT EXISTS Component_Normalized (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    RawProductId INTEGER NOT NULL,
    NormalizedName TEXT NOT NULL,
    Category TEXT NOT NULL,
    SubCategory TEXT,
    FOREIGN KEY (RawProductId) REFERENCES Product(Id)
);

-- Store substitution candidates with confidence
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

-- Store external evidence
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

-- Store compliance verdicts
CREATE TABLE IF NOT EXISTS Compliance_Verdict (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SubstitutionCandidateId INTEGER NOT NULL,
    Verdict TEXT NOT NULL,
    Confidence REAL NOT NULL,
    ReasoningJson TEXT NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (SubstitutionCandidateId) REFERENCES Substitution_Candidate(Id)
);

-- Store final recommendations
CREATE TABLE IF NOT EXISTS Sourcing_Recommendation (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BOMId INTEGER NOT NULL,
    RecommendationJson TEXT NOT NULL,
    Score REAL NOT NULL,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (BOMId) REFERENCES BOM(Id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_normalized_name ON Component_Normalized(NormalizedName);
CREATE INDEX IF NOT EXISTS idx_normalized_category ON Component_Normalized(Category);
CREATE INDEX IF NOT EXISTS idx_evidence_product ON External_Evidence(ProductId);
CREATE INDEX IF NOT EXISTS idx_evidence_supplier ON External_Evidence(SupplierId);
