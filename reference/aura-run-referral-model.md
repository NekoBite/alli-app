# AURA RUN — referral & commission model (recovered)

Reverse-engineered from the AURA RUN member app screenshots in this folder
(`631698`–`631701`), not from the vendor's source or database. AURA RUN is the
predecessor app to ALLI RUN; this file records how its multi-generation
referral commission worked, so the same mechanics can be rebuilt natively in
ALLI's own back office. Numbers quoted from the screenshots are one member's
live values and are treated as **illustrative**, not as a rate card — the
structural rules are what matter.

## Tiers

Same three NFT-footwear tiers ALLI already models in `src/features/run/shoes.ts`:

| Tier    | Role                                    |
|---------|-----------------------------------------|
| Leather | Free at registration. Base runner.      |
| Silver  | First paid upgrade. Unlocks earning.    |
| Gold    | Top tier.                               |

The referral system layers on top of these tiers — it does not introduce new ones.

## Generations

A member's downline is tracked to **four generations** by the referral (sponsor)
edge, not by any run/garden activity:

- **Gen 1** — people you referred directly ("Direct").
- **Gen 2** — people *they* referred.
- **Gen 3** — the next level down.
- **Gen 4** — the deepest level that pays. Gen 5+ exists in the tree but pays nothing.

Team size is the count across all four generations. (Screenshot example:
6 + 20 + 91 + 138 = 255.)

## The commission event

Commission is **not** paid on runs, stars, memberships, or marketplace sales.
It is paid on one event: **a downline member upgrading to Silver** (the first
paid tier upgrade). The screenshots are explicit: *"When a member upgrades to
Silver you earn 40% from Gen 1 and 10% from Gen 2–4 (of the upgrade)."*

So the commissionable base is the **upgrade purchase amount**, and a payout is
generated for each qualifying ancestor when the upgrade is confirmed.

## Rates, corrected

The screenshots above show the member app's own blurb. Live data is better evidence than
marketing copy, and it disagrees: the AURA RUN **admin** panel's Commissions table, read
2026-11-01 against real payout rows (dates, emails, generations, amounts, all `CREDITED`), shows
a 25 USDT Silver upgrade consistently paying **5 / 2.5 / 2.5 / 2.5 USDT** — **20% / 10% / 10% /
10%**, not 40/10/10/10 — across several unrelated upline chains the same day.

| Generation | In-app blurb (screenshot) | Admin commission records (live, 2026-11-01) |
|------------|---------------------------|----------------------------------------------|
| Gen 1      | 40%                       | **20%**                                       |
| Gen 2      | 10%                       | 10%                                           |
| Gen 3      | 10%                       | 10%                                           |
| Gen 4      | 10%                       | 10%                                           |

`src/features/referrals/rules.ts` now uses 20/10/10/10 — the figure with real payouts behind it.

**Open, not resolved:** whether the badge was simply wrong, or the rate changed at some point and
every record pulled so far happens to postdate the change. The samples checked were all from one
day (2026-11-01) and one upline shape; confirming needs commission rows spanning different dates
(ideally near the app's early registrations) and a read of the admin's own "Commission Settings"
page, which was not opened during this pass.

## Eligibility to *earn* (per ancestor, evaluated at payout time)

An ancestor only receives their generation's cut if **both** hold:

1. **Tier gate** — the ancestor is **Silver or Gold** ("you must be Silver+ to
   earn"). A Leather ancestor is skipped.
2. **Active membership** — monthly membership (25 USDT) is current. The
   membership blurb: *"Renew monthly (25 USDT) to get your run credits and keep
   receiving commissions from Gen 1–4."*

Open question for our build (not resolvable from screenshots): when an ancestor
is skipped, does their share **roll up** to the next eligible ancestor, or is it
simply **not paid** (compression vs. no-compression)? Needs a product decision —
see "Decisions to confirm" below. *Decided:* roll-up, with a Gen 1 exception —
see `docs/referral-programs.md` §3.

## "Path to Gold"

A progression/quest, separate from the payout math: reaching Gold requires **5 of
your direct (Gen 1) referrals to have upgraded to Silver** (shown as "5 / 5").
This is a status track, not a commission trigger.

## Payout currency & settlement

- Commissions accrue in **USDT** (all Invite-tab figures are USDT).
- They land in the member's wallet balance and are withdrawn through the same
  Withdraw flow as the rest of the wallet (USDT / ALLI, BSC BEP-20, min 1 USDT).

## Metrics surfaced to the member (Invite tab)

Rebuild targets for the member-facing side:

- **Total earned** (USDT, lifetime).
- **Team size** across all generations.
- **Commission rate** badge — shows 40% / 10% in the member app; the real paid rate confirmed
  from admin commission records is 20% / 10% (see "Rates, corrected" above).
- **Membership** state + renewal (active-until date, renew 25 USDT).
- **Path to Gold** progress (N / 5 directs upgraded).
- **Invite link** with a per-member ref code (`?ref=XXXXXXXX`).
- **Team by generation** — per Gen: member count, # upgraded, rate, earned USDT.
- **Downline tree** — hierarchical G1→G4, each node showing a
  **privacy-masked** email (`je******@gmail.com`) and tier badge.

## Related AURA RUN economics (for parity, from the other screenshots)

Cross-checks against ALLI's existing README economics — most already match:

| Thing            | AURA RUN value (screenshot)                     | ALLI today |
|------------------|-------------------------------------------------|------------|
| Star → token     | 1 ★ = 1000 ALLI                                 | same (README) |
| Token price ref  | 1 ALLI ≈ $0.001                                 | n/a yet |
| Membership       | 25 USDT / month, grants run credits             | 25 USDT / 30 runs (README) |
| Extra runs       | 0.8333333 USDT per run, up to 300/month, never expire | 25/30 ≈ 0.833 (README) |
| Marketplace fee  | 2% platform fee, P2P listings                   | market feature exists |
| Withdraw         | USDT / ALLI, BSC BEP-20, min 1 USDT             | wallet feature exists |
| Purchase confirm | re-enter account password                       | n/a yet |

## Decisions to confirm before implementing

1. **Compression** — *decided:* a skipped ancestor's share rolls up to the next
   qualified ancestor; if the skipped ancestor is Gen 1, the share goes to the ALLI
   treasury (revenue / burn). See `docs/referral-programs.md` §3.
2. **Upgrade price** — the exact Silver upgrade amount that forms the
   commissionable base (screenshot per-upgrade figures don't resolve to one clean
   price, so the totals are likely seeded/illustrative).
3. **Re-triggers** — is commission paid only on the *first* Silver upgrade, or
   also on Gold upgrades / membership renewals? Screenshots only evidence the
   Silver-upgrade trigger.
4. **Snapshot vs. live eligibility** — is the earner's Silver+/active status
   judged at the moment of the downline upgrade (snapshot) or continuously?
5. **Self-referral / cycle guards** — the sponsor graph must be a DAG; enforce at
   write time.
