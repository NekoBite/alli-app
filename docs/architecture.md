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
exactly that. The run credit (§6) is spent inside the same transaction, so a retried upload cannot
spend two: the unique index on `(user_id, client_run_id)` returns the stored run, and the one on
`credit_ledger.run_id` backs it up.

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
- Garden: 0.02–0.5 stars per thriving night depending on the seed, for thirty nights, times a
  streak bonus (up to +50%) and, for ALLI seeds, the carbon multiplier (0.6–1.4×)
- Garden run bonus: the best thriving tree's bonus, up to +20% — **not wired into the quest**, see §6
- The ledger counts in sparkles (1/100 star, migration 003) so the garden can pay fractions

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

Written, tested and deployable in `contracts/` (Hardhat, Solidity 0.8.28, OpenZeppelin 5; see
`contracts/README.md`). **Not audited, not deployed.**

| Contract | Purpose | Backend side |
|---|---|---|
| `AlliToken` | Fixed-supply BEP-20, minted once to the treasury; no mint function. Skip if ALLI is already live. | — |
| `RewardClaim` | Pays ALLI for burned stars against a server-signed voucher; nonce, deadline, **daily cap across all users**, pausable, relayable (`claimFor`). Holds a float, cannot mint. | `POST /v1/run/stars/exchange` signs and relays when `REWARD_CLAIM_ADDRESS` is set |
| `PaymentRouter` | Every purchase. Verifies the server's signed quote, pulls exactly that amount to the treasury once, emits `Paid`. | `POST /v1/payments/intents`; `server/src/chain/watcher.ts` fulfils on `Paid` |
| `AlliShoes` | Run shoes as ERC-721 with a tier per token; soulbound until transfers are switched on. | mints Leather at sign-up and upgrades after a `shoe` payment (minting job not written yet — the tier is set in the database on payment) |
| `ReferralPayout` | Cumulative Merkle distributor for commissions, one root per payout token. | roots built from the `commissions` ledger (publisher job not written yet) |

Garden plots stay in the database: on-chain plots cost gas per plant and per harvest for no
user-visible benefit until plots are tradeable. Market escrow is not needed while the platform is
the seller; `PaymentRouter` pays the treasury and refunds are an operator transfer.

Both signatures the server issues are EIP-712, and their type definitions live once in
`src/services/chain/eip712.ts`, imported by the server signer (`server/src/chain/signer.ts`) and the
contract tests. Voucher: `Claim(user, amount, nonce, deadline)`. Quote:
`PaymentIntent(id, payer, token, amount, kind, deadline)`.

### Payments

```
 app                         server                              chain
  │ POST /v1/payments/intents │                                    │
  │ ─────────────────────────▶│ price from the shared rules,       │
  │                           │ bind payer + deadline, sign        │
  │ ◀──── signed intent ──────│                                    │
  │ approve + PaymentRouter.pay(intent, sig) ─────────────────────▶│ checks sig, payer,
  │                           │                                    │ deadline, once; emits Paid
  │                           │ watcher: Paid → confirmPayment ◀───│
  │                           │   runs → credit_ledger             │
  │                           │   membership → +30 days + credits  │
  │                           │   seed → spendable on one planting │
  │                           │   shoe → users.shoe_tier           │
  │                           │   order → paid, stars back         │
  │                           │   + referral commission booked     │
  │ GET /v1/payments/intents/:id → confirmed                       │
```

Fulfilment and the status change share one transaction, so a payment is never confirmed without
its grant, and every grant is idempotent per intent. An event whose payer, token or amount does not
match the quote grants nothing and marks the intent failed. Until `PAYMENT_ROUTER_ADDRESS` and
`QUOTE_SIGNER_PRIVATE_KEY` are set, purchases answer 503 and planting stays free.

## 6. Backend surface

Endpoints the client calls (`src/services/api/`), all implemented in `server/src/` unless marked:

```
POST /v1/auth/request-code { email }      → 204 either way
POST /v1/auth/verify-code { email, code } → { token, expiresAt, user, isNew }
POST /v1/auth/oauth { provider, code, codeVerifier, redirectUri } → same; the server exchanges the code
GET  /v1/auth/me · POST /v1/auth/logout · PUT /v1/auth/wallet { address }  (EIP-55 checked)

GET  /v1/run/profile?day=YYYY-MM-DD       → stars, stars today, steps today, streak, shoe tier
GET  /v1/run/runs                         → run history with reward breakdowns
POST /v1/run/runs                         → submit a run (spends a credit), returns the authoritative reward
POST /v1/run/stars/exchange { stars, toAddress } → burn stars, return { txHash, alli, starsBalance }
GET  /v1/run/entitlement                  → run credits, membership, serverTime

POST /v1/payments/intents { kind, … }     → signed quote: runs · membership · seed · shoe · order
GET  /v1/payments/intents/:id             → pending | confirmed | expired | failed, txHash

GET  /v1/garden                           → { plots, conditions, carbonAdjustment }, every plot settled to now
POST /v1/garden/plots { seedId, intentId? } → plant; spends a confirmed seed payment once payments are open
POST /v1/garden/plots/:id/water           → returns the plot
POST /v1/garden/plots/:id/sun             → one fill a day; the taps are counted on the phone
POST /v1/garden/plots/:id/fertilise { kind } → charges stars, or spends compost; { plot, starsBalance? }
POST /v1/garden/plots/:id/claim           → pays the sparkles into star_ledger; { plot, stars, starsBalance }
POST /v1/garden/plots/:id/minigames/:game → starts compost or grants a practice

GET  /v1/quests/weekly                    → { current: { quest, community, contributors, mine }, last, serverTime }

GET  /v1/market/products                  → catalogue (public)
GET  /v1/market/orders · /v1/market/orders/:id → the user's orders
POST /v1/market/orders                    → priced server-side, created in pending-payment

GET  /v1/referrals                        → hub: totals and one summary per program
GET  /v1/referrals/:program               → code, link, team by generation, qualification, roll-up
GET  /v1/referrals/:program/downline      → masked members for the tree views
POST /v1/referrals/attribute { code }     → join that code's program team (first join wins)

GET  /v1/wallet/account                   → bound address
GET  /v1/wallet/transactions              → exchanges and payments the server caused
GET  /v1/wallet/prices                    → display prices (public)

                                          ── not implemented server-side yet (issuer not chosen) ──
GET  /v1/card · /v1/card/transactions     → card status and activity
POST /v1/card/apply · /freeze · /topup · /funding
```

Each has a mock implementation behind the same interface, so the app runs with no backend.

Run credits are an append-only `credit_ledger` (migration 006): +N from a membership renewal or a
pack, −1 per recorded run, spent inside `submitRun`'s transaction under the user's row lock with a
unique index on the run, so a retried upload spends once. `SIGNUP_RUN_CREDITS` grants a starting
balance on the sign-in that creates the account.

Referral commissions (`server/src/referrals/`) are booked when a purchase is fulfilled, with the
same `splitCommission` the app uses: one row per generation, including treasury rows, idempotent
per payment. ALLI RUN pays on a member's first upgrade from Leather; Garden on seed purchases;
Market on orders, held until the return window closes (`payable_at`). Qualification is judged at
fulfilment. The hub's "paid out" is commission released for payout; on-chain claims go through
`ReferralPayout` once a root publisher exists.

One gap on the reward side remains: the garden's run bonus is not applied to the quest —
`care.ts` computes a multiplier that nothing reads.

The garden endpoints (`server/src/garden/`) run the same `settle` from
`src/features/garden/care.ts` before every read and write, under the user's row lock, and pay a
claim into `star_ledger` with reason `garden`. A plot is stored as the engine's own state object
(jsonb) plus the columns worth querying; the engine is the schema. Conditions come from the shared
calendar (`calendarConditions`) on both sides. A sun fill and a minigame win carry no score, so
there is nothing in them worth scripting. The seed price is collected through a `seed` payment
intent once payments are open; the ALLI charge for synthetic fertiliser is not collected yet.

The weekly quest (`server/src/quests/`) is global. Contributions are rows of (week, user, metric,
amount) that the garden and run services write as they go: compost and synthetic uses, mulch and
no-burn wins, sun fills, thriving nights at settle, credited steps. The community total is a sum.
A finished week is closed lazily on the first read after Monday 00:00 UTC, once, under an advisory
lock: every player who did their part is paid into `star_ledger` with reason `quest` and the carbon
delta is booked on their garden. The week's quest comes from the rotation in
`src/features/quests/quests.ts` until an editor's table replaces it. Nothing about the quest is
accepted from the phone.

One timezone note: the run quest is bucketed by the runner's local day, which the phone sends. The
garden's nights are judged at the server's midnight, and the weekly quest closes at UTC Monday.
For a Thai player that puts the garden's midnight at 07:00 local; a per-user timezone on the
account is the fix when it matters.

Two notes. Incoming transfers from outside the app should come from an indexer (BscScan API,
Covalent, or a self-hosted one) — never scan blocks from the phone; `/v1/wallet/transactions` only
lists what the server caused. And every payment is confirmed by the backend watching the chain,
never by the client reporting success.

## 7. Build order

1. **Auth** — sign-in, session token into `SECURE_KEYS.session`. Everything else needs an account.
2. **Custody decision** — see [`README.md`](../README.md) §1. This one blocks the wallet, the marketplace
   and the card, so make it early.
3. **Star ledger + run validation** — the server half of `rewards.ts`, with attestation. Done,
   except attestation.
4. **Run credits, stars and membership** — done: `credit_ledger`, `memberships`, and purchases
   through payment intents.
5. **Contracts audited, on testnet** — written and tested (`contracts/`). Deploy to BSC testnet,
   set the server's router, quote key and RewardClaim addresses, and run the whole loop end to end:
   buy a pack, run, exchange stars. Needs the custody decision (step 2) for the app to sign.
6. **Background location** — the run feature is not shippable without it.
7. **Garden server-side** — move `SEEDS` out of the bundle.
8. **Marketplace fulfilment** — payment watching is done; shipping, tax and returns are not.
   Also still to write: the shoe minting job and the ReferralPayout root publisher.
9. **Card partner** — longest lead time (licensing, KYC integration, BIN sponsorship). Start
   conversations early even though it ships last.

Steps 1–6 are the minimum for a run app that pays real ALLI. The garden, marketplace and card
each add a full compliance surface on top.

## 8. Wireframe vs rules

The screens follow `design/wireframes/` (v0.1, Sep 2026) for layout, copy and flow. The wireframe's
sample numbers are illustrations, and where they disagree with the rules already in code the
screens read the code's numbers. These are open product decisions, not bugs:

| Topic | Wireframe | Code (what the app shows) | Where |
|---|---|---|---|
| Shoe tiers | Leather ×1.0 · Bronze ×1.5 · Silver ×2.5 · Gold ×5.0 ("Tier 1 of 4") | Leather ×1 · Silver ×3 · Gold ×5 | `src/features/run/shoes.ts`, `server/migrations/002_stars.sql` CHECK, `AlliShoes.sol` tiers |
| Star exchange rate | 100 ★ = 1 ALLI, minimum 100 ★ | 1 ★ = 1,000 ALLI, any whole star | `REWARD_RULES.alliPerStar` |
| Quest reward | "+48 ★" for a run | 1 ★ × shoe multiplier, once a day | `REWARD_RULES.starsPerQuest` |
| Run packs | 5 / 10 / 30 runs for 50 / 90 / 240 ALLI; renew 250 ALLI | Same packs added as placeholders (`RUN_PACKS`); USDT price stays 25 USDT / 30 runs | `src/features/run/credits.ts` — the payment intent is the binding price |
| Weekly quest tiers | 25 / 50 / 75 / 100 % of the goal, each claimable | Goal + stretch goal, paid at week close | `src/features/quests/rules.ts` |
| Stars back | 10% back in stars on ALLI orders | 10% of the ALLI subtotal, valued at the exchange rate (so 2,500 ALLI → 0.25 ★) | `src/features/market/rules.ts` |

Change the rule, not the screen: every figure above is read from the file in the last column.
