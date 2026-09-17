# Alli app — architecture & economics

Companion to [`README.md`](../README.md). That file covers how to run the app and
what is deliberately unbuilt. This one covers the system around it: what the backend owes the
client, how ALLI flows, and the order things need to be built in.

---

## 1. Trust boundary

The phone is hostile. It is a device the user controls, running code they can inspect, reporting
sensor data they can fake. Everything that decides how much ALLI exists must live on the server.

| Concern | Client | Server |
|---|---|---|
| GPS capture | ✅ records the track | — |
| Pedometer capture | ✅ records raw totals | — |
| Track filtering | ✅ preview | ✅ **authoritative** — re-run on the raw track |
| Step credit (steps vs. ground covered) | ✅ preview | ✅ **authoritative** — re-run on the samples |
| Reward calculation | ✅ preview | ✅ **authoritative** |
| The day's step total | shown | ✅ summed from validated runs |
| Star ledger | cached | ✅ source of truth |
| Shoe tier (the reward multiplier) | displayed | ✅ source of truth, applied when the quest pays |
| Quest paid today | shown | ✅ enforced under the row lock |
| Run credits (balance, monthly ceiling) | shown | ✅ source of truth, spent on submit |
| Membership state | shown | ✅ source of truth |
| Seed prices, yields | bundled placeholders | ✅ should own these |
| Order state | displayed | ✅ source of truth |
| Payment confirmation | — | ✅ watches the chain |
| Card actions | requests | ✅ proxies to the issuer |

Note which way round the two sensors work: **steps are the reward basis and distance is the
evidence.** GPS is the harder of the two to fake convincingly over a whole route, so it vouches for
the pedometer rather than paying out itself — which also means a spoofed track with no steps behind
it earns nothing.

`src/features/run/rewards.ts` and `src/features/run/steps.ts` are written as pure functions
precisely so the backend can run the identical code on the raw track. Keep the two in sync — a
divergence shows up as users being told they earned one number and credited another.

The month and day buckets that bound credits and purchases are cut with the **server's** clock,
which is why `serverTime` travels with the entitlement: a phone whose clock says it is next month
must not get a fresh purchase allowance.

## 2. Reward pipeline

```
 run finishes
      │
      ▼
 POST /v1/run/runs   { track, stepSamples, day }
      │
      ├─ re-run summarizeTrack() on the raw track     ← ignore client-supplied distance
      ├─ re-run creditStepSamples() on the samples    ← ignore client-supplied step count
      ├─ read the day's steps so far, and whether it already paid   ← under the row lock
      ├─ read the account's shoe tier                 ← ignore client-supplied multiplier
      ├─ re-run calculateReward()
      ├─ device attestation (Play Integrity / App Attest)
      ├─ rate limits + outlier review
      ▼
 steps banked · one run credit spent · a star × the shoe tier if the day crossed 6,000
      │
      ▼
 POST /v1/run/stars/exchange { stars }
      │
      ├─ burn the stars
      ├─ sign a claim voucher: (address, amount, nonce, deadline)
      ▼
 contract verifies signature + nonce, transfers ALLI
```

The quest is a running total over the runner's local day, not a per-run prize: five short walks
that add to 6,000 steps pay exactly what one long one does, and the run that crosses the line is
the one the star is booked against.

`submitRun` takes `SELECT … FOR UPDATE` on the user before reading the day's total, so ten
concurrent uploads cannot each see "no star yet today" and each pay one. There is a test for
exactly that. Once the credit ledger exists (§6 — it does not yet), the credit has to be spent
inside the same transaction, so that a retried upload cannot spend two; the unique index on
`(user_id, client_run_id)` is what makes that hold, and the mock already behaves this way.

Stars are **off-chain**; ALLI is **on-chain**. This matters: it keeps per-run accounting free,
makes the once-a-day rule enforceable, and means a bug in the reward math is a ledger correction
rather than an irreversible mint.

Never mint per run. The exchange is a deliberate, rate-limited, user-initiated step.

## 3. Anti-cheat, in layers

Client-side filtering (already implemented in `geo.ts`, `steps.ts` and `rewards.ts`, and re-run
server-side on the raw inputs):

| Check | Threshold | Catches |
|---|---|---|
| GPS accuracy | drop fixes > 30 m | urban canyon noise |
| Hop distance | drop hops > 120 m | GPS teleports |
| Moving speed | ≥ 0.5 m/s counts as moving | standing still |
| Average pace | 0.7–6.0 m/s | cycling, driving, treadmill spoofing |
| Stride length | ≤ 2.5 m per step | phone in a vehicle |
| Rejected fraction | ≤ 35% of fixes | unusable tracks |
| Minimum distance | 300 m | micro-run farming |
| Step window | no GPS movement, no steps | a phone shaken in a chair |
| Step ceiling | ≤ 1 step per 0.3 m covered | an inflated pedometer total |
| No steps, no stars | distance alone pays nothing | GPS spoofed with nobody walking |
| Quest pays once a day | 1 star × tier | account farming rate |
| Run credits | one per recorded run | how often a run can even be submitted |

Any flag zeroes the run. Partial credit gives a cheat a dial to tune against.

This is the cheap layer. It raises cost; it does not stop a determined attacker with a rooted
device and a mock-location provider. The layers that actually matter:

1. **Device attestation** — Play Integrity API, App Attest. Reject unattested devices for rewards
   (still let them use the app).
2. **Account-level analysis** — same device fingerprint across many accounts, runs that repeat the
   same route with implausible regularity, sign-up velocity from one IP.
3. **Economic limits** — the once-a-day quest is the real backstop. Even a perfect spoofer is
   bounded to one quest per account per day, which makes farming a question of account-creation
   cost multiplied by the tier they can afford.
4. **Manual review** — flag the top 0.1% of earners weekly and look.

## 4. Token economics

Placeholder numbers from `REWARD_RULES`, `SHOES` and `SEEDS`:

**Emission**
- One quest a day: 6,000 GPS-verified steps → 1 star × the shoe multiplier
- 1 star = 1,000 ALLI, so a day is **1,000 ALLI on Leather, 3,000 on Silver, 5,000 on Gold**
- Distance is measured and shown but never paid: it is the witness for the steps, not the reward
- Garden harvests: 12–1,050 ALLI per harvest depending on tier
- Garden run bonus: up to +50% (capped in `growth.ts`) — **not wired into the quest**, see §6

**Sinks**
- Run credits: 25 USDT for 30, or 0.83 USDT each up to 300/month
- Standard seeds: 50–300 ALLI
- Marketplace goods: 1,800–3,400 ALLI
- (not yet designed) shoe upgrades, fees, cosmetics

**The shoe tier is the emission curve, and nothing sells the shoes yet.** A Gold holder mints five
times a Leather holder for identical effort, so the float has to be modelled against the *tier mix*,
not the headcount: 10,000 Gold accounts walking their quest is 50M ALLI a day. Whatever eventually
sells Silver and Gold is therefore not a shop feature, it is the emission control — price it
against the ALLI it commits the treasury to paying, and cap supply per tier if that number does not
close.

**The run-credit maths does not balance against a 6,000-step quest.** 6,000 steps is roughly an
hour of walking, which most people will split across two or three runs, and every recorded run
costs a credit — while a membership grants thirty a month. Either the membership grants closer to
90, or extra credits are the real revenue line and that should be a deliberate choice rather than
an accident of the numbers.

The problem to solve before launch is visible in those numbers: an Ironwood yields 1,050 ALLI
× 15 harvests = 15,750 ALLI for 20 USDT, while a day of running yields 1. The premium tree is not
a game item, it is a yield instrument, and that is the shape regulators look at hardest. Two
things follow:

1. **Premium yields are treasury-funded emission.** USDT comes in, ALLI goes out. If the treasury
   does not hold enough ALLI to cover every outstanding premium tree's remaining harvests, the
   scheme is paying earlier buyers with later buyers' money. Model total committed yield as a
   liability from day one.
2. **Sinks must scale with emission.** Marketplace demand is the honest sink — real goods, real
   cost, ALLI burned. If the only reason to hold ALLI is to buy more trees, the economy is closed.

Model this properly before any number ships. The catalogue placeholders exist to make the UI
legible, nothing more.

## 5. Contracts

| Contract | Purpose | State |
|---|---|---|
| `ALLI` (BEP-20) | Reward token | Not deployed |
| `RewardClaim` | Verifies server-signed vouchers, transfers ALLI | Sketched (`REWARD_CLAIM_ABI`) |
| `Garden` | Optional: on-chain plots as NFTs | Not designed |
| `MarketEscrow` | Optional: hold payment until shipped | Not designed |

Minimum viable set is ALLI + RewardClaim. Garden state can live in the backend database — putting
it on-chain costs gas per plant and per harvest for no user-visible benefit until plots are
tradeable.

Claim voucher shape:

```solidity
claim(uint256 amount, uint256 nonce, uint256 deadline, bytes signature)
```

The server signs `(user, amount, nonce, deadline)`; the contract recovers the signer, checks it is
the authorized backend key, checks `nonce == nonceOf(user)`, checks `block.timestamp <= deadline`,
then transfers. The nonce stops replay; the deadline bounds how long a leaked voucher is worth
anything. Get it audited — this contract is the mint.

## 6. Backend surface

Endpoints the client already calls (`src/services/api/`):

```
GET  /v1/run/profile?day=YYYY-MM-DD       → stars, stars today, steps today, streak, shoe tier
GET  /v1/run/runs                         → run history with reward breakdowns
POST /v1/run/runs                         → submit a run, returns the authoritative reward
POST /v1/run/stars/exchange { stars, toAddress } → burn stars, return { txHash, alli, starsBalance }

                                          ── not implemented server-side yet ──
GET  /v1/run/entitlement                  → run credits, membership, serverTime
POST /v1/run/credits       { runs }       → buy extra credits, returns the entitlement
POST /v1/run/membership/renew             → extend a month, grant its credits

GET  /v1/garden/plots                     → plots
POST /v1/garden/plots                     → buy + plant a seed
POST /v1/garden/plots/:id/harvest         → harvest, returns { plot, alli }

GET  /v1/market/products                  → catalogue (public)
GET  /v1/market/orders                    → the user's orders
POST /v1/market/orders                    → create an order in pending-payment

GET  /v1/wallet/account                   → address + custody model
GET  /v1/wallet/transactions?address=     → transfer history (from an indexer)

GET  /v1/card                             → card status
GET  /v1/card/transactions                → card activity
POST /v1/card/apply                       → start KYC with the issuer
POST /v1/card/freeze                      → { frozen }
POST /v1/card/topup                       → { amountUsd, from }
```

Each has a mock implementation behind the same interface, so the backend can be built against a
client that already works.

The three credit endpoints are defined and mocked client-side (`src/services/api/run.ts`) and
answer nothing on the server. They need a credit ledger with the same append-only shape as
`star_ledger` — a balance column would be faster to read and impossible to audit, and "where did my
run credits go" has to have an answer — plus a membership row and whatever collects the USDT. The
client treats their absence as non-fatal rather than fabricating a balance.

Two more gaps on the reward side: nothing mints or sells a Silver or Gold shoe (the tier is stored
and honoured, but every account is Leather), and the garden's run bonus is not applied to the quest
— `growth.ts` computes a multiplier that nothing reads.

Two notes. Transfer history should come from an indexer (BscScan API, Covalent, or a self-hosted
one) — never scan blocks from the phone. And order payment is confirmed by the backend watching
the chain, never by the client reporting success.

## 7. Build order

1. **Auth** — sign-in, session token into `SECURE_KEYS.session`. Everything else needs an account.
2. **Custody decision** — see [`README.md`](../README.md) §1. This one blocks the wallet, the marketplace
   and the card, so make it early.
3. **Star ledger + run validation** — the server half of `rewards.ts`, with attestation. Done,
   except attestation.
4. **Run credits, stars and membership** — the ledgers behind `/v1/run/entitlement` and the USDT
   charge behind a purchase. Until this lands the run feature has a balance it cannot read.
5. **ALLI + RewardClaim, audited, on testnet** — then flip `EXPO_PUBLIC_CHAIN=testnet` with a real
   address and run the whole loop end to end.
6. **Background location** — the run feature is not shippable without it.
7. **Garden server-side** — move `SEEDS` out of the bundle.
8. **Marketplace fulfilment** — payment watching, shipping, tax, returns.
9. **Card partner** — longest lead time (licensing, KYC integration, BIN sponsorship). Start
   conversations early even though it ships last.

Steps 1–6 are the minimum for a run app that pays real ALLI. The garden, marketplace and card
each add a full compliance surface on top.
