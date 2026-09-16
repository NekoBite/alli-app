# Alli

[![CI](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml/badge.svg)](https://github.com/NekoBite/alli-app/actions/workflows/ci.yml)

React Native (Expo SDK 57) app for Android and iOS. Four features:

1. **Jogging** — GPS-tracked runs that earn points, redeemable for **ALLI** on BNB Smart Chain.
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
screen synthesises a plausible GPS track so the flow works on a simulator.

```bash
npm run typecheck  # tsc --noEmit
npm test           # jest — reward, geo and growth math
npm run doctor     # expo-doctor
```

CI runs the first two on every pull request, plus an `expo export` for Android and
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
  (tabs)/                  Today · Run · Garden · Market · Wallet
  jog/active|summary       live run, then the reward breakdown
  garden/shop, plot/[id]   seed shop and per-tree detail
  market/product/[id], cart, checkout
  wallet/send|receive|card
src/
  theme/                   design tokens — colors, spacing, type scale
  components/              UI primitives (Screen, Button, Card, StatTile, …)
  config/env.ts            typed EXPO_PUBLIC_* access
  features/
    jogging/               geo filtering, reward rules, live-session hook, store
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
- **Domain math is pure and tested.** `rewards.ts`, `geo.ts` and `growth.ts` take values and return
  values — no clock, no storage, no network — so the backend can run the identical functions.

## Configuration

Copy `.env.example` to `.env`. Everything prefixed `EXPO_PUBLIC_` is **inlined into the app
binary and is public** — no secrets, ever.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend that validates runs and holds the points ledger |
| `EXPO_PUBLIC_CHAIN` | `mainnet` (chain 56) or `testnet` (chain 97) |
| `EXPO_PUBLIC_BSC_RPC_URL` | Override the default RPC — use a dedicated node in production |
| `EXPO_PUBLIC_ALLI_ADDRESS` | ALLI BEP-20 address, blank until deployed |
| `EXPO_PUBLIC_DATA_SOURCE` | `mock` (default) or `live` |

## The economics, in one place

Every tunable number lives in two files: `src/features/jogging/rewards.ts` (`REWARD_RULES`) and
`src/features/garden/catalog.ts` (`SEEDS`). The values there are placeholders that make the UI
legible — **they are not a balanced economy.** Before launch they belong on the server so they can
be tuned without an app release. See [docs/architecture.md](docs/architecture.md)
for the emission model and the sinks that have to absorb it.

Current placeholders: 100 points per validated km, 1,000 points = 1 ALLI, 1,000 points/day cap.

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

The client-side anti-cheat (`REWARD_RULES` + `summarizeTrack`) filters poor GPS, implausible
hops, vehicle-speed runs and stride lengths that do not match the step count. It raises the cost of
faking a run; it does not prevent it. Real defence is server-side: device attestation
(Play Integrity / App Attest), per-account rate limits, route plausibility, and manual review of
outliers.

### 3. Background location

`useJogSession` subscribes in the foreground only. iOS suspends the app when the screen locks and
the track ends mid-run. Shipping needs `expo-task-manager` with a foreground service on Android
and a background-location task on iOS — both already declared in `app.json`.

### 4. Card issuing

Alli never issues a card. A licensed issuer or BIN sponsor runs KYC, holds the fiat float and owns
the PAN. This app shows status and sends instructions through the backend, so the issuer's API key
is never in the bundle. `last4` is the most card data this codebase should ever hold; KYC documents
never touch it. `src/services/api/card.ts` is shaped for that split — swap the endpoints for the
chosen partner's.

### 5. Token and contracts

ALLI is not deployed. `src/services/chain/config.ts` carries a `placeholder: true` marker and the
app falls back to mock balances while the address is unset. `REWARD_CLAIM_ABI` sketches the
signed-voucher claim (server signs amount + nonce + deadline, contract verifies) but the contract
is unwritten and unaudited.

### 6. Smaller gaps

- **Auth** — no sign-in. `request()` reads a bearer token from `SECURE_KEYS.session`; nothing
  writes it yet.
- **Fonts** — Space Grotesk / Inter to match the web properties; the app uses platform fonts until
  the files land in `assets/fonts`.
- **Icons** — tab bar uses two-letter placeholder glyphs.
- **Maps** — no route map on the run screen; the track is recorded but not drawn.
- **QR** — the receive screen has a placeholder square; add `react-native-qrcode-svg`.
- **Light theme** — dark-only. The token shape in `src/theme/colors.ts` takes a second palette.
- **i18n** — strings are inline English. The web properties already ship EN/TH/ZH.

## Regulatory reality

Worth naming before the build goes further, because each one changes the product, not just the
code: a token earned through activity and spendable for goods attracts money-transmission and, in
some jurisdictions, securities scrutiny. Card programmes require KYC/AML, sanctions screening and a
licensed issuer. Move-to-earn apps have a specific history of being treated as unregistered
offerings. Get this reviewed by counsel in each target market before launch, not after.
