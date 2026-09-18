# Handoff — the plant game (garden, care engine, minigames, weekly quest)

_Verified 2026-09-18 on `main` @ `d5b25e5`: client typecheck 0 errors, lint clean, 125 jest
tests pass (55 of them in the garden and quest suites); server typecheck 0 errors, 39 tests pass
against Postgres 16 with migrations 001–005; CI run 33 on that commit green. **Nothing in the
garden has been run on a phone or a simulator.** The Skia scenes were checked with headless
CanvasKit renders and the logic with tests; the tap, drag and swipe interactions have never had a
finger on them._

## Orientation

Repo: [NekoBite/alli-app](https://github.com/NekoBite/alli-app).

A player buys a seed and looks after one tree at a time, swiping between trees. A tree has three
meters, **water**, **sun** and **soil**, each stored as a level and the moment it was set, decaying
linearly. Watering is free, the sun meter fills after 100 taps on the tree in a day, soil takes
fertiliser. At every midnight the engine judges the tree: every meter above its line pays that
night's **stars**, which appear as sparkles on the canopy to be tapped. Two days with a meter at
zero wilts the tree, five kill it, and every tree retires after 30 days. A thriving tree grants its
run bonus to the ALLI RUN quest.

Seeds play one of two profiles. **USDT seeds** play the simple loop: fixed lines, fertiliser bought
with stars. **ALLI seeds** play the low-carbon farm: weather conditions move the lines or weaken the
sun, practices won in minigames counter them, compost is gathered in a minigame and matures
overnight, synthetic fertiliser is instant but raises the garden's **carbon score**, which
multiplies every low-carbon reward. One **global weekly quest** gives the whole community a goal
to reach, or a cap to stay under, and pays everyone who did their part when the week closes.

```bash
npm install
npm start          # Expo; open in Expo Go or a dev build
```

Mock mode (the default) needs no backend: the garden opens with a thirsty Acacia three days in and
a premium Mangrove two weeks in with sparkles waiting, the quest bar moves on a simulated
community, and sign-in accepts any six-digit code. The server:

```bash
createdb alli && cp server/.env.example server/.env   # set TOKEN_SECRET
npm run server                                        # migrates, listens on :8080
```

## The map

Everything that decides what a tree is worth is pure, tested, and imported by both sides.

- `src/features/garden/care.ts` — the engine: decay, thresholds, health, `settle` (the nightly
  judgement), every action, `carbonScore`, `plotView`. The server runs this exact file.
- `src/features/garden/rules.ts` — every tunable as data: status rules, `CARE_RULES`, the four
  conditions, four practices, three fertilisers, three minigames with their lessons.
- `src/features/garden/catalog.ts` — the five seeds. Placeholder numbers.
- `src/features/garden/types.ts` — `Plot` is the stored shape; `PlotView` is what the UI reads.
- `src/features/quests/quests.ts` and `rules.ts` — week maths (UTC Monday), rotation, standing,
  qualification, reward, share text; the seven-quest catalogue.
- `src/features/garden/scene/` — the Skia stage: `stage.ts` (geometry and hit-testing, pure),
  `sprites.tsx` (shapes ported from the p5 Garden Project), `TreeStage.tsx`, `visual.ts`.
- `src/features/garden/ui/TreePage.tsx` — one tree: stage, meters, tap meter, actions.
- `src/features/garden/minigames/` — `Shell.tsx` plus, per game, `*Logic.ts` (pure, tested),
  `*Scene.tsx` (Skia from plain values) and `*Game.tsx` (state and touch). `hooks.ts` has the
  drag hook and the clock.
- `src/features/garden/store.ts`, `src/features/quests/store.ts` — Zustand; tap counts live here.
- `src/services/api/garden.ts`, `quests.ts`, `mockQuests.ts`, `mockStars.ts` — the API interface,
  the live paths, and the in-memory "server" that mock mode plays against.
- `app/(tabs)/garden.tsx` — the pager. `app/garden/plot/[id].tsx`, `shop.tsx`,
  `minigame/[game].tsx`, `app/quests/weekly.tsx`.
- `server/src/shared/garden.ts` — the one door through which the server imports the engine.
- `server/src/garden/service.ts`, `server/src/quests/service.ts` and their routes;
  `server/migrations/005_garden.sql`; tests in `server/test/garden.test.ts` and `quests.test.ts`.

## Invariants

- **Settle before you touch a plot.** `settle` judges every midnight since the plot was last
  settled using the stored (level, at) pairs, which is only valid if no action happened in between.
  Both the mock (`settled()`) and the server (`withGarden`) settle first, under the user's row lock
  on the server. Act first and a tree can be watered "in the past" and paid for a night it missed.
- **A status is a level and a timestamp, never a current level.** The level now is derived. Store
  a current level anywhere and it goes stale the moment the clock moves, and the server and the
  phone disagree.
- **The phone reports that an action happened, never what it is worth.** No status level, tap
  count, minigame score or star amount crosses the API. The server accepts one sun fill a day and
  a minigame win as pass or fail. Accept a number from the client and taps become a star printer.
- **Every star movement is a `star_ledger` row, in sparkles.** The ledger counts hundredths of a
  star (migration 003); `toSparkles` and `fromSparkles` convert only at the ledger boundary, and
  everything else speaks in stars. Reasons: `garden` for claims and fertiliser, `quest` for
  payouts. Write a balance anywhere else and the run tab and the garden show different numbers.
- **The shared modules are alias-free and React-free.** `care.ts`, `quests.ts` and what they import
  use relative paths, and `server/tsconfig.json` lists each shared file by name. One `@/` import or
  one React import in that chain and the server typecheck fails; the list is the tripwire.
- **`diedAt` is sticky; every other health is derived.** Watering a dead tree must not resurrect
  it, so the instant of death is recorded at settle and checked first.
- **Conditions and practices only touch the low-carbon profile.** `feltConditions` returns nothing
  for a simple seed; a heatwave that moved a premium tree's line would be a bug.
- **Rewards round to sparkle precision.** `roundStars` runs on every payout, so a streak bonus on a
  0.02-star seed rounds away. Tune the cheapest seed or the bonus step before promising a streak.
- **Quest contributions are written only by the services that saw the action**, and closing a week
  is idempotent under an advisory lock keyed on the week. Pay from anywhere else and a week can pay
  twice.

## Decisions already made

- **Skia, not Unity and not a WebView.** The source game was 1,100 lines of 2D procedural shapes;
  Skia keeps it in the Expo app and shares the stores. A WebView fought the sketch's 900px block.
- **One tree per page, not a multi-plant scene.** The first scene drew every plant in one frame and
  the sprouts were unreadable at phone width. The pager makes the count free and each stage legible.
  Page order sorts by need (sparkles, then trouble, then thriving, then dead) but only re-sorts when
  the set of trees changes, so a page does not jump while the player is on it.
- **Growth stage from age, health from care.** The first model regressed a tree to a seed after each
  harvest because progress restarted. Now `stageFor(ageDays)` and `healthAt` are independent.
- **Sun is fed by taps, not steps.** The owner's call; it means ALLI RUN no longer feeds the garden,
  only the garden feeds the run through the thriving tree's bonus. Steps can top up sun later
  without touching the tap rule.
- **The run bonus is the best thriving tree's**, not a sum. It gives the swipe a purpose and
  removes the old cap.
- **Sparkles as the ledger unit** rather than a fractional column, so the run quest still pays a
  round hundred and the schema stays integer.
- **A plot is stored as the engine's state object** (jsonb) plus query columns. A column per field
  would be a second copy of the engine that drifts.
- **Weeks are UTC Monday and close lazily on the first read afterwards.** One clock for the whole
  community; a scheduled job can replace the lazy close without changing anything else. The
  rotation formula picks the quest; an editor's table should replace it and the client's rotation
  stays as the mock default.
- **Garden midnight is the server's clock** (UTC in CI and production); the run quest is bucketed
  by the phone's day. Different on purpose for now, noted in `docs/architecture.md` §6.
- **Minigames earn, they never pay.** A win grants compost or a practice; nothing else about a
  round leaves the phone, so scripting one is worth exactly playing it.
- **Drag through the View's own responder props**, not `PanResponder.create` and not
  gesture-handler, so no gesture root had to be added. Dragged pieces follow the finger on
  Reanimated shared values written with `.set()`.
- **A seed lives 30 days on both tiers.** The owner's rule.
- **Placeholder art, deliberately.** Sprites are the p5 shapes; the plan is a purchased pack. Note
  that Seliel the Shaper's Growable Trees, the best structural match, is licensed against
  blockchain games, and every candidate needs that clause checked.

## Deliberately not built

- **Payment.** Planting does not charge the seed price and synthetic fertiliser does not charge
  ALLI. Both wait on the custody decision in `src/features/wallet/types.ts`. Star-priced fertiliser
  on premium trees does charge, through the ledger.
- **Random weather.** The server issues only the calendar's conditions (`calendarConditions`, the
  same function the mock uses). The heatwave and haze quests therefore only ever appear in season.
- **A per-user timezone.** A Thai player's garden midnight is 07:00 local until it exists.
- **Removing a dead or retired tree.** There is no delete; they sit last in the pager.
- **Sized quest numbers.** The catalogue is sized for a small community and the mock simulates the
  rest of the players ramping to just short of the goal. On the real server the community is real,
  so the goals need scaling to the player count.
- **Web rendering.** Skia on web needs CanvasKit loaded before first render; every Skia component
  has a `.web.tsx` fallback that shows text instead.
- **Attestation on garden routes.** Only rate limits.
- **Compost, mulch and haze rounds have never been played on a device.** Their logic is tested;
  their feel is not.

## Traps

- `npx expo install` cannot reach the Expo API from this environment. Take versions from
  `node_modules/expo/bundledNativeModules.json` and pin them with `npm install --save-exact`.
- The React Compiler lint rules reject: writing a shared value with `.value` in a handler (use
  `.set()`), reading a ref during render (including inside `useMemo` factories), `Date.now()` in
  render (use `useClock`), `setState` inside an effect, and closures passed to
  `PanResponder.create` during render. Each cost a round; the fixes are in `hooks.ts`, `TreePage`
  and `garden.tsx`.
- React Native 0.86 removed `StyleSheet.absoluteFillObject`; spell out the four edges.
- Android `Alert` shows at most three buttons, which is why Gather compost is its own toolbar
  button instead of an option in the fertilise sheet.
- Server test files share one database, so they run serially (`--test-concurrency=1`) and the
  migrator takes an advisory lock. Running two files in parallel truncates each other's rows and
  fails with foreign-key errors that look like bugs.
- The local Postgres 16 cluster stops between sessions: `pg_ctlcluster 16 main start`, then the
  test env is `DATABASE_URL=postgres://alli:alli@localhost:5432/alli_test` with the test
  `TOKEN_SECRET` from `.github/workflows/ci.yml`.
- To see a Skia scene without a device, bundle a driver with esbuild aliasing
  `@shopify/react-native-skia` to its `lib/commonjs/headless` entry, load `canvaskit-wasm` in Node,
  and call `drawOffscreen`. The scene components take plain values so this works; the game and
  stage components do not, because of hooks.
- The mock garden seeds its plots relative to `Date.now()` at module load, so a long-running Metro
  session shows trees that aged while you were away. That is the engine working, not a bug.
- Tap counts are per plot per day in the garden store and in AsyncStorage; the server only ever
  sees the fill. Resetting the app mid-day loses at most the count.
- The Garden tab re-projects once a minute so meters are seen to fall; the store does not tick.

## Where to start

Put it on a phone. Build a dev client (`npx expo prebuild && npx eas build -p android`), run the
server on the LAN with `MAILER=console` so the sign-in code prints to its log, set
`EXPO_PUBLIC_DATA_SOURCE=live` and `EXPO_PUBLIC_API_URL` to the server, then: sign in by email,
plant an Acacia, water it, tap it a hundred times, play Gather compost, and read the garden back the
next morning. Every one of those has a test; none has had a finger on it. Expect the first defects
in touch handling on `TreeStage` and the two drag games, and in how the pager scrolls vertically
inside its horizontal list.

If a device is not available, the next most valuable piece is the per-user timezone, because it
changes the settle call signature on both sides and is cheaper to do before more callers exist.
