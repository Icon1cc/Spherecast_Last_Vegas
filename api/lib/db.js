import pg from "pg";

// Shared database pool creator for all API routes
export function createPool() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Database connection string not found");
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
