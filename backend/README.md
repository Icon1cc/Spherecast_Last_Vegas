# Backend Migration Utilities

This folder contains backend-only scripts for database migration and verification.

## What It Does

- Creates PostgreSQL schema from `scripts/sql/postgres-schema.sql`
- Migrates data from SQLite (`../data/db.sqlite`) to PostgreSQL
- Preserves IDs and values exactly
- Verifies row counts and row-by-row values after import
- Rolls back the full transaction on any mismatch

## Setup

```bash
cd backend
npm install
```

## Environment

Use the shared root `.env` file at the repository root (same file used by frontend and backend), especially:

- `POSTGRES_URL`
- Optional `SQLITE_PATH` override

## Run Migration

```bash
cd backend
npm run db:migrate:sqlite-to-postgres
```

If target tables already contain data and you want to replace it:

```bash
cd backend
npm run db:migrate:sqlite-to-postgres:truncate
```

## Safety Notes

- Migration runs inside a single PostgreSQL transaction.
- Any data mismatch triggers rollback.
- JSON payload fields are validated and migrated as JSONB.
