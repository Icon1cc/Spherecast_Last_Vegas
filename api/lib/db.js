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

// Shared database pool creator for all API routes
export function createPool() {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    throw new Error(
      "Database connection string not found. Set POSTGRES_URL (recommended), DATABASE_URL, POSTGRES_URL_NON_POOLING, POSTGRES_PRISMA_URL, SUPABASE_DB_URL, or POSTGRES_HOST/POSTGRES_DATABASE/POSTGRES_USER/POSTGRES_PASSWORD."
    );
  }

  // Disable SSL certificate verification for Supabase pooler
  // This is required because Supabase uses a connection pooler with self-signed certs
  return new pg.Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 5,
    idleTimeoutMillis: 30000,
  });
}

export default { createPool };
