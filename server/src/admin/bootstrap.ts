// Makes (or promotes) the first super admin. Everything after that is done in the back office.
//   npm run admin:bootstrap --workspace server -- someone@example.com
import { pool } from '../db/pool.ts';

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes('@')) {
  console.error('Usage: npm run admin:bootstrap --workspace server -- <email>');
  process.exit(1);
}

const { rows } = await pool.query<{ id: string }>(
  `INSERT INTO users (email, admin_role) VALUES ($1, 'super')
   ON CONFLICT (lower(email)) DO UPDATE SET admin_role = 'super' RETURNING id`,
  [email],
);
await pool.query(`INSERT INTO admin_audit (actor_email, action, target_id, detail) VALUES (NULL, 'account.bootstrap', $1, $2)`, [
  rows[0]!.id,
  JSON.stringify({ email, via: 'cli' }),
]);
console.log(`${email} is a super admin. They sign in with an email code like any account.`);
await pool.end();
