# Handoff — the run feature (jogging → points → ALLI)

_Verified 2026-09-17 against `main` @ `41b5c8d`._

## Orientation

Repo: [NekoBite/alli-app](https://github.com/NekoBite/alli-app), branch `main`.

A user records a jog. The phone measures it and shows a live estimate. The
server independently recomputes what the run was worth from the raw GPS track,
credits points to a ledger, and — once the ALLI token exists — pays them out
on BNB Smart Chain.

See it running in about two minutes:

```bash
npm install
npm start          # scan the QR with the iPhone Camera app, open in Expo Go
```

It runs with no backend and no chain: `EXPO_PUBLIC_DATA_SOURCE` defaults to
`mock`. Press **Start a run** and distance, pace and points climb from a
synthesised track.

## The map

**Shared** — pure, no React, no Node, no I/O. Imported by both sides.

| File | Why it matters |
|---|---|
| `src/features/jogging/geo.ts` | `summarizeTrack` — drops bad fixes, sums real distance and moving time |
| `src/features/jogging/rewards.ts` | `calculateReward` + `REWARD_RULES` — the entire tokenomics surface |
| `src/features/jogging/types.ts` | `GeoPoint`, `RewardBreakdown`, `RewardFlag` |

**App**

| File | Why it matters |
|---|---|
| `src/features/jogging/useJogSession.ts` | Owns the live run: permissions, GPS subscription, derived stats |
| `src/features/jogging/store.ts` | Points balance, history, redemption |
| `app/jog/active.tsx` | The live run screen |
| `app/jog/summary.tsx` | Post-run breakdown, including why a run was rejected |
| `src/services/api/jogging.ts` | `live` and `mock` behind one interface |

**Server**

| File | Why it matters |
|---|---|
| `server/src/shared/jogging.ts` | The *only* place the server reaches into the app. Re-exports the three shared modules |
| `server/src/jogging/service.ts` | The trust boundary. Recompute, cap, ledger, redemption |
| `server/src/jogging/routes.ts` | HTTP surface |
| `server/migrations/001_init.sql` | Schema, with the reasoning in comments |

## Invariants

**The server recomputes; it never accepts a client's numbers.** `submitRun`
takes the raw track and runs `summarizeTrack` and `calculateReward` itself.
Distance, moving time, rejected-fix count, points and multiplier are absent
from the request body entirely — there is nowhere to put a lie. Accept any of
them and the phone can mint tokens.

**One implementation of the reward math, not two.** The server imports the
app's modules through `server/src/shared/jogging.ts`. If you ever find yourself
writing a second `calculateReward`, stop: the first symptom of drift is a user
shown one number on the phone and credited another by the server, which is
indistinguishable from theft from the user's side.

**The daily cap is read and written under a row lock.** `submitRun` does
`SELECT … FOR UPDATE` on the user before reading today's total. Drop it and two
runs uploaded at the same instant each read "0 earned today" and each award a
full cap. There is a test that fires ten concurrent submissions and asserts the
total is exactly the cap — if you refactor the transaction, keep that test green.

**Redemption debits before it pays.** Points come out and a `pending` row is
committed, *then* the transfer broadcasts. The reverse order pays out tokens
the ledger never charged for if the process dies in between.

**Points are `SUM(delta)` over an append-only ledger, not a column.** Slower to
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

**The reward constants are placeholders, not a balanced economy.** 100 points
per validated km, 1,000 points = 1 ALLI, 1,000/day cap. They belong server-side
before launch so they can be tuned without an app release. See
`docs/architecture.md` §4 for the emission problem that is still unsolved.

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

**No background location.** `useJogSession` subscribes in the foreground only.
iOS suspends the app when the screen locks and the track ends mid-run. Shipping
needs `expo-task-manager`; the permissions are already declared in `app.json`.

**No reconciler.** A crash between the points debit and the on-chain transfer
leaves a `pending` redemption. `redemptions_pending_idx` exists to find them;
the job that does not.

**ALLI is not deployed.** Redemption throws 503 before touching points.

## Traps

**Mock mode gates GPS, not just data.** `useJogSession` branches on the same
`isMock` flag as the API layer, so on a real phone in mock mode you get the
*synthesised* track, not real GPS. You cannot get real GPS without also
switching the API to `live`, which 401s. Splitting these into two flags is a
~10-line change and makes the run feature testable on a device — worth doing
early if you are touching this feature at all.

**ESLint is pinned to 9.x on purpose.** `eslint-config-expo@57` bundles an
`eslint-plugin-react` that calls `context.getFilename()`, removed in ESLint 10.
Upgrading crashes lint before it reports anything. npm will warn that 9.39.5 is
past its support window; that is the known trade-off.

**`eslint-import-resolver-typescript` is a direct devDependency** even though
`eslint-config-expo` already depends on it. The nested copy is not resolvable
from source files, so ESLint falls through to requiring the literal name
`typescript` and loads the TypeScript *compiler* as an import resolver. Removing
it produces `typescript with invalid interface loaded as resolver`.

**`server/tsconfig.json` lists the three shared files individually.** A glob
over `src/features/jogging/*` pulls in the store, the hook and the jest specs,
which need React, Expo and the `@/` alias, and the server compile fails.

**Server tests need a real Postgres.** They are not mocked, deliberately —
concurrency and unique-index behaviour is exactly what a fake database papers
over. `DATABASE_URL=postgres://… npm test --workspace server`.

**Day buckets are the runner's local day, not UTC**, so the cap resets at their
midnight. The client sends `day`; it is not derived server-side.

## Verified state

Run on `main` @ `41b5c8d` on 2026-09-17:

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 24 passed |
| `npm run typecheck --workspace server` | clean |
| `npm test --workspace server` | 13 passed, 0 failed, 0 skipped |

CI runs all of these plus Android and iOS bundles on every PR, and the five
checks are required by branch protection on `main`.

## Where to start

**Build the sign-in screen.** It is the one thing standing between the app and
the backend that already exists: email entry → code entry → store the token in
`SECURE_KEYS.session` → the existing `request()` picks it up automatically.
Until it exists, nothing in the app can be tested against real data.

While you are in `useJogSession` anyway, split the mock-data flag from the
mock-GPS flag (see Traps). It is small, and it is what lets you walk around the
block and watch real numbers move.
