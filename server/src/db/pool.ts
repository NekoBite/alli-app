import pg from 'pg';

import { env } from '../config/env.ts';

/**
 * Postgres returns NUMERIC as a string by default, and that is correct — it has
 * more precision than a JS number can hold. Parsing it to a float would quietly
 * corrupt token amounts, so the default stands and callers handle strings.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // An idle client erroring out is not fatal — the pool replaces it — but it is
  // worth knowing about, because a stream of these means the database is sick.
  console.error('[db] idle client error', error);
});

export type Db = pg.PoolClient;

/**
 * Runs `fn` inside a transaction, committing on return and rolling back on
 * throw. Every points mutation goes through this: a credit written without its
 * ledger row, or a debit without its redemption, is a corrupt balance.
 */
export async function transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] rollback failed', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function close(): Promise<void> {
  await pool.end();
}
