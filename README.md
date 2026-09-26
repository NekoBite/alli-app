# Alli

[![CI](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml/badge.svg)](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml)

React Native (Expo SDK 57) app for Android and iOS, built to the ALLI App wireframes in
[`design/wireframes/`](design/wireframes/README.md). Four features, each with its own referral
program:

1. **ALLI RUN** — a daily quest of 6,000 GPS-verified steps pays **stars**, exchangeable for
   **ALLI** on BNB Smart Chain. The reward scales with the tier of NFT footwear held. Each
   recorded run spends a run credit; credits come from a monthly membership or are bought
   outright.
2. **Garden** — a tree to look after. Seeds bought with ALLI play the low-carbon farm; premium
   seeds bought with BSC **USDT** play a simpler loop and pay more. Keep water, sun and soil above
   the line and every night leaves stars on the branches.
3. **Marketplace** — physical goods paid for in ALLI or USDT.
4. **Wallet** — ALLI / USDT / BNB balances, send and receive, and a Visa card pairing flow.

Plus **Invite & earn**: one referral link and team per feature, commissions with roll-up
([`docs/referral-programs.md`](docs/referral-programs.md)). The contracts live in
[`contracts/`](contracts/README.md), the API in [`server/`](server/README.md).

This is a **scaffold**: navigation, state, types, reward math and the service boundaries are real
and tested. Everything that needs a backend, a deployed token or a card issuer runs against
in-memory mocks behind a typed interface, marked with `TODO`. Nothing here moves real money.

## Sign in

The app opens on a sign-in screen. Two roads to one session: a six-digit code by email, or a
provider's consent screen for Google, Facebook or X. Both are authorization-code flows with PKCE
(`src/features/auth/oauth.ts`): the phone only ever holds the code, and the server, which holds
the client secret, exchanges it and asks the provider who signed in. No provider token touches the
device. The session token lives in the keychain (`src/features/auth/store.ts`) and the root layout
gates every other route on it. A provider whose client id is not set in `.env` shows a greyed-out
button; in mock mode every road signs in without a backend and any six digits are a valid code.

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
  _layout.tsx              root stack, fonts, toast + polyfills
  (tabs)/                  Today · ALLI RUN · Garden · Market · Wallet
  onboarding/wallet        1.3 wallet ready — once, after the sign-in that creates the account
  run/active|summary       live run, then the reward breakdown
  run/credits|stars        buy run credits, renew membership, exchange stars
  garden/shop, plot/[id]   seed shop and per-tree detail
  garden/minigame/[game]   the low-carbon minigames
  quests/weekly            the community's weekly quest
  sign-in                  email code or Google / Facebook / X
  market/product/[id], cart, checkout, order/[id]
  wallet/send|receive|card
  referrals/               hub, [program], [program]/tree (list + org chart), share
  r/[code]                 invite deep link — held through sign-in, then attributed
src/
  theme/                   design tokens from the wireframes — colors, gradient, spacing, type scale
  components/              UI primitives (Screen, ScreenHeader, Button, Card, ConfirmSheet, …)
  config/env.ts            typed EXPO_PUBLIC_* access
  features/
    run/                   geo filtering, step credit, quest rules, shoe tiers,
                           credits, goals, draft, live-session hook, store
    auth/                  session store and the provider sign-in hook
    garden/                seed catalogue, care rules (data), care engine, store
      scene/               one tree on its stage (react-native-skia)
      ui/                  the tree page: meters, tap meter, actions
      minigames/           shell + the games that earn compost and practices
    quests/                the global weekly quest: catalogue, week maths, store, card
    market/                product catalogue, pricing rules, cart, orders
    referrals/             program rules + commission split (shared with the server), store, UI
    wallet/                balances, transfers, card state
  services/
    api/                   typed backend client — each module has a live and a mock impl
    api/payments.ts        payment intents: quote → pay on chain → wait for the server
    chain/                 BSC config, ABIs, EIP-712 types, ChainClient (ethers + mock)
    storage/               AsyncStorage (kv) and Keychain/Keystore (secure)
  utils/                   formatting and time helpers
```

### The garden

The Garden tab is a pager: one tree per page, swipe to the next. Each page is a `react-native-skia`
stage (`src/features/garden/scene/`) showing the tree at the growth stage its age says and in the
health its care says, with the sprites and season palettes ported from the open-source p5.js
[Garden Project](https://github.com/squigglesdev/Garden-Project) sketch. Under it sit the three
care meters, the tap meter and the actions.

The loop is a Tamagotchi. A tree has **water**, **sun** and **soil**; each is stored as a level and
the moment it was set, and decays linearly from there (`care.ts`). Watering is free, the sun meter
fills when the tree is tapped a hundred times in a day, and soil takes fertiliser. At every local
midnight `settle` judges the tree: every meter above its line pays that day's **stars**, which
appear as sparkles on the canopy for the player to tap. A meter at zero for two days puts the tree
into wilting, five days kills it, and every tree retires after thirty days. A thriving tree also
grants its run bonus to the daily quest.

Seeds play one of two profiles, both driven by the data in `rules.ts`:

- **Simple** (USDT seeds): fixed lines, fertiliser bought with stars.
- **Low-carbon** (ALLI seeds): weather conditions the server issues (heatwave, haze, monsoon,
  drought) move the lines or weaken the sun; practices earned in minigames (mulch, the no-burn
  pledge, cover crop) counter them; compost is gathered in a minigame and matures overnight, while
  synthetic fertiliser is instant, costs ALLI and raises the garden's **carbon score**, which
  multiplies every low-carbon reward down (or up, for a clean farm). Each minigame ends on a lesson.

Three minigames exist, each a pure rules module, a Skia scene drawn from plain values, and a
thin interactive component: **Gather compost** (tap the farm waste, hold to turn the heap),
**Mulch the roots** (drag straw onto the soil ring before the sun is up, during a heatwave or
drought) and **Haze control** (tap embers out and drag residue piles into the bale, during the
burning season). A win grants what the game teaches; nothing else about the round is sent. Stars
are the same stars the run quest pays, and the ledger counts them in **sparkles**, a hundredth of a
star, so a garden day can pay a fraction (migration 003).

### The weekly quest

One quest a week, for the whole community, not per player: a goal the community reaches
together (compost uses, thriving nights, sun meters filled, GPS-verified steps, pledges in the
burning season) or a cap it stays under (synthetic fertiliser). Everyone's contributions are counted
by the server from the actions it already handles, so there is nothing to submit; when the week
closes, Monday 00:00 UTC, every player who did their part is paid the reward in stars, and some
quests also lower the garden's carbon score. A stretch goal pays double, which is what gives the
community something to argue about, and the card's **Share progress** button posts where the
community stands so the week's plan can be made wherever they talk. The catalogue, the week maths
and the reward rules are pure and tested (`src/features/quests/`); the rotation is season-aware.

Everything that decides what a tree is worth or looks like is pure and tested: `care.ts` for the
engine, `scene/stage.ts` for geometry and hit-testing, `scene/visual.ts` for the mapping. The
season follows the calendar month by default; pass `season` to override.

The stage draws on iOS and Android only. On web (`npm run web`) it falls back to a caption, because
Skia on web needs CanvasKit loaded before first render and that is not wired up yet.

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

Every tunable number lives in five files: `src/features/run/rewards.ts` (`REWARD_RULES`),
`src/features/run/shoes.ts` (`SHOES`), `src/features/run/credits.ts` (`RUN_CREDIT_RULES`),
`src/features/garden/catalog.ts` (`SEEDS`) and `src/features/garden/rules.ts` (the care loop). The values there are placeholders that make the UI
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

### 3. Run credits and membership, server-side — built

Run credits are an append-only ledger (`credit_ledger`), spent inside `submitRun`'s transaction, and
bought — like every purchase — through a server-signed payment intent that `PaymentRouter` settles
on chain (`docs/architecture.md` §5). Shoe upgrades are sold the same way and raise
`users.shoe_tier` when the payment lands; minting the matching `AlliShoes` NFT is a job not yet
written. All of it is off until the router is deployed and configured: purchases answer 503.

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

### 6. Token and contracts — written, not deployed

`contracts/` holds AlliToken, RewardClaim, PaymentRouter, AlliShoes and ReferralPayout with tests
and a deploy script. None is deployed or audited, so `src/services/chain/config.ts` still carries
`placeholder: true` for ALLI and the app shows mock balances until an address is set. Signing in
the app (approve + pay, send) waits on the custody decision above.

### 7. Smaller gaps

- **Icons** — the wireframes use letter tiles and rounded-square tab glyphs; swap in brand icons
  when they exist.
- **Maps** — the live run draws the route as a schematic (no map tiles).
- **Card program** — the card referral is a waitlist and the card endpoints have no server side
  until an issuer is chosen.
- **Run drafts** — an in-progress run is written to AsyncStorage every 10 s so it can be picked up
  later. A long track is megabytes of JSON, which AsyncStorage is not built for; move it to SQLite
  before background location ships.
- **QR** — the receive screen has a placeholder square; add `react-native-qrcode-svg`.
- **Light theme** — dark-only. The token shape in `src/theme/colors.ts` takes a second palette.
- **i18n** — strings are inline English. The web properties already ship EN/TH/ZH.