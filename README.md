# Alli

[![CI](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml/badge.svg)](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml)

React Native (Expo SDK 57) app for Android and iOS. Four features:

1. **ALLI RUN** — a daily quest of 6,000 GPS-verified steps pays **stars**, exchangeable for
   **ALLI** on BNB Smart Chain. The reward scales with the tier of NFT footwear held. Each
   recorded run spends a run credit; credits come from a monthly membership or are bought
   outright.
2. **Garden** — plant seeds bought with ALLI, or premium seeds bought with BSC **USDT** for a
   higher yield and a larger run bonus.
3. **Marketplace** — physical goods paid for in ALLI or USDT.
4. **Wallet** — ALLI / USDT / BNB balances, send and receive, and a Visa card pairing flow.

This is a **scaffold**: navigation, state, types, reward math and the service boundaries are real
and tested. Everything that needs a backend, a deployed token or a card issuer runs against
in-memory mocks behind a typed interface, marked with `TODO`. Nothing here moves real money.

## Run it

```bash
npm install
npm start          # then press a (Android) / i (iOS), or scan with Expo Go
```

It runs with no backend and no chain: `EXPO_PUBLIC_DATA_SOURCE` defaults to `mock`, and the run
screen synthesises a plausible GPS track and step count so the flow works on a simulator. The
synthesised run plays at 20× so the 6,000-step quest completes in about a minute and a half
instead of half an hour. Set
`EXPO_PUBLIC_MOCK_SENSORS=off` to use the real sensors while the API stays mocked — that is the
combination you want when testing a run on a device.

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . — add --fix to apply what it can
npm test           # jest — reward, geo and growth math
npm run doctor     # expo-doctor
```

CI runs the first three on every pull request, plus an `expo export` for Android and
iOS — that last one catches what `tsc` cannot: a bad import path, a missing native
module, or anything Hermes refuses to compile. `npm run doctor` is deliberately not
in CI: two of its checks call out to Expo's API and the React Native Directory, and
a remote outage there should not turn the build red.

### Native builds

There is no `ios/` or `android/` directory — they are generated, not committed.

```bash
npx expo prebuild            # generate native projects locally
npx eas build -p android     # or use EAS (run `eas init` first)
```

## Layout

```
app/                       expo-router routes (the file tree IS the navigation)
  _layout.tsx              root stack + polyfills
  (tabs)/                  Today · ALLI RUN · Garden · Market · Wallet
  run/active|summary       live run, then the reward breakdown
  run/credits|stars        buy run credits, renew membership, exchange stars
  garden/shop, plot/[id]   seed shop and per-tree detail
  market/product/[id], cart, checkout
  wallet/send|receive|card
src/
  theme/                   design tokens — colors, spacing, type scale
  components/              UI primitives (Screen, Button, Card, StatTile, …)
  config/env.ts            typed EXPO_PUBLIC_* access
  features/
    run/                   geo filtering, step credit, quest rules, shoe tiers,
                           credits, goals, draft, live-session hook, store
    garden/                seed catalogue, growth math, store
    market/                product catalogue, cart, orders
    wallet/                balances, transfers, card state
  services/
    api/                   typed backend client — each module has a live and a mock impl
    chain/                 BSC config, BEP-20 ABI, ChainClient (ethers + mock)
    storage/               AsyncStorage (kv) and Keychain/Keystore (secure)
  utils/                   formatting and time helpers
```

Two conventions worth keeping:

- **Screens never import `ethers` or `fetch` directly.** They go through `src/services`, which is
  why every screen renders with no network.
- **Domain math is pure and tested.** `rewards.ts`, `geo.ts`, `steps.ts`, `shoes.ts` and
  `growth.ts` take values and return values — no clock, no storage, no network — so the backend can
  run the identical functions. It does: `server/src/run/service.ts` imports these exact modules.

## Configuration

Copy `.env.example` to `.env`. Everything prefixed `EXPO_PUBLIC_` is **inlined into the app
binary and is public** — no secrets, ever.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend that validates runs and holds the star ledger |
| `EXPO_PUBLIC_CHAIN` | `mainnet` (chain 56) or `testnet` (chain 97) |
| `EXPO_PUBLIC_BSC_RPC_URL` | Override the default RPC — use a dedicated node in production |
| `EXPO_PUBLIC_ALLI_ADDRESS` | ALLI BEP-20 address, blank until deployed |
| `EXPO_PUBLIC_DATA_SOURCE` | `mock` (default) or `live` |
| `EXPO_PUBLIC_MOCK_SENSORS` | `on` (default under `mock`) or `off` — synthesised GPS and steps |

## The economics, in one place

Every tunable number lives in four files: `src/features/run/rewards.ts` (`REWARD_RULES`),
`src/features/run/shoes.ts` (`SHOES`), `src/features/run/credits.ts` (`RUN_CREDIT_RULES`) and
`src/features/garden/catalog.ts` (`SEEDS`). The values there are placeholders that make the UI
legible — **they are not a balanced economy.** Before launch they belong on the server so they can
be tuned without an app release. See [docs/architecture.md](docs/architecture.md) §4 for the
emission model and the sinks that have to absorb it.

**One daily quest, paid in stars.** 6,000 GPS-verified steps in a day — accumulated across however
many runs it takes — pays once. Distance is measured, shown in kilometres and used to validate (it
is how the app knows the steps were real, and what the pace and stride checks run on), but it is
the evidence for the steps, never the thing being paid.

| | Placeholder |
|---|---|
| Daily quest | 6,000 GPS-verified steps |
| Quest reward | 1 star × the shoe multiplier, paid once a day |
| Shoe tiers | Leather 1× (free at registration), Silver 3×, Gold 5× |
| Star value | 1 star = 1,000 ALLI |
| Run credit | one per recorded run; 30/month for 25 USDT, extras at the same rate up to 300/month |

So a day is worth 1,000 ALLI on the free tier and 5,000 on Gold, and that is the emission to model.
Two tensions worth naming before these numbers ship: a quest split across three runs costs three
credits while a membership grants thirty a month, and nothing in the app yet sells the Silver and
Gold shoes that multiply the payout.

## What is deliberately not built

These are decisions, not oversights. Each one is a fork in the road that changes the architecture,
and picking wrong costs more than the code saved.

### 1. Key custody — the biggest one

`src/features/wallet/types.ts` defines `CustodyModel` with four options and commits to none.
`EthersChainClient.transfer()` throws rather than pretend:

- **`custodial`** — you hold keys. Simplest UX, and you are now holding client assets, with the
  licensing that implies in most jurisdictions.
- **`self`** — key generated on-device, encrypted in Keychain/Keystore. No custody risk for you;
  a lost phone is a lost wallet unless you design recovery.
- **`mpc`** — threshold signing split device/server (Web3Auth, Privy, Turnkey). Usually the right
  answer for a consumer app: social login, no seed phrase, no custody.
- **`walletconnect`** — users bring their own wallet. Zero custody, but rules out the card and
  makes onboarding much harder for non-crypto users.

The read path (`getBalance`, `getBalances`, `estimateTransferFee`) is real and works against any
BSC RPC today. Only signing is stubbed.

### 2. Server-side reward validation

`calculateReward()` runs on the phone so the user sees a number immediately. **That number is a
preview, never a credit.** The backend must re-run the same function on the raw track before ALLI
moves. A value the phone can edit is a value the phone can mint.

The client-side anti-cheat (`REWARD_RULES` + `summarizeTrack` + `creditStepSamples`) filters poor
GPS, implausible hops, vehicle-speed runs, stride lengths that do not match the step count, and
steps no GPS movement backs up. It raises the cost of faking a run; it does not prevent it. Real
defence is server-side: device attestation (Play Integrity / App Attest), per-account rate limits,
route plausibility, and manual review of outliers.

The server already re-runs all of it. A run is uploaded as a raw track plus the pedometer's raw
totals, and **no credited number is accepted from the phone** — distance, moving time, steps, the
day's running total, the shoe multiplier and the stars are all recomputed in
`server/src/run/service.ts`.

### 3. Run credits and membership, server-side

The star ledger and the quest are implemented end to end — `GET /v1/run/profile`,
`GET /v1/run/runs`, `POST /v1/run/runs` and `POST /v1/run/stars/exchange` all work against
Postgres. What does not exist yet is the credit side: `GET /v1/run/entitlement`,
`POST /v1/run/credits` and `POST /v1/run/membership/renew` are defined in
`src/services/api/run.ts` with working mocks and nothing behind them, so there is no credit ledger,
no membership table, and nothing charges USDT for a purchase. Until those exist the app reads an
entitlement it cannot get, treats the failure as non-fatal, and lets the server be the one to
refuse a run.

Shoe tiers are stored (`users.shoe_tier`, issued Leather at registration) and the server applies
the multiplier, but **upgrading is not built**: nothing mints or sells a Silver or Gold NFT.

### 4. Background recording — built, **unverified on a device**

A run now keeps recording with the screen off. `src/features/run/background.ts` registers an
`expo-task-manager` location task (a foreground service on Android, a background-location task on
iOS), which buffers fixes to storage because the OS can wake it into a process with no React tree.
Coming back to the app drains that buffer, and on iOS also asks `Pedometer.getStepCountAsync` for
the steps the OS counted while the live subscription was dead — then re-credits the whole run with
`creditStepSamples`, the same function the server runs.

**This has not been run on a phone.** The merge and backfill maths are unit-tested and both
platforms bundle, but the parts that only a device exercises — whether iOS wakes the task on a
locked screen, whether Android's foreground service survives Doze, whether the backfill
double-counts against a subscription that resumed — need a real walk with a real pocket. Until
someone does that, treat the background path as plausible rather than proven.

Background permission is requested at the start of a run and refusal is not fatal: the run records
while the screen is on, and the screen says so.

### 5. Card issuing

Alli never issues a card. A licensed issuer or BIN sponsor runs KYC, holds the fiat float and owns
the PAN. This app shows status and sends instructions through the backend, so the issuer's API key
is never in the bundle. `last4` is the most card data this codebase should ever hold; KYC documents
never touch it. `src/services/api/card.ts` is shaped for that split — swap the endpoints for the
chosen partner's.

### 6. Token and contracts

ALLI is not deployed. `src/services/chain/config.ts` carries a `placeholder: true` marker and the
app falls back to mock balances while the address is unset. `REWARD_CLAIM_ABI` sketches the
signed-voucher claim (server signs amount + nonce + deadline, contract verifies) but the contract
is unwritten and unaudited.

### 7. Smaller gaps

- **Auth** — no sign-in. `request()` reads a bearer token from `SECURE_KEYS.session`; nothing
  writes it yet.
- **Fonts** — Space Grotesk / Inter to match the web properties; the app uses platform fonts until
  the files land in `assets/fonts`.
- **Icons** — tab bar uses two-letter placeholder glyphs.
- **Maps** — no route map on the run screen; the track is recorded but not drawn.
- **Run drafts** — an in-progress run is written to AsyncStorage every 10 s so it can be picked up
  later. A long track is megabytes of JSON, which AsyncStorage is not built for; move it to SQLite
  before background location ships.
- **QR** — the receive screen has a placeholder square; add `react-native-qrcode-svg`.
- **Light theme** — dark-only. The token shape in `src/theme/colors.ts` takes a second palette.
- **i18n** — strings are inline English. The web properties already ship EN/TH/ZH.