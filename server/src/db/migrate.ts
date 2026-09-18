import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, transaction } from './pool.ts';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

/**
 * Plain numbered .sql files, applied in order, recorded in a table. No DSL to
 * learn and the migration you review is the SQL that runs.
 */
const MIGRATE_LOCK = 727_272;

export async function migrate(): Promise<string[]> {
  // Two processes migrating the same database at once (two test files, two
  // replicas booting) would each try to apply the same file. The advisory
  // lock makes the second wait and then find nothing left to do.
  const guard = await pool.connect();
  await guard.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK]);
  try {
    return await migrateLocked();
  } finally {
    await guard.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]);
    guard.release();
  }
}

async function migrateLocked(): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

    // Each migration is its own transaction, so a failure half-way leaves the
    // schema at the last good migration rather than somewhere in between.
    await transaction(async (db) => {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });

    ran.push(file);
    console.log(`[migrate] applied ${file}`);
  }

  if (ran.length === 0) console.log('[migrate] up to date');
  return ran;
}

// Run directly: `npm run migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      console.error('[migrate] failed', error);
      process.exit(1);
    });
}
