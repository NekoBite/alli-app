# Alli server — ALLI RUN rewards

Fastify + Postgres backend for the ALLI RUN loop: identity, run validation, the
daily quest, the star ledger, and the ALLI payout.

It lives in this repo rather than its own for one reason. The reward rules are
in `src/features/run/{geo,steps,rewards}.ts`, written as pure functions, and this
server imports **those exact modules** through `src/shared/run.ts`. The phone
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

**What the client sends:** the raw GPS track, the pedometer's raw running totals,
a client-generated run id, and the runner's local calendar day.

**What the client does not send:** distance, moving time, rejected-fix count, the
credited step count, the day's running total, the shoe multiplier, or the stars.
Not because the app is polite about it — because there is nowhere in the request
body to put them. The server recomputes all of it from `track` and `stepSamples`,
plus what it already knows about the account:

```
POST /v1/run/runs
  → summarizeTrack(track)                 drops bad fixes, sums real distance
  → creditStepSamples(track, samples)     pairs each pedometer window with the
                                          ground covered; a phone that did not
                                          move credits no steps
  → the day's steps so far, under the row lock
  → the account's shoe tier, from users.shoe_tier
  → calculateReward(stats, ctx)           pace bounds, stride check, and the star
                                          if the day crossed 6,000 steps
  → ledger entry, inside the same transaction as the run row
```

The quest is a running total over the runner's local day. A star is booked once
per day, against the run that crossed the line; every later run that day still
banks its steps and pays nothing.

`ctx` — the day's steps, whether it already paid, and the shoe tier — comes from
the database, never from the request. A multiplier the phone can set is a
multiplier the phone can set to 1000.

## Endpoints

```
POST /v1/auth/request-code   { email }              → 204 (always, see below)
POST /v1/auth/verify-code    { email, code }        → { token, expiresAt, user, isNew }
POST /v1/auth/logout                                 → 204
GET  /v1/auth/me                                     → user
PUT  /v1/auth/wallet         { address }             → user

GET  /v1/run/profile?day=YYYY-MM-DD → { starsBalance, starsEarnedToday, stepsToday, streakDays, shoeTier }
GET  /v1/run/runs                   → run history with reward breakdowns
POST /v1/run/runs                   → the authoritative reward for one run
POST /v1/run/stars/exchange         → { txHash, alli, starsBalance }
```

`request-code` answers 204 for a new address, an existing one, and a rate-limited
one alike. Distinguishing them would turn it into an account-existence oracle, so
the "too many codes" case is swallowed there on purpose.

Commerce and referrals (migration 006):

```
GET  /v1/run/entitlement                   → { runsLeft, runsThisMonth, extraRunsBoughtThisMonth, membership, serverTime }
POST /v1/payments/intents  { kind, … }     → a signed PaymentRouter quote (runs · membership · seed · shoe · order)
GET  /v1/payments/intents/:id              → { status, txHash }
POST /v1/garden/plots      { seedId, intentId? }
GET  /v1/market/products · /v1/market/orders[/:id] · POST /v1/market/orders
GET  /v1/referrals · /v1/referrals/:program · /v1/referrals/:program/downline
POST /v1/referrals/attribute { code }
GET  /v1/wallet/account · /v1/wallet/transactions · /v1/wallet/prices
```

**A purchase is a signed quote, settled on chain.** The server prices it from the shared rules,
binds it to the member's wallet and a deadline, and signs it (EIP-712, `src/chain/signer.ts`).
`PaymentRouter` accepts only that price. `src/chain/watcher.ts` polls `Paid` events and calls
`confirmPayment`, which flips the intent and fulfils it — credits, membership, the paid order,
the shoe tier, and the referral commission — in one transaction, once per intent. With no router
or quote key configured every purchase answers 503 `payments_unavailable`, and planting stays free.

**A run spends a credit.** `submitRun` refuses (402 `no_run_credits`) when the balance is zero and
writes −1 against the run inside its transaction. `SIGNUP_RUN_CREDITS` grants a starting balance.

## Correctness decisions worth knowing

**The ledger is the truth.** Balance is `SUM(delta)`, not a column. A cached
balance is faster and impossible to audit; here, "why do I have this many stars"
always has a row-by-row answer.

**The quest is held under a row lock.** `submitRun` takes `SELECT … FOR UPDATE`
on the user before reading the day's step total. Without it, two runs uploaded at
the same moment each read "no star yet today" and each pay one. There is a test
for exactly this — ten quest-clearing submissions at once, one star out.

**A retried upload credits once.** `runs (user_id, client_run_id)` is unique, and
a duplicate submission returns the stored result instead of erroring, so the
client's retry loop stays simple. Without this a flaky connection is a star
printer.

**A rejected run is still recorded.** The run row is written with its flags and
no ledger entry, so the user can see *why* they earned nothing rather than
watching a run vanish.

**The exchange debits before it pays, in two transactions.** The stars come out
and a `pending` redemption row is committed; only then is the transfer broadcast.
The reverse order means a crash between the two pays out tokens the ledger never
charged for. A crash in the current order leaves a `pending` row — recoverable,
and visible to the reconciler query in `redemptions_pending_idx`.

**The exchange refuses rather than fakes.** With no ALLI contract deployed,
`assertRedemptionAvailable()` throws 503 *before* any stars move. The user keeps
their stars and gets a straight answer.

**Payout is a transfer, not a mint.** The relayer sends from a treasury float
that has to be topped up. That caps the blast radius of a bug in the reward math
at the float's balance rather than at the token's total supply.

## Tests

```bash
DATABASE_URL=postgres://... npm test --workspace server
```

They run against real Postgres, not a mock. The behaviours worth testing here —
the once-a-day quest under concurrency, the unique index on retries, the refund path — are
exactly the ones a fake database papers over. CI runs a `postgres:16` service for
the same reason. Writing them this way caught a real bug before this shipped: a
column referenced in the refund query that the schema did not have.

## Sign-in

`POST /v1/auth/request-code` and `/verify-code` are the email road. `POST /v1/auth/oauth` is the
provider road: the phone sends the authorization code from Google, Facebook or X plus its PKCE
verifier and redirect URI, and the server exchanges the code with the client secret from the
environment (`server/src/auth/providers.ts`), asks the provider for the profile, and links or
creates the account by the provider's user id. A verified email links to an existing account; an
unverified one never does, since that would be a takeover. X gives no email, so `users.email` is
nullable (migration 004). A provider with no credentials in the environment answers 503 for that
provider only.

## Garden and weekly quest

`server/src/garden/` and `server/src/quests/` back the Garden tab and the community quest with
the same engine the phone previews with, imported through `src/shared/garden.ts`. Every garden
call locks the user's row, settles every plot to now, then acts; claims and fertiliser charges are
`star_ledger` rows with reason `garden`, quest payouts with reason `quest`. Finished quest weeks
are closed on the first read after Monday 00:00 UTC. See docs/architecture.md §6.

The test files run serially (`--test-concurrency=1`): each truncates the shared database, and the
migrator takes an advisory lock so two processes cannot apply the same file.

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
- **No shoe minting job.** A `shoe` payment raises `users.shoe_tier` (the multiplier
  follows it), but nothing mints the matching `AlliShoes` NFT yet.
- **No ReferralPayout publisher.** Commissions are booked in `commissions`; the job
  that builds and publishes Merkle roots from it is not written.
- **Card endpoints.** No issuer is chosen, so `/v1/card/*` has no server side.
- **Garden multiplier is not wired in.** Planted trees are meant to contribute to
  the reward (see `docs/architecture.md`); nothing reads that bonus.
