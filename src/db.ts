/**
 * Shared connection pool. DATABASE_URL selects the target environment
 * (docs/spec/13-data-layer.md#technology-hosting) — nothing else about the app
 * changes between local Postgres, RDS, or Azure Database for PostgreSQL.
 */

import { Pool, type PoolClient, types } from "pg";

// pg returns NUMERIC and BIGINT as strings by default, since some values in those
// types can't be represented exactly as JS numbers. Every numeric/bigint column in
// this schema fits safely in a JS number, so parse them once here instead of making
// every derivation query do it.
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

// Every derivation query only ever needs .query() — accepting either the shared Pool
// or a single reserved PoolClient lets tests run each case inside its own transaction
// (docs/spec/06-decision-pipeline.md's testability goal: only time should differ
// between a test and production, and here it's also true of the connection itself).
export type Queryable = Pool | PoolClient;
