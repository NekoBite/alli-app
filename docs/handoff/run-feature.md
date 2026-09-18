# Handoff — ALLI RUN (steps → the daily quest → stars → ALLI)

_Verified 2026-09-17 on `claude/modest-newton-k1t5dj`._

## Orientation

Repo: [NekoBite/alli-app](https://github.com/NekoBite/alli-app).

A user records a run. The phone measures it — distance from GPS, steps from the
pedometer, and steps only where GPS movement backs them up — and shows a live
estimate. The server independently recomputes the run from the raw track and the
raw pedometer totals, banks its steps against the day, and when the day crosses
**6,000 GPS-verified steps** pays one star, multiplied by the tier of NFT
footwear the account holds. Stars exchange for **ALLI** on BNB Smart Chain.

The quest pays **once a day**, however many runs it took. Recording a run spends
a **run credit**; credits come from a monthly membership or are bought outright,
and they never expire.

See it running in about two minutes:

```bash
npm install
npm start          # scan the QR with the iPhone Camera app, open in Expo Go
```

It runs with no backend and no chain: `EXPO_PUBLIC_DATA_SOURCE` defaults to
`mock`. Press **Start a run** and steps, distance and speed climb from a
synthesised track and pedometer, which play at 20× — the 6,000-step quest
completes in about a minute and a half of wall clock instead of half an hour.

`EXPO_PUBLIC_MOCK_SENSORS=off` keeps the API mocked but reads the real GPS and
pedometer — the combination you want on a device.

## The map

**Shared** — pure, no React, no Node, no I/O. Imported by both sides.

| File | Why it matters |
|---|---|
| `src/features/run/geo.ts` | `summarizeTrack` — drops bad fixes, sums real distance and moving time |
| `src/features/run/steps.ts` | `creditStepSamples` — pairs pedometer windows with ground covered |
| `src/features/run/rewards.ts` | `calculateReward` + `REWARD_RULES` — the quest, its goal and its star |
| `src/features/run/shoes.ts` | `SHOES` — the tier multipliers the quest reward scales by |
| `src/features/run/types.ts` | `GeoPoint`, `StepSample`, `RewardBreakdown`, `RunEntitlement` |

**App**

| File | Why it matters |
|---|---|
| `src/features/run/useRunSession.ts` | Owns the live run: permissions, GPS + pedometer, derived stats, autosave |
| `src/features/run/draft.ts` | The in-progress run on disk, so a closed app does not lose it |
| `src/features/run/background.ts` | The location task that keeps recording with the screen off |
| `src/features/run/reconcile.ts` | Merging background fixes and OS step backfill into the session |
| `src/features/run/credits.ts` | `RUN_CREDIT_RULES` — price, monthly ceiling, whether a run may start |
| `src/features/run/goals.ts` | The 7-day goal strip, derived from history rather than stored |
| `src/features/run/store.ts` | Profile (stars, quest, shoe), entitlement, history, purchases, star exchange |
| `app/(tabs)/run.tsx` | Today's quest, run balance, stars, shoe tier, week strip, recent runs |
| `app/run/active.tsx` | The live run screen |
| `app/run/summary.tsx` | Post-run breakdown, including why a run was rejected |
| `app/run/credits.tsx` | Buy extra runs, renew the membership |
| `app/run/stars.tsx` | Exchange stars for ALLI |
| `src/services/api/run.ts` | `live` and `mock` behind one interface |

**Server**

| File | Why it matters |
|---|---|
| `server/src/shared/run.ts` | The *only* place the server reaches into the app. Re-exports the four shared modules |
| `server/src/run/service.ts` | The trust boundary. Recompute, re-credit steps, cap, ledger, redemption |
| `server/src/run/routes.ts` | HTTP surface |
| `server/migrations/001_init.sql` | Schema, with the reasoning in comments |
| `server/migrations/002_stars.sql` | Points ledger → star ledger, plus `users.shoe_tier` |

## Invariants

**The server recomputes; it never accepts a client's numbers.** `submitRun`
takes the raw track and the raw pedometer totals and runs `summarizeTrack`,
`creditStepSamples` and `calculateReward` itself. Distance, moving time,
rejected-fix count, credited steps, the day's running total, the shoe multiplier
and the stars are absent from the request body entirely — there is nowhere to put
a lie. Accept any of them and the phone can mint tokens.

**Steps are credited against ground covered, never taken at face value.** The
pedometer is the easiest sensor to fake — shaking the phone produces a clean
count — so each pedometer window is paired with the GPS distance over the same
span: no movement, no steps, and never more steps than the distance could hold.
The star hangs on that number, so if you ever find yourself passing a credited
step count from the client into `calculateReward`, stop.

**One implementation of the reward math, not two.** The server imports the
app's modules through `server/src/shared/run.ts`. If you ever find yourself
writing a second `calculateReward`, stop: the first symptom of drift is a user
shown one number on the phone and credited another by the server, which is
indistinguishable from theft from the user's side.

**The quest is read and written under a row lock.** `submitRun` does
`SELECT … FOR UPDATE` on the user before reading the day's step total. Drop it
and two runs uploaded at the same instant each read "no star yet today" and each
pay one. There is a test that fires ten quest-clearing submissions and asserts
exactly one star comes out — if you refactor the transaction, keep it green.

**The exchange debits before it pays.** Stars come out and a `pending` row is
committed, *then* the transfer broadcasts. The reverse order pays out tokens
the ledger never charged for if the process dies in between.

**Stars are `SUM(delta)` over an append-only ledger, not a column.** Slower to
read, possible to audit. Every credit and debit is a row.

## Decisions already made

**Email one-time codes, not passwords.** No password storage, no reset flow.

**Opaque session tokens, not JWT.** Revocation is one `UPDATE`; a JWT needs
extra machinery to be revocable at all.

**Secrets stored as HMAC under a server pepper, not bcrypt.** These are 256-bit
random tokens — nothing to guess — so the requirement is a leak-resistant store
and constant-time compare, not key stretching on every authenticated request.

**Payout is a treasury transfer, not a mint.** The relayer sends from a float
that must be topped up. That caps the blast radius of a reward-math bug at the
float's balance rather than at total supply.

**Any validation flag zeroes the run.** Not partial credit — partial credit
gives a cheat a dial to tune against.

**The reward constants are placeholders, not a balanced economy.** 6,000 steps a
day, one star at 1,000 ALLI, tier multipliers 1/3/5, 25 USDT for 30 run credits.
They belong server-side before launch so they can be tuned without an app
release. See `docs/architecture.md` §4 — the shoe tier is the emission curve, and
nothing sells the shoes yet.

**Steps pay; distance is the evidence.** The kilometre figure is measured,
shown and used to validate — pace, stride, the 300 m minimum — but the quest
counts GPS-backed steps, so a spoofed track with no steps behind it earns
nothing, and a device with no pedometer earns nothing either. The run screen
says so while the run is live rather than after it.

**The quest is a day, not a run.** Five short walks that add to 6,000 steps pay
exactly what one long one does. A flagged run contributes nothing to the total,
and once the day has paid, later runs bank steps and nothing else.

**A recorded run spends a credit whatever it earned.** "Runs left" means runs you
can record, not runs that paid. The client checks the balance before letting a
run start — that check is UX, so nobody runs 5 km only to be told it cannot be
saved — and the server is what actually spends it.

## Deliberately not built

**No sign-in screen.** The server has working auth; the app has no UI for it.
This is why `EXPO_PUBLIC_DATA_SOURCE=live` currently yields 401s. **This blocks
any end-to-end testing against the real backend** and is the most likely first
task.

**Attestation is a shape, not a defence.** `ATTESTATION=required` checks that a
token is *present*. Nothing verifies it against Play Integrity or App Attest.
Until that lands, the client-side rules raise the cost of faking a run without
preventing it, and the daily cap is the only real bound on emission. The repo
is public, so the exact thresholds are readable by anyone.

**Run credits and membership exist only client-side.** `GET /v1/run/entitlement`,
`POST /v1/run/credits` and `POST /v1/run/membership/renew` are defined and mocked
in `src/services/api/run.ts`; the server answers none of them. There is no credit
ledger, no membership table, and nothing charges USDT. The store treats a missing
entitlement as non-fatal — the quest half of the screen keeps working and the
server stays the one to refuse a run. **This is the largest gap left in the run
loop.**

**Nothing sells a shoe.** `users.shoe_tier` is stored, defaults to Leather and is
honoured by the reward math, but there is no mint, no marketplace and no upgrade
path, so every account earns 1×.

**Background recording is written but unproven.** `background.ts` registers the
task, `reconcile.ts` merges what it buffered, and `useRunSession` drains on every
return to the foreground — but none of it has run on a phone. The device-only
questions are: does iOS wake the task with the screen locked, does Android's
foreground service survive Doze, and does the iOS backfill double-count against a
subscription that resumed? The watcher is restarted after every backfill
specifically to stop that third one, and that is the line to suspect first if
step counts come back too high.

**No reconciler.** A crash between the star debit and the on-chain transfer
leaves a `pending` redemption. `redemptions_pending_idx` exists to find them;
the job that does not.

**ALLI is not deployed.** The exchange throws 503 before touching stars.

## Traps

**Sensors and data are separate flags now.** `EXPO_PUBLIC_MOCK_SENSORS` controls
the synthesised GPS and pedometer; `EXPO_PUBLIC_DATA_SOURCE` controls the API. It
defaults to following the data source, so `mock` still behaves as before, but you
can set it to `off` and walk around the block with the backend still mocked.

**Two writers, one run.** The foreground watcher writes fixes into React state;
the background task writes them into AsyncStorage. They overlap around the
moment the app wakes, which is why `mergeFixes` dedupes by timestamp and why the
whole run is re-credited from scratch on every drain rather than patched.

**The draft is a whole track in AsyncStorage.** `useRunSession` writes the
in-progress run every 10 s so it can be resumed. A five-hour track is megabytes
of JSON re-serialised on each write, which AsyncStorage is not built for. Move it
to SQLite or an append-only file before background location lands.

**ESLint is pinned to 9.x on purpose.** `eslint-config-expo@57` bundles an
`eslint-plugin-react` that calls `context.getFilename()`, removed in ESLint 10.
Upgrading crashes lint before it reports anything. npm will warn that 9.39.5 is
past its support window; that is the known trade-off.

**`eslint-import-resolver-typescript` is a direct devDependency** even though
`eslint-config-expo` already depends on it. The nested copy is not resolvable
from source files, so ESLint falls through to requiring the literal name
`typescript` and loads the TypeScript *compiler* as an import resolver. Removing
it produces `typescript with invalid interface loaded as resolver`.

**`server/tsconfig.json` lists the four shared files individually.** A glob over
`src/features/run/*` pulls in the store, the hook and the jest specs, which need
React, Expo and the `@/` alias, and the server compile fails. Add a file to
`server/src/shared/run.ts` and you have to add it to that list too.

**Server tests need a real Postgres.** They are not mocked, deliberately —
concurrency and unique-index behaviour is exactly what a fake database papers
over. `DATABASE_URL=postgres://… npm test --workspace server`.

**Day buckets are the runner's local day, not UTC**, so the cap resets at their
midnight. The client sends `day`; it is not derived server-side.

## Verified state

Run on `claude/modest-newton-k1t5dj` on 2026-09-17:

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 64 passed |
| `npm run typecheck --workspace server` | clean |
| `npm test --workspace server` | 21 passed, 0 failed, 0 skipped |

CI runs all of these plus Android and iOS bundles on every PR, and the five
checks are required by branch protection on `main`.

## Where to start

**Build the sign-in screen.** It is the one thing standing between the app and
the backend that already exists: email entry → code entry → store the token in
`SECURE_KEYS.session` → the existing `request()` picks it up automatically.
Until it exists, nothing in the app can be tested against real data.

**Then the credit ledger.** One more append-only table shaped like `star_ledger`,
a membership row, and the three endpoints above. Without them the run balance on
the ALLI RUN tab is a mock — the star half is real and already writes to
Postgres.
