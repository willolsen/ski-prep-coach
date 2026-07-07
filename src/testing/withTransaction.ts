/**
 * Runs `run` inside a transaction on a single reserved connection, then always rolls
 * back — so tests can freely insert events and never leave residue, without needing a
 * separate test database. Reference data (users, capabilities, recovery_classes,
 * exercises) is expected to already be seeded and committed (`npm run db:seed`); only
 * the events a test itself inserts are undone.
 */

import { getPool, type Queryable } from "../db.js";

export async function withTransaction<T>(run: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    return await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
