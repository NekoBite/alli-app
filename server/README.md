# Alli server — jogging rewards

Fastify + Postgres backend for the jogging loop: identity, run validation, the
points ledger, and ALLI redemption.

It lives in this repo rather than its own for one reason. The reward rules are
in `src/features/jogging/{geo,rewards}.ts`, written as pure functions, and this
server imports **those exact modules** through `src/shared/jogging.ts`. The phone
computes a preview with them; the server recomputes the authoritative answer with
the same code. A second implementation would drift, and the first symptom of
drift is a user shown one number and credited another.

## Run it

```bash
createdb alli                       # or point DATABASE_URL at any Postgres 16
cp server/.env.example server/.env  # then set TOKEN_SECRET
npm run dev --workspace server      # migrates, then listens on :8080
```

```bash
npm run typecheck --workspace server
npm test --workspace server   # needs DATABASE_URL; see "Tests" below
npm run migrate --workspace server
```

`GET /health/ready` reports whether redemption is wired up and which attestation
mode is active — worth checking first when something 503s.

## The trust boundary

This is the whole point of the service, so it is worth being explicit.

**What the client sends:** the raw GPS track, a client-generated run id, the step
count, and the runner's local calendar day.

**What the client does not send:** distance, moving time, rejected-fix count,
points, or the multiplier. Not because the app is polite about it — because
there is nowhere in the request body to put them. The server recomputes all of it
from `track`:

```
POST /v1/jogging/runs
  → summarizeTrack(track)          drops bad fixes, sums real distance
  → calculateReward(stats, ctx)    applies pace bounds, stride check, daily cap
  → ledger entry, inside the same transaction as the run row
```

`ctx` — points earned today, the streak multiplier — comes from the ledger, never
from the request. A multiplier the phone can set is a multiplier the phone can
set to 1000.

## Endpoints

```
POST /v1/auth/request-code   { email }              → 204 (always, see below)
POST /v1/auth/verify-code    { email, code }        → { token, expiresAt, user }
POST /v1/auth/logout                                 → 204
GET  /v1/auth/me                                     → user
PUT  /v1/auth/wallet         { address }             → user

GET  /v1/jogging/profile?day=YYYY-MM-DD → { pointsBalance, pointsEarnedToday, multiplier, streakDays }
GET  /v1/jogging/runs                   → run history with reward breakdowns
POST /v1/jogging/runs                   → the authoritative reward for one run
POST /v1/jogging/redeem                 → { txHash, alli }
```

`request-code` answers 204 for a new address, an existing one, and a rate-limited
one alike. Distinguishing them would turn it into an account-existence oracle, so
the "too many codes" case is swallowed there on purpose.

## Correctness decisions worth knowing

**The ledger is the truth.** Balance is `SUM(delta)`, not a column. A cached
balance is faster and impossible to audit; here, "why do I have this many points"
always has a row-by-row answer.

**The daily cap is held under a row lock.** `submitRun` takes `SELECT … FOR
UPDATE` on the user before reading today's total. Without it, two runs uploaded
at the same moment each read "0 earned today" and each award a full day's cap.
There is a test for exactly this — ten concurrent submissions, total equals the
cap.

**A retried upload credits once.** `runs (user_id, client_run_id)` is unique, and
a duplicate submission returns the stored result instead of erroring, so the
client's retry loop stays simple. Without this a flaky connection is a points
printer.

**A rejected run is still recorded.** The run row is written with its flags and
no ledger entry, so the user can see *why* they earned nothing rather than
watching a run vanish.

**Redemption debits before it pays, in two transactions.** The points come out
and a `pending` redemption row is committed; only then is the transfer broadcast.
The reverse order means a crash between the two pays out tokens the ledger never
charged for. A crash in the current order leaves a `pending` row — recoverable,
and visible to the reconciler query in `redemptions_pending_idx`.

**Redemption refuses rather than fakes.** With no ALLI contract deployed,
`assertRedemptionAvailable()` throws 503 *before* any points move. The user keeps
their points and gets a straight answer.

**Payout is a transfer, not a mint.** The relayer sends from a treasury float
that has to be topped up. That caps the blast radius of a bug in the reward math
at the float's balance rather than at the token's total supply.

## Tests

```bash
DATABASE_URL=postgres://... npm test --workspace server
```

They run against real Postgres, not a mock. The behaviours worth testing here —
concurrent cap enforcement, the unique index on retries, the refund path — are
exactly the ones a fake database papers over. CI runs a `postgres:16` service for
the same reason. Writing them this way caught a real bug before this shipped: a
column referenced in the refund query that the schema did not have.

## Not built yet

- **Attestation is a shape, not a defence.** `ATTESTATION=required` checks that a
  token is *present*; nothing verifies it against Play Integrity or App Attest.
  Until that lands, the client-side rules raise the cost of faking a run without
  preventing it, and the daily cap is the real backstop.
- **No reconciler.** Redemptions stranded `pending` by a crash need a job to
  check the chain and settle or refund them. The index is there; the job is not.
- **SMTP is unimplemented.** `MAILER=console` prints codes to stdout, and the
  server refuses to boot in production with it selected. Wire a provider before
  real users exist.
- **No admin surface.** Reviewing outlier earners, disabling an account, issuing
  an adjustment — all currently manual SQL. `users.disabled_at` and the
  `adjustment` ledger reason exist for it.
- **Garden multiplier is not wired in.** `streakMultiplier` is the only source of
  bonus; planted trees are meant to contribute (see `docs/architecture.md`).
