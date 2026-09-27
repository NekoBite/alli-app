# ALLI App wireframes

`ALLI_App_Wireframe.fig` is the Figma source (v0.1, Sep 2026): 31 screens in seven sections, each
with a FUNCTION note. The PNGs are renders of each section and `FUNCTION_NOTES.md` is every
screen's notes as text — both produced offline by `tools/wireframes/` from the `.fig`, so the design
can be read without a Figma seat or API calls.

| Section | Screens | Routes |
|---|---|---|
| 00 · Cover & Foundations | colour tokens, type, core components | `src/theme`, `src/components` |
| 01 · Onboarding & Sign in | 1.1 Sign in · 1.2 Verify code · 1.3 Wallet ready | `/sign-in`, `/onboarding/wallet` |
| 02 · Today, ALLI RUN & Quests | 2.1–2.7 | `/(tabs)`, `/(tabs)/run`, `/run/*`, `/quests/weekly` |
| 03 · Garden | 3.1–3.4 | `/(tabs)/garden`, `/garden/*` |
| 04 · Marketplace | 4.1–4.5 | `/(tabs)/market`, `/market/*` |
| 05 · Wallet & Card | 5.1–5.4 | `/(tabs)/wallet`, `/wallet/*` |
| 06 · Referral programs | 6.1–6.7, 6.6b | `/referrals`, `/referrals/[program]`, `/referrals/[program]/tree`, `/referrals/share`, `/r/[code]` |

Where the wireframe's sample figures disagree with the product rules in code (shoe tiers and
multipliers, the star exchange rate, run pack prices), the screens follow the code and read their
numbers from it; see the "Wireframe vs rules" table in `docs/architecture.md`.
