# Handoff — ALLI RUN (steps → the daily quest → stars → ALLI)

_Verified 2026-09-18 on `main` @ `a375a9a`._

## Orientation

Repo: [NekoBite/alli-app](https://github.com/NekoBite/alli-app).

A user records a run. The phone measures it — distance from GPS, steps from the
pedometer, and steps only where GPS movement backs them up. The server
independently recomputes the run from the raw track and the raw pedometer
totals, banks its steps against the day, and when the day crosses **6,000
GPS-verified steps** pays one star, multiplied by the tier of NFT footwear the
account holds. Stars exchange for **ALLI** on BNB Smart Chain.

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
completes in about 90 seconds of wall clock instead of half an hour.

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
| `src/features/run/useRunSession.ts` | Owns the live run: permissions, GPS + pedometer, background drain, autosave |
| `src/features/run/background.ts` | The location task that keeps recording with the screen off |
| `src/features/run/reconcile.ts` | Merging background fixes and OS step backfill into the session |
| `src/features/run/draft.ts` | The in-progress run on disk, so a closed app does not lose it |
| `src/features/run/credits.ts` | `RUN_CREDIT_RULES` — price, monthly ceiling, whether a run may start |
| `src/features/run/goals.ts` | The 7-day quest strip, derived from history rather than stored |
| `src/features/run/store.ts` | Profile (stars, quest, shoe), entitlement, history, purchases, star exchange |
| `app/(tabs)/run.tsx` | Today's quest, run balance, stars, shoe tier, week strip, recent runs |
| `app/run/active.tsx` | The live run screen |
| `app/run/summary.tsx` | Post-run breakdown, including why a run did not count |
| `src/services/api/run.ts` | `live` and `mock` behind one interface |

**Server**

| File | Why it matters |
|---|---|
| `server/src/shared/run.ts` | The *only* place the server reaches into the app. Re-exports the five shared modules |
| `server/src/run/service.ts` | The trust boundary. Recompute, re-credit steps, quest, star ledger, exchange |
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
The star hangs on that number, so if you find yourself passing a credited step
count from the client into `calculateReward`, stop.

**One implementation of the reward math, not two.** The server imports the app's
modules through `server/src/shared/run.ts`. Writing a second `calculateReward`
drifts, and the first symptom of drift is a user shown one number on the phone
and credited another by the server — indistinguishable from theft from their
side.

**The quest is read and written under a row lock.** `submitRun` does
`SELECT … FOR UPDATE` on the user before reading the day's step total. Drop it
and two runs uploaded at the same instant each read "no star yet today" and each
pay one. A test fires ten quest-clearing submissions and asserts exactly one star
comes out; keep it green if you refactor the transaction.

**The exchange debits before it pays.** Stars come out and a `pending` row is
committed, *then* the transfer broadcasts. The reverse order pays out tokens the
ledger never charged for if the process dies in between.

**Stars are `SUM(delta)` over an append-only ledger, not a column.** Slower to
read, possible to audit. Every credit and debit is a row.

## Decisions already made

**Steps pay; distance is the evidence.** The kilometre figure is measured, shown
and used to validate — pace, stride, the 300 m minimum — but the quest counts
GPS-backed steps. A spoofed track with no steps behind it earns nothing, and so
does a device with no pedometer. The run screen says so while the run is live
rather than after it.

**The quest is a day, not a run.** Five short walks that add to 6,000 steps pay
exactly what one long one does. A flagged run contributes nothing to the total,
and once the day has paid, later runs bank steps and nothing else.

**The shoe tier multiplies at the moment the quest pays**, not when stars are
spent — so upgrading tomorrow cannot re-price stars earned today.

**A recorded run spends a credit whatever it earned.** "Runs left" means runs you
can record, not runs that paid. The client's balance check is UX, so nobody walks
5 km only to be told it cannot be saved; the server is what actually spends it.

**Any validation flag zeroes the run.** Not partial credit — partial credit gives
a cheat a dial to tune against.

**Payout is a treasury transfer, not a mint.** The relayer sends from a float
that must be topped up, which caps the blast radius of a reward-math bug at the
float's balance rather than at total supply.

**Email one-time codes, not passwords; opaque session tokens, not JWT.** No
password storage and no reset flow; revocation is one `UPDATE`, which a
self-contained JWT cannot be without extra machinery. Both stored as HMAC under
a server pepper rather than bcrypt: these are 256-bit random tokens, so the
requirement is a leak-resistant store and constant-time compare, not key
stretching on every request.

**The reward constants are placeholders, not a balanced economy.** 6,000 steps a
day, one star at 1,000 ALLI, tier multipliers 1/3/5, 25 USDT for 30 run credits.
See `docs/architecture.md` §4: the shoe tier is the emission curve, nothing sells
the shoes yet, and 30 credits a month does not cover a quest that most people
will split across two or three runs.

## Step accuracy — what is known wrong

The quest hangs entirely on the credited step count, so this list is the most
load-bearing part of the document. Ranked by cost, all provable from the code.

**1. The GPS check has no memory.** `creditStepWindow` drops *every* step in a
window that has not covered 1 m yet, and they never come back. Two consequences:
a minute of GPS dropout under trees costs roughly 100 steps, and the first batch
of every run is lost because the track has one fix and therefore no distance —
you can see it as `17 unbacked` on the active screen seconds into a mock run.
The fix is to carry unbacked steps forward and release them when the ground
arrives, keeping the cap **global** (total credited ≤ total accepted distance ÷
`minMetresPerStep`) so the anti-cheat bound is unchanged.

**2. The full re-credit only runs on a background drain.** `syncFromBackground`
recomputes the whole run with `creditStepSamples`, which self-heals 1 — but a run
that never leaves the foreground never drains, so the incremental count stands.
Do not assume the re-credit covers you.

**3. Nothing checks cadence.** Humans walk at 90–130 steps/min and run at
150–200. A shaken phone produces 240+, and nothing rejects it. The 0.3 m/step
floor barely bites: 1,800 m of validated distance already supports the entire
6,000-step quest.

**4. Two clocks.** Track fixes are stamped with the OS fix time, step samples
with `Date.now()`. Any skew shifts every window boundary. Usually the same clock
on both platforms, but worth confirming on a device before trusting it.

There is no trace export yet, which is why 1 and 3 are still guesses about
magnitude: dumping a run's fixes, samples and per-window decisions is what would
let a real walk tune them.

## Deliberately not built

**Background recording is written but unproven on hardware.** `background.ts`
registers the task, `reconcile.ts` merges what it buffered, `useRunSession`
drains on every return to the foreground, and on iOS `getStepCountAsync`
backfills the span the live subscription was dead. None of it has run on a phone.
The device-only questions: does iOS wake the task with the screen locked for a
whole walk, does Android's foreground service survive Doze, and does the backfill
double-count against a subscription that resumed? The watcher is restarted after
every backfill specifically to prevent the third — suspect that line first if
counts come back high. To test: walk with the phone pocketed and compare **steps
counted** on the summary against Apple Health or Google Fit for the same window.

**No sign-in screen.** The server has working auth; the app has no UI for it,
which is why `EXPO_PUBLIC_DATA_SOURCE=live` yields 401s. **This blocks all
end-to-end testing against the real backend.**

**Run credits and membership exist only client-side.** `GET /v1/run/entitlement`,
`POST /v1/run/credits` and `POST /v1/run/membership/renew` are defined and mocked
in `src/services/api/run.ts`; the server answers none of them. No credit ledger,
no membership table, nothing charges USDT. The store treats a missing entitlement
as non-fatal — the quest half of the screen keeps working and the server stays
the one to refuse a run. **Largest gap left in the run loop.**

**Nothing sells a shoe.** `users.shoe_tier` is stored, defaults to Leather and is
honoured by the reward math, but there is no mint, no marketplace and no upgrade
path, so every account earns 1×.

**Attestation is a shape, not a defence.** `ATTESTATION=required` checks a token
is *present*; nothing verifies it against Play Integrity or App Attest. Until it
does, the client rules raise the cost of faking a run without preventing it, and
the once-a-day quest is the only real bound on emission. The repo is public, so
every threshold is readable.

**No reconciler.** A crash between the star debit and the on-chain transfer
leaves a `pending` redemption. `redemptions_pending_idx` exists to find them; the
job that does not.

**ALLI is not deployed.** The exchange throws 503 before touching stars.

**Referral commissions and the ALLI→USDT swap.** Described in the product brief
(four generations at 20/10/10/10; in-app swap and withdrawal to any BNB Chain
address), not started. The swap in particular implies a custodial balance, which
is the custody decision `README.md` §1 deliberately leaves open.

## Traps

**Sensors and data are separate flags.** `EXPO_PUBLIC_MOCK_SENSORS` controls the
synthesised GPS and pedometer; `EXPO_PUBLIC_DATA_SOURCE` controls the API. The
first defaults to following the second, so `mock` behaves as before, but you can
set it to `off` and walk around the block with the backend still mocked.

**Two writers, one run.** The foreground watcher writes fixes into React state;
the background task writes them into AsyncStorage. They overlap around the moment
the app wakes, which is why `mergeFixes` dedupes by timestamp and why the whole
run is re-credited from scratch on a drain rather than patched.

**Mock mode runs its own clock.** The synthesised ticker advances 5 s of track
time every 250 ms and drives `elapsedSeconds` from that, so pace and stride stay
consistent at 20× speed. A wall-clock assumption in that path will look like a
pace bug.

**The draft is a whole track in AsyncStorage,** rewritten every 10 s. A
five-hour track is megabytes of JSON re-serialised each time. Move it to SQLite
or an append-only file before this ships, now that background recording makes
long runs realistic.

**ESLint is pinned to 9.x on purpose.** `eslint-config-expo@57` bundles an
`eslint-plugin-react` that calls `context.getFilename()`, removed in ESLint 10.
Upgrading crashes lint before it reports anything. npm will warn that 9.39.5 is
past its support window; that is the known trade-off.

**`eslint-import-resolver-typescript` is a direct devDependency** even though
`eslint-config-expo` already depends on it. The nested copy is not resolvable
from source files, so ESLint falls through to requiring the literal name
`typescript` and loads the TypeScript *compiler* as a resolver. Removing it
produces `typescript with invalid interface loaded as resolver`.

**`server/tsconfig.json` lists the five shared files individually.** A glob over
`src/features/run/*` pulls in the store, the hook and the jest specs, which need
React, Expo and the `@/` alias, and the server compile fails. Add a file to
`server/src/shared/run.ts` and you must add it to that list too.

**Server tests need a real Postgres.** Not mocked, deliberately — concurrency and
unique-index behaviour is exactly what a fake database papers over.
`DATABASE_URL=postgres://… npm test --workspace server`.

**Day buckets are the runner's local day, not UTC**, so the quest resets at their
midnight. The client sends `day`; it is not derived server-side.

## Verified state

Run on `main` @ `a375a9a` on 2026-09-18:

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 80 passed |
| `npm run typecheck --workspace server` | clean |
| `npm test --workspace server` | 21 passed, 0 failed, 0 skipped |
| App, driven in a browser | 45 s of mock run → 3,043 steps, 2.52 km, quest 51%, no console errors |

CI runs all of these plus Android and iOS bundles on every PR, and the five
checks are required by branch protection on `main`.

Not verified anywhere: everything under **Background recording** above. It has
never run on a phone.

## Where to start

**Give the GPS check a memory** — item 1 under step accuracy. It is pure,
unit-testable, independent of any device, and it is currently costing honest
runners steps on every run (the first batch) and every GPS dropout (~100 steps a
minute). Carry unbacked steps forward in `creditStepWindow`/`creditStepSamples`
and enforce the cap globally instead of per window; the server picks the change
up for free, because it runs the same function.

The alternative first move is device verification of background recording, and
it is worth saying why it is *not* the recommendation for a fresh session: it
needs a human with a phone to walk for twenty minutes. Ask for that walk in
parallel, then build against what it reports.
