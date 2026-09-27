# ALLI App wireframes — FUNCTION notes

Extracted from `ALLI_App_Wireframe.fig` by `tools/wireframes/notes.js`. One block per screen.

## 1.1

→  Email road: enter address → "Send me a code" emails a 6-digit code → 1.2.
→  Provider road: Google / Facebook / X open the provider consent screen (OAuth + PKCE). Server exchanges the code — no provider token touches the phone.
→  Unconfigured provider = 40% opacity, not tappable.
→  First sign-in routes to 1.3 (wallet created); returning users go straight to 2.1 Today.

## 1.2

→  Six single-digit boxes, auto-advance, paste fills all six.
→  "Sign in" enables when 6 digits are entered; wrong code shakes the row and shows an inline error.
→  Resend is rate-limited with a visible countdown.
→  Mock mode: any six digits are valid.

## 1.3

→  Shown once, after the first successful sign-in.
→  Wallet address is tappable → copies to clipboard with a toast.
→  Leather shoe is granted on sign-up; higher tiers (Silver / Gold …) multiply daily rewards up to 5×.
→  "Back up now" → recovery phrase flow (Wallet); "Let’s go" → 2.1 Today.

## 2.1

→  Home dashboard: one glance at quest progress, garden, weekly quest and balance.
→  Quest ring fills to 6,000 GPS-verified steps; "Start a run" spends 1 run credit → 2.3.
→  Garden card shows sparkles (stars) waiting on branches → 3.1 Garden.
→  Weekly quest card → 2.7. Balance card → 5.1 Wallet.
→  Avatar opens profile / sign out.

## 2.2

→  Run hub. Quest progress + "Start" → 2.3 Live run.
→  Run balance: membership usage, credits left, streak. "Buy runs" → 2.5.
→  Stars balance with exchange CTA → 2.6.
→  Shoe tiers multiply the quest reward (Leather ×1 free; higher tiers locked until owned). Tap a shoe for NFT detail.
→  Weekly bar chart of steps; today highlighted.

## 2.3

→  Tracking ring (Google Fit–style, ALLI colours): outer ring = steps toward the 6,000-step quest (red → red-hot); inner ring = active minutes toward 30 (amber). Dots mark each ring’s start; progress head shows live position.
→  Centre values match ring colours: steps (big, red-hot) over active minutes (amber). Rings animate as GPS-verified steps are credited; a ring completing pulses once and haptics fire.
→  Stat row: distance, elapsed time, pace. Mini route map below — tap to expand to a full-screen map.
→  Pause ↔ Resume; Finish → server validation → 2.4 Summary. Long-press Finish to discard. Unfinished runs restore from a draft.

## 2.4

→  Shown after Finish. Reward is only final once the server confirms the track.
→  Breakdown is transparent: counted steps × quest rules × shoe multiplier.
→  Uncounted segments listed with a reason (GPS gap, vehicle speed).
→  "Exchange stars" → 2.6; "Done" → 2.1 Today.

## 2.5

→  Credits come from a monthly membership or one-off packs.
→  Single-select pack list; CTA label mirrors selection and currency.
→  Pay in ALLI or BSC USDT; insufficient balance swaps CTA to "Top up" → 5.3 Receive.
→  Purchase confirms with a wallet signature sheet, then returns to 2.2.

## 2.6

→  Converts earned stars to ALLI (BEP-20) at the published rate.
→  Amount chips: 25% / 50% / Max. Minimum 100 ★.
→  Server signs the payout; tx appears in Wallet activity → 5.1.
→  Error states: below minimum, daily cap reached, server offline.

## 2.7

→  Community goal shared by all runners; resets every Monday 00:00.
→  Tiers unlock for every participant; "claim" moves stars to balance.
→  Your contribution shown alongside global total.
→  Countdown in eyebrow; completed weeks archived below the fold.

## 3.1

→  One tree on its stage; swipe horizontally between trees.
→  Sparkles (gold) are stars left overnight; "Collect" moves them to the stars balance.
→  Water / Sun / Soil meters must stay above the line; low meter turns amber and pushes a reminder.
→  Compost comes from minigames → 3.4. Tree row → 3.3 detail. Seed shop → 3.2.

## 3.2

→  Two catalogues: ALLI seeds (full low-carbon farm loop) and Premium seeds bought with BSC USDT (simpler loop, higher payout).
→  Select a seed card → CTA updates with name and price.
→  Purchase = wallet signature; new tree appears in Garden and opens 3.3.
→  Seeds you can’t afford show price in amber with "Top up".

## 3.3

→  Per-tree detail: growth stage, nightly yield, health.
→  Meters + the same care actions as the Garden tab.
→  Minigame list, each with daily plays left → 3.4.
→  Care history and harvest (at maturity) below the fold.

## 3.4

→  Shared minigame shell: header timer, score, streak, reward preview.
→  Drag item onto a bin; correct = score + streak, wrong = shake + streak reset.
→  Round ends at 0:00 or on "Finish"; rewards (compost / practices) applied to the tree → back to 3.3.
→  Daily play cap per game; capped games show "Come back tomorrow".

## 4.1

→  Physical goods paid in ALLI or USDT. Prices show both.
→  Search + category chips filter the grid; cart button shows item count → 4.3.
→  Product card → 4.2. Out-of-stock items stay visible, dimmed, not tappable.
→  Featured banner rotates campaigns (drops, stars-back promos).

## 4.2

→  Swipeable gallery with page dots.
→  Variant chips (size / colour) required before Add to cart; stock shown per variant.
→  "Add to cart" → toast + cart badge (→ 4.3). "Buy now" skips cart → 4.4.
→  Price listed in ALLI with USDT equivalent.

## 4.3

→  Line items with steppers; quantity 0 removes the line.
→  Currency toggle re-prices the cart in ALLI or USDT.
→  Totals include shipping and stars-back promo.
→  Empty cart → illustration + "Browse the market" → 4.1.

## 4.4

→  Address (saved, editable), payment source, itemised total.
→  "Pay" opens the wallet signature sheet (biometric confirm) → 4.5.
→  Insufficient balance: CTA becomes "Top up ALLI" → 5.3 Receive.
→  Failure keeps the order as "Awaiting payment" with Retry.

## 4.5

→  Confirmation with order number, on-chain tx hash (opens BscScan) and stars earned.
→  Tracking stepper updates via push notifications.
→  Orders list lives under Wallet → Activity.

## 5.1

→  Self-custody wallet auto-created at sign-up; balances for ALLI, USDT and BNB (gas).
→  Send → 5.2, Receive → 5.3, Swap (ALLI ⇄ USDT in-app), Card → 5.4.
→  Backup banner persists until the recovery phrase is confirmed.
→  Activity merges on-chain transfers, star exchanges, orders and credit purchases; tap for tx detail on BscScan.

## 5.2

→  Pick token → paste / scan address → amount (Max leaves gas).
→  Address validated as BEP-20 checksum; unknown address shows first-time warning.
→  Review sheet → biometric confirm → pending tx in Activity (→ 5.1).
→  Not enough BNB for gas → inline prompt to receive BNB.

## 5.3

→  QR + full address for the selected token (same address, token label changes the hint).
→  Copy → toast "Address copied"; Share opens the native sheet.
→  Network warning always visible — the top support issue on the website FAQ.
→  "Add ALLI to MetaMask" helper (contract 0x823F…5A1Fd) sits below the fold.

## 5.4

→  Vision pillar from the website: a Visa card linked straight to the ALLI balance. Issuer is mocked for now.
→  Three-step pairing stepper (numbered circles mirror the website wallet guide).
→  Funding token toggle; Freeze switch; card number revealed after biometric.
→  Before launch this screen shows "Join waitlist" instead of the stepper.

## 6.1

→  Hub for all programs. Reached from the Today avatar menu and the "Invite" banner on each feature tab.
→  Programs are fully separate: a friend who joins with your Garden link is only in your Garden team.
→  "Rolled up to you" = shares passed up from unqualified members below you (see roll-up rule on 6.2–6.4).
→  Garden / Market / Card rates are proposals — adjustable in the back office.

## 6.2

→  ALLI RUN program, rebuilt from the AURA RUN Invite tab. Own RUN- code and team.
→  Only trigger: a team member’s first Silver upgrade. Runs, stars and memberships pay no commission.
→  Qualified = Silver+ and active membership at payout time. Failing rows turn amber and the hub shows "Locked".
→  Roll-up: an unqualified Gen 2–4 member’s share goes to the next qualified member above. Unqualified Gen 1 sponsor → share to treasury (revenue / burn).

## 6.3

→  Separate Garden program: own GRD- code, team and ledger, independent of ALLI RUN.
→  Trigger: seed purchases by the Garden team, paid in the seed’s currency.
→  Proposed 3 generations at 20% / 5% / 5%.
→  Same roll-up rule as Run; qualified = owns a growing tree + active membership.

## 6.4

→  Separate Market program with its own MKT- code; product "Share" links on 4.2 also attribute here.
→  Trigger: completed orders (after the return window). Paid from the platform fee, so prices don’t rise.
→  Proposed 1% Gen 1 / 0.5% Gen 2.
→  Same roll-up rule. Open to every tier; identity check above the payout threshold.

## 6.5

→  Card is a roadmap pillar, so this program starts as a waitlist: code reserved, invitees recorded.
→  Proposed rewards shown as proposals, not promises.
→  At launch it switches to the same layout as 6.2–6.4, with the same roll-up rule.

## 6.6

→  One tree per program; the switcher changes Run / Garden / Market trees.
→  Unqualified members are tagged "rolls up" so earners can see where roll-up income comes from.
→  Collapsible G1 → G4 nodes with masked email and tier badge; generation chips filter.
→  View toggle (List / Chart) in the header switches to the org-chart view (6.6b). The last choice is remembered per user.

## 6.7

→  Program switcher changes the code, QR, link and reward lines.
→  Friend opens link → 1.1 Sign in with the code prefilled; sign-up joins only that program’s team.
→  LINE, Facebook, X, copy link, QR. Earnings disclaimer on every share surface.

## 6.6b

→  Same downline as 6.6, drawn as an organisation chart: you at the top, each generation one row down (G1–G4), elbow connectors from sponsor to recruit.
→  Header toggle List / Chart switches between 6.6 and 6.6b; the choice is remembered per user. Program switcher (Run / Garden / Market) works in both views.
→  Large teams start collapsed: "+N" cards and "+N more" pills expand a branch. Pinch / drag to move around; Fit resets the view.
→  Node = masked handle + tier colour. Dashed amber node = not qualified, its share rolls up. Tap a node for its details sheet (tier, joined, generation).

