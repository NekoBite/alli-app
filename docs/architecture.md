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
| Points ledger | cached | ✅ source of truth |
| Star ledger | cached | ✅ source of truth |
| Run credits (balance, monthly ceiling) | shown | ✅ source of truth, spent on submit |
| Membership state | shown | ✅ source of truth |
| Daily cap | shown | ✅ enforced |
| Multiplier (streak, garden) | displayed | ✅ computed and supplied |
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
      ├─ re-run calculateReward() with the server's ledger
      ├─ device attestation (Play Integrity / App Attest)
      ├─ rate limits + outlier review
      ▼
 one run credit spent · points credited · a star if the run completed
      │
      ▼
 POST /v1/run/redeem { points }  ·or·  POST /v1/run/stars/exchange { stars }
      │
      ├─ burn the points, or the stars
      ├─ sign a claim voucher: (address, amount, nonce, deadline)
      ▼
 contract verifies signature + nonce, transfers ALLI
```

Once the credit ledger exists (§6 — it does not yet), the credit has to be spent inside the same
transaction that writes the run, so that a retried upload cannot spend two. The unique index on
`(user_id, client_run_id)` is what makes that hold; the mock already behaves this way.

Points and stars are **off-chain**; ALLI is **on-chain**. This matters: it keeps per-run accounting
free, makes the daily cap enforceable, and means a bug in reward math is a ledger correction rather
than an irreversible mint.

Never mint per run. Redemption is a deliberate, rate-limited, user-initiated step.

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
| No steps, no points | distance alone pays nothing | GPS spoofed with nobody walking |
| Daily cap | 1,000 points | account farming rate |
| Run credits | one per recorded run | star emission rate |

Any flag zeroes the run. Partial credit gives a cheat a dial to tune against.

This is the cheap layer. It raises cost; it does not stop a determined attacker with a rooted
device and a mock-location provider. The layers that actually matter:

1. **Device attestation** — Play Integrity API, App Attest. Reject unattested devices for rewards
   (still let them use the app).
2. **Account-level analysis** — same device fingerprint across many accounts, runs that repeat the
   same route with implausible regularity, sign-up velocity from one IP.
3. **Economic limits** — the daily cap is the real backstop. Even a perfect spoofer is bounded to
   1,000 points/day/account, which makes farming a question of account-creation cost.
4. **Manual review** — flag the top 0.1% of earners weekly and look.

## 4. Token economics

Placeholder numbers from `REWARD_RULES` and `SEEDS`:

**Emission**
- 100 points per 1,000 GPS-backed steps → 1,000 points = 1 ALLI → **1 ALLI per 10,000 steps**
- Daily cap 1,000 points = **1 ALLI/day/account** from running, or about 10,000 steps
- Distance is measured and shown but never paid: it is the witness for the steps, not the reward
- 1 star per completed run → 1 star = 1,000 ALLI, bounded by run credits rather than by a cap
- Garden harvests: 12–1,050 ALLI per harvest depending on tier
- Garden run bonus: up to +50% (capped in `growth.ts`)

**Sinks**
- Run credits: 25 USDT for 30, or 0.83 USDT each up to 300/month
- Standard seeds: 50–300 ALLI
- Marketplace goods: 1,800–3,400 ALLI
- (not yet designed) fees, upgrades, cosmetics

**The two reward scales have not been reconciled.** A star is worth 1,000 ALLI and a 10 km run is
worth 1. That is only defensible while a star costs a run credit and a run credit costs USDT — the
same treasury-funded-emission shape as the premium trees below, with the same liability to model:
every unspent run credit is a claim on 1,000 ALLI. Pick one of these before launch — price the star
against the points economy, or accept that credits are the emission control and model the float
accordingly. `REWARD_RULES.alliPerStar` carries the reference app's number, not a decision.

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
GET  /v1/run/profile?day=YYYY-MM-DD       → points balance, earned today, multiplier, streak
GET  /v1/run/runs                         → run history with reward breakdowns
POST /v1/run/runs                         → submit a run, returns the authoritative reward
POST /v1/run/redeem                       → burn points, return { txHash, alli }

                                          ── not implemented server-side yet ──
GET  /v1/run/entitlement                  → run credits, stars, membership, serverTime
POST /v1/run/credits       { runs }       → buy extra credits, returns the entitlement
POST /v1/run/stars/exchange { stars, toAddress } → burn stars, return { txHash, alli, entitlement }
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

The four run-economy endpoints are defined and mocked client-side (`src/services/api/run.ts`) and
answer nothing on the server. They need a credit ledger and a star ledger with the same
append-only shape as `points_ledger` — a balance column would be faster to read and impossible to
audit, and "where did my run credits go" has to have an answer. The client treats their absence as
non-fatal rather than fabricating a balance.

Two notes. Transfer history should come from an indexer (BscScan API, Covalent, or a self-hosted
one) — never scan blocks from the phone. And order payment is confirmed by the backend watching
the chain, never by the client reporting success.

## 7. Build order

1. **Auth** — sign-in, session token into `SECURE_KEYS.session`. Everything else needs an account.
2. **Custody decision** — see [`README.md`](../README.md) §1. This one blocks the wallet, the marketplace
   and the card, so make it early.
3. **Points ledger + run validation** — the server half of `rewards.ts`, with attestation. Done,
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
