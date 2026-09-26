# Referral programs — one per feature

Product decisions for ALLI's referral system, agreed September 2026. The ALLI RUN
mechanics come from the AURA RUN model recovered in
`reference/aura-run-referral-model.md`; this file extends that model to every feature
and records the rules that were open questions there. Nothing here is implemented
yet.

Wireframes: Figma file "ALLI-App-Wireframe", section *06 · Referral programs*
(screens 6.1–6.7). That section is not built yet because the Figma plan's tool-call limit was reached.

## 1. Separate programs, separate teams

Each feature runs its **own** referral program:

- its own invite code and link (`RUN-…`, `GRD-…`, `MKT-…`, `CRD-…` → `alli.app/r/<code>`);
- its own sponsor tree: a friend who signs up through your Garden link joins your
  Garden team only. They have no sponsor in Run, Market or Card unless they also use
  a link for that program;
- its own commission trigger, rates, qualification rule and payout ledger.

So a member's sponsor is stored **per program** (`sponsor(member, program)`), not
once per member. A member can have a different sponsor in every program, and every
program's tree must be acyclic on its own (reject self-referral and cycles at write
time).

Attribution happens when the invitee first joins that program. A later link from
another member does not move them.

## 2. Programs

Rates for ALLI RUN come from AURA RUN. The rest are **proposals**. They are placeholders to
tune, and the back office should hold them as configuration, not constants.

| Program | Trigger (commissionable event) | Generations & rates | Paid in | Qualified to earn |
|---|---|---|---|---|
| ALLI RUN | Team member's first Silver shoe upgrade | Gen 1 40% · Gen 2–4 10% each | USDT | Silver tier or higher **and** active membership |
| Garden | Team member buys seeds | Gen 1 20% · Gen 2–3 5% each | Same currency as the seed (ALLI or USDT) | Owns at least one growing tree **and** active membership |
| Marketplace | Team member's completed order (after the return window), paid from the platform fee | Gen 1 1% · Gen 2 0.5% of order value | Currency of the order | Any tier; identity check for payouts over 100 USDT |
| ALLI Card | Team member activates a card; share of their spend | Proposed: 5 USDT per activation + 0.2% of spend, Gen 1 only | USDT | TBD at launch (waitlist until then) |

Gen 5 and deeper are tracked in each tree but never paid.

## 3. Roll-up rule (compression)

Decided: **roll-up with a Gen 1 exception.**

For a qualifying purchase of amount `A` by buyer `b` in program `p`, for each paid
generation `g = 1 … G(p)`:

1. `a` = the g-th sponsor above `b` in program `p`'s tree. `share = rate(p, g) × A`.
2. If there is no sponsor at that depth → the share is not paid out (stays with the
   project).
3. If `a` is qualified → pay `a`.
4. If `a` is **not** qualified:
   - `g = 1` (the buyer's direct sponsor) → the share goes to the **ALLI treasury**,
     booked as project revenue or earmarked for supply burn;
   - `g ≥ 2` → the share **rolls up** to the nearest qualified member above `a`,
     who receives it on top of their own generation's share.

Qualification is judged at payout time (when the purchase is confirmed), not at
sign-up.

### Worked example (ALLI RUN, 100 USDT Silver upgrade)

Chain above the buyer: G1 Silver, active · G2 Leather · G3 Silver, active ·
G4 Silver, membership lapsed · G5 Gold, active.

| Gen | Member | Qualified? | Share | Paid to |
|---|---|---|---|---|
| 1 | G1 | yes | 40 | G1 |
| 2 | G2 | no (Leather) | 10 | rolls up → G3 |
| 3 | G3 | yes | 10 | G3 (G3 gets 20 in total) |
| 4 | G4 | no (lapsed) | 10 | rolls up → G5 |

If G1 had been Leather, their 40 would go to the treasury, not to G2.

### Open points on roll-up

- **How far up a share can roll.** The assumption here is no depth limit: the
  search keeps going up the tree (past Gen 4, as G5 does above) until it finds a
  qualified member. If it reaches the top without one, the share goes to the
  treasury. Confirm, or cap it at the program's paid depth.
- **Treasury split.** How much of treasury inflow is burned versus kept as revenue,
  and how often burns happen.

## 4. Member-facing surfaces

- **Referral hub** (6.1): total earned across programs, paid-out and rolled-up
  amounts, and one card per program showing earned, team size, rate and status
  (Earning / Locked / Coming soon).
- **Program detail** (6.2–6.5): earned, team size, rates, the trigger in plain
  words, the qualification checklist, a roll-up explainer, the invite link, and team by
  generation.
- **Downline tree** (6.6): one tree per program, masked emails, tier badges;
  unqualified members are tagged "rolls up".
- **Share invite** (6.7): program switcher that changes the code, QR and reward text.
- **Entry points**: an "Invite" banner on each feature tab linking to that program.
- Every share surface carries an earnings disclaimer ("no guaranteed income").

## 5. Before launch

The ALLI RUN program pays mostly on downline purchases of a tier upgrade. That
structure is what regulators look at when judging whether a scheme is an illegal pyramid
(for example Thailand's Direct Sales and Direct Marketing Act), and paying in a
token adds its own rules. Get a legal review of the commission structure and
disclosures before release.
