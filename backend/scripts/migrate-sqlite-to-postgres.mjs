import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import dotenv from "dotenv";
import pg from "pg";

const { Pool, types } = pg;

// Keep timestamp values as raw strings to avoid silent timezone conversion.
types.setTypeParser(1114, (value) => value);
types.setTypeParser(1184, (value) => value);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

for (const candidate of [path.join(repoRoot, ".env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const configuredSqlitePath = process.env.SQLITE_PATH;
const sqlitePath = configuredSqlitePath
  ? path.isAbsolute(configuredSqlitePath)
    ? configuredSqlitePath
    : path.resolve(repoRoot, configuredSqlitePath)
  : path.resolve(repoRoot, "data/db.sqlite");
const schemaPath = path.resolve(__dirname, "sql/postgres-schema.sql");

const connectionString =
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.SUPABASE_DB_URL;

const sslRejectUnauthorized =
  process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() ?? "true";
const useInsecureSsl = sslRejectUnauthorized === "false";

let normalizedConnectionString = connectionString;
if (useInsecureSsl && connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    normalizedConnectionString = url.toString();
  } catch {
    normalizedConnectionString = connectionString;
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const truncateFirst = process.argv.includes("--truncate");

if (!connectionString) {
  console.error(
    "Missing Postgres connection string. Set POSTGRES_URL (or POSTGRES_PRISMA_URL / SUPABASE_DB_URL).",
  );
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found at ${sqlitePath}`);
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema file not found at ${schemaPath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const pool = new Pool({
  connectionString: normalizedConnectionString,
  ...(useInsecureSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

const TABLES = [
  {
    sourceTable: "Company",
    targetTable: "company",
    sourceColumns: ["Id", "Name"],
    targetColumns: ["id", "name"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "Product",
    targetTable: "product",
    sourceColumns: ["Id", "SKU", "CompanyId", "Type"],
    targetColumns: ["id", "sku", "company_id", "type"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "BOM",
    targetTable: "bom",
    sourceColumns: ["Id", "ProducedProductId"],
    targetColumns: ["id", "produced_product_id"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "BOM_Component",
    targetTable: "bom_component",
    sourceColumns: ["BOMId", "ConsumedProductId"],
    targetColumns: ["bom_id", "consumed_product_id"],
    orderByTarget: ["bom_id", "consumed_product_id"],
  },
  {
    sourceTable: "Supplier",
    targetTable: "supplier",
    sourceColumns: ["Id", "Name"],
    targetColumns: ["id", "name"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "Supplier_Product",
    targetTable: "supplier_product",
    sourceColumns: ["SupplierId", "ProductId"],
    targetColumns: ["supplier_id", "product_id"],
    orderByTarget: ["supplier_id", "product_id"],
  },
  {
    sourceTable: "Component_Normalized",
    targetTable: "component_normalized",
    sourceColumns: ["Id", "RawProductId", "NormalizedName", "Category", "SubCategory"],
    targetColumns: ["id", "raw_product_id", "normalized_name", "category", "sub_category"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "Substitution_Candidate",
    targetTable: "substitution_candidate",
    sourceColumns: [
      "Id",
      "SourceProductId",
      "TargetProductId",
      "Confidence",
      "ReasoningSummary",
      "CreatedAt",
    ],
    targetColumns: [
      "id",
      "source_product_id",
      "target_product_id",
      "confidence",
      "reasoning_summary",
      "created_at",
    ],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "External_Evidence",
    targetTable: "external_evidence",
    sourceColumns: [
      "Id",
      "ProductId",
      "SupplierId",
      "SourceType",
      "SourceUrl",
      "Content",
      "RelevanceScore",
      "FetchedAt",
    ],
    targetColumns: [
      "id",
      "product_id",
      "supplier_id",
      "source_type",
      "source_url",
      "content",
      "relevance_score",
      "fetched_at",
    ],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "Compliance_Verdict",
    targetTable: "compliance_verdict",
    sourceColumns: [
      "Id",
      "SubstitutionCandidateId",
      "Verdict",
      "Confidence",
      "ReasoningJson",
      "CreatedAt",
    ],
    targetColumns: [
      "id",
      "substitution_candidate_id",
      "verdict",
      "confidence",
      "reasoning_json",
      "created_at",
    ],
    jsonColumns: ["reasoning_json"],
    orderByTarget: ["id"],
  },
  {
    sourceTable: "Sourcing_Recommendation",
    targetTable: "sourcing_recommendation",
    sourceColumns: ["Id", "BOMId", "RecommendationJson", "Score", "CreatedAt"],
    targetColumns: ["id", "bom_id", "recommendation_json", "score", "created_at"],
    jsonColumns: ["recommendation_json"],
    orderByTarget: ["id"],
  },
];

const SERIAL_TABLES = [
  "company",
  "product",
  "bom",
  "supplier",
  "component_normalized",
  "substitution_candidate",
  "external_evidence",
  "compliance_verdict",
  "sourcing_recommendation",
  "chat_session",
  "chat_message",
  "user_analysis_preference",
];

function buildInsertSql(table) {
  const placeholders = table.targetColumns
    .map((column, index) => {
      const parameter = `$${index + 1}`;
      if (table.jsonColumns?.includes(column)) {
        return `${parameter}::jsonb`;
      }
      return parameter;
    })
    .join(", ");

  return `INSERT INTO ${table.targetTable} (${table.targetColumns.join(", ")}) VALUES (${placeholders})`;
}

function normalizeForCompare(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function compareRows(sourceRows, targetRows, table) {
  if (sourceRows.length !== targetRows.length) {
    return {
      ok: false,
      reason: `Row count mismatch for ${table.targetTable}: source=${sourceRows.length} target=${targetRows.length}`,
    };
  }

  for (let i = 0; i < sourceRows.length; i += 1) {
    const src = sourceRows[i];
    const dst = targetRows[i];

    for (let c = 0; c < table.targetColumns.length; c += 1) {
      const sourceColumn = table.sourceColumns[c];
      const targetColumn = table.targetColumns[c];

      const sourceValue = src[sourceColumn];
      const targetValue = dst[targetColumn];

      if (table.jsonColumns?.includes(targetColumn)) {
        const parsedSource = JSON.stringify(JSON.parse(sourceValue));
        const parsedTarget = JSON.stringify(
          typeof targetValue === "string" ? JSON.parse(targetValue) : targetValue,
        );

        if (parsedSource !== parsedTarget) {
          return {
            ok: false,
            reason: `JSON value mismatch in ${table.targetTable}.${targetColumn} at row ${i + 1}`,
          };
        }
        continue;
      }

      if (normalizeForCompare(sourceValue) !== normalizeForCompare(targetValue)) {
        return {
          ok: false,
          reason: `Value mismatch in ${table.targetTable}.${targetColumn} at row ${i + 1}: source=${String(
            sourceValue,
          )} target=${String(targetValue)}`,
        };
      }
    }
  }

  return { ok: true };
}

function sqliteRowsForTable(table) {
  const orderBy = table.sourceColumns.join(", ");
  const query = `SELECT ${table.sourceColumns.join(", ")} FROM ${table.sourceTable} ORDER BY ${orderBy}`;
  return sqlite.prepare(query).all();
}

async function pgRowsForTable(client, table) {
  const orderBy = table.orderByTarget.join(", ");
  const query = `SELECT ${table.targetColumns.join(", ")} FROM ${table.targetTable} ORDER BY ${orderBy}`;
  const result = await client.query(query);
  return result.rows;
}

async function getPgCount(client, tableName) {
  const result = await client.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(result.rows[0].count);
}

async function ensureTargetIsEmpty(client) {
  for (const table of TABLES) {
    const count = await getPgCount(client, table.targetTable);
    if (count > 0) {
      throw new Error(
        `Target table ${table.targetTable} already has ${count} rows. Re-run with --truncate to replace migrated data.`,
      );
    }
  }
}

async function truncateTargetTables(client) {
  const list = TABLES.map((table) => table.targetTable).join(", ");
  await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function resetSerialSequences(client) {
  for (const tableName of SERIAL_TABLES) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('${tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
        (SELECT MAX(id) IS NOT NULL FROM ${tableName})
      )
    `);
  }
}

function transformValue(targetColumn, value) {
  if (value === undefined) {
    return null;
  }
  if (targetColumn === "reasoning_json" || targetColumn === "recommendation_json") {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return JSON.stringify(value);
    }
    JSON.parse(value);
    return value;
  }
  return value;
}

async function migrate() {
  const client = await pool.connect();

  try {
    console.log(`SQLite source: ${sqlitePath}`);
    console.log(`Postgres target: ${connectionString.replace(/:[^:@/]+@/, ':***@')}`);

    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    await client.query("BEGIN");
    await client.query(schemaSql);

    if (truncateFirst) {
      console.log("Truncating target tables before migration...");
      await truncateTargetTables(client);
    } else {
      await ensureTargetIsEmpty(client);
    }

    for (const table of TABLES) {
      const sourceRows = sqliteRowsForTable(table);
      const insertSql = buildInsertSql(table);

      if (sourceRows.length === 0) {
        console.log(`Migrated ${table.targetTable}: 0 rows`);
        continue;
      }

      for (const row of sourceRows) {
        const values = table.sourceColumns.map((sourceColumn, index) => {
          const targetColumn = table.targetColumns[index];
          return transformValue(targetColumn, row[sourceColumn]);
        });
        await client.query(insertSql, values);
      }

      const targetCount = await getPgCount(client, table.targetTable);
      if (targetCount !== sourceRows.length) {
        throw new Error(
          `Count mismatch in ${table.targetTable}: source=${sourceRows.length}, target=${targetCount}`,
        );
      }

      console.log(`Migrated ${table.targetTable}: ${sourceRows.length} rows`);
    }

    await resetSerialSequences(client);

    for (const table of TABLES) {
      const sourceRows = sqliteRowsForTable(table);
      const targetRows = await pgRowsForTable(client, table);
      const result = compareRows(sourceRows, targetRows, table);

      if (!result.ok) {
        throw new Error(result.reason);
      }
    }

    await client.query("COMMIT");
    console.log("Migration completed and verified successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed. Rolled back all changes.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

migrate();
