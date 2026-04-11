import pg from "pg";

function firstNonEmptyEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function buildConnectionStringFromParts() {
  const host = process.env.POSTGRES_HOST?.trim();
  const database = process.env.POSTGRES_DATABASE?.trim();
  const user = process.env.POSTGRES_USER?.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const port = process.env.POSTGRES_PORT?.trim() || "5432";

  if (!host || !database || !user || !password) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`;
}

export function resolveConnectionString() {
  return (
    firstNonEmptyEnv([
      "POSTGRES_URL",
      "DATABASE_URL",
      "POSTGRES_URL_NON_POOLING",
      "POSTGRES_PRISMA_URL",
      "SUPABASE_DB_URL",
    ]) || buildConnectionStringFromParts()
  );
}

function shouldRejectUnauthorized() {
  const raw = process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return false;
}

function normalizeConnectionString(connectionString, rejectUnauthorized) {
  if (rejectUnauthorized) return connectionString;

  try {
    const url = new URL(connectionString);
    // Remove SSL query options that can force strict verification in some providers.
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslcert");
    url.searchParams.delete("sslkey");
    url.searchParams.delete("sslrootcert");
    return url.toString();
  } catch {
    return connectionString;
  }
}

// Shared database pool creator for all API routes
export function createPool() {
  const resolvedConnectionString = resolveConnectionString();
  const rejectUnauthorized = shouldRejectUnauthorized();

  if (!resolvedConnectionString) {
    throw new Error(
      "Database connection string not found. Set POSTGRES_URL (recommended), DATABASE_URL, POSTGRES_URL_NON_POOLING, POSTGRES_PRISMA_URL, SUPABASE_DB_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER/POSTGRES_PASSWORD."
    );
  }

  const connectionString = normalizeConnectionString(
    resolvedConnectionString,
    rejectUnauthorized
  );

  // Always allow self-signed certificates for Supabase
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  return new pg.Pool({
    connectionString,
    ssl: rejectUnauthorized ? true : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
  });
}

export default { createPool };
