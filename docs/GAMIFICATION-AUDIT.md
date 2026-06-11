# Gamification audit — categorization, the points log, and program gaps

**Date:** 2026-06-06 · **Decision:** [ADR-139](DECISIONS.md) · **Model:**
[GLOSSARY.md](GLOSSARY.md) → "Gamification" · [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md)

## The answer up front

The two-currency model was right but **leaked at the meta-layer**: achievements,
challenges, and quests paid **Zaps for online milestones**, and achievements
**double-awarded** (gems in code + zaps in a DB trigger). That's why a single post
rained both currencies. Zaps also had **no ledger**, so a "how you earned" log was
impossible to build. All three are now fixed, the log is shipped, and the four
seasonal Pillar Journeys are seeded. Remaining gaps are listed at the bottom.

**The rule, now canonical and enforced everywhere:** anything **online → Gems**;
anything **real life → Zaps** — base actions *and* the meta-layer.

## What was wrong (and is now fixed)

| # | Finding | Status |
|---|---|---|
| 1 | A single post paid gems (correct) **plus** zaps from the "First Post" achievement **plus** zaps from the "Content Creator" quest step — one online act, three reward paths, two of them the wrong currency | ✅ fixed |
| 2 | Achievements **double-awarded**: app code paid the reward as gems while `after_achievement_unlocked` paid the same number as zaps | ✅ fixed (trigger no longer pays zaps) |
| 3 | Challenges/quests always paid **zaps** regardless of whether the milestone was online or in-person | ✅ fixed (`currencyForCriteria` routes every grant) |
| 4 | **Zaps had no ledger** — grants wrote `profiles.current_season_zaps` directly from ~6 sites; no history, rank could drift | ✅ fixed (`zap_transactions` + one trigger owns totals + rank) |
| 5 | No member-facing record of *how* points were earned | ✅ shipped (`/crew/store/ledger`) |
| 6 | `gem_config` row for `achievement` described the old (wrong) behavior | ✅ fixed (migration updates the description) |
| 7 | Economy spec calls for one Journey **per Pillar per season**; only 3 generic chains existed | ✅ seeded 4 Pillar Journeys (Mind/Body/Spirit/Expression) |

## How currency is decided now

Single source of truth: `currencyForCriteria` (`lib/engagement/currency.ts`),
the sibling of `currencyForSource`.

| Earns **Gems** (online) | Earns **Zaps** (real life) |
|---|---|
| post, reply, react, daily login | attend (verified check-in), host |
| RSVP, join a circle, welcome a newcomer | found / activate / lead a circle |
| posting & login **streaks** | outreach + crew tasks, invites that land |
| a Journey step that is a post | **every practice log** (personal or circle) |
| | node/QR captures; attendance & hosting **streaks** |

A challenge or achievement inherits the currency of the act it tracks ("Attend 8
events" → zaps; "Make 5 posts" → gems). A Journey pays each step in kind and the
chain in the currency of its real-world steps.

## The points & streaks log (the Vault)

- **Where:** the Vault → "How you earned" (`/crew/store/ledger`). Linked from the
  Vault Store card; visible to free members too (their inert points racking up is
  the upsell).
- **What:** headline totals (season zaps/gems, streak, rank) · all four streaks
  with current + best · a reverse-chron, day-grouped timeline of every grant with a
  friendly label, the currency, the amount, and the time.
- **How:** `lib/economy/ledger.ts` merges `gem_transactions` + `zap_transactions`.
  Both ledgers are append-only; an `AFTER INSERT` trigger on each is the only place
  profile totals (and, for zaps, rank) move — so the log and the counters can never
  disagree.

## Closed since the audit (ADR-140 / ADR-141 / ADR-142)

| Gap | Resolution | Status |
|---|---|---|
| Journey **join-gating** | `quest_progress` = joined; `advanceQuests` only advances started chains; new `startQuest` action + a real `/crew/quests` browse/join page | ✅ done |
| **Pillar column** on the legacy action-chain engine (dropped, ADR-152) | Pillar foreign key, backfilled on the 4 seasonal Journeys; page groups by Pillar | ✅ done |
| Member **zap-rate multiplier** | ~~`MEMBER_ZAP_RATE` (0.5)~~ 🔴 **Deleted by Rewards Economy v2 (ADR-214)** — everyone earns Zaps at full rate; visibility gating (ADR-141) is the membership value | superseded |
| Store **gems balance** | Spendable = `lifetime_gems − Σ gems_spent`, enforced in `getStoreData` + `redeemItem` | ✅ done |
| Starter **content** | 2 bonus micro-journeys + 7 system-curated library practices across the Pillars | ✅ seeded |
| **Endorsement layer** (rank) | `isEndorsed(role)` Crew-gates the public rank on profile + people cards + post flair; free profiles show earned stats but no rank (ADR-141). Inert in Beta. | ✅ done (rank) |
| **DIY journey builder** | The **Studio** window — a reusable creation surface; members compose practices into a shareable life-development track (emoji/accent, intro, drag-reorder, per-step cadence, Pillar balance, share-to-library). First instance of a cross-site builder (ADR-142). | ✅ done |

## Closed by Rewards Economy v2 (ADR-214, June 2026)

| Item | Resolution | Status |
|---|---|---|
| Provisional **Zap→Gem rank ladder** | Flat **5:1** + one-time final-rank Gem bonus (10/25/50/100/250), claim-then-pay in `reset_season()` | ✅ done |
| **Lifetime layer** | **Amplitude** = lifetime Zaps (hosting 2×), levels `50·L·(L+1)`, milestones 1k/5k seeded; supersedes the lifetime-rank display (column stays for retro rules) | ✅ done |
| **Gem tiers** (New→Legend) | Retired — gems are purely spendable; Amplitude is the progression layer | ✅ done |
| Flat practice-log Zap | **Weight classes** light 8 / standard 12 / heavy 15 (`practices.weight_class`; `reward_zaps` deprecated + backfilled) | ✅ done |
| S1 challenge sprawl (39) | Re-seeded to the **15-template**; purse of the 14 non-Completionist = **1,000⚡**; the 24 extras archived (`is_active=false`), never deleted | ✅ done |
| New bonus mechanics | Co-op Pulse +3⚡ (nightly), Welcome Back +10⚡, freeze second path (5 Full Days = +1), per-practice streaks + **Practice Shelf**, Full Cycle +50⚡ | ✅ done |
| S1 award set | Quiet Ones (5 secret), Witnessed peer grants, rank/journey cosmetics (granted-only store items), circle banner + Co-op Synchrony, Vault S1 SKUs (rank/stock/season gates) | ✅ done |
| Crew-task ledger **regression** | `20260613000030` had restored the pre-ADR-139 `after_crew_completion()` (direct profile writes, ledger bypass) — re-fixed in `20260614000000` | ✅ fixed |

## Where the program is still lacking (recommended next)

| Gap | Why it matters | Effort |
|---|---|---|
| ⏳ **Studio: more entities** (ADR-142) | Mount circle / practice / event onto the Studio shell as their own specs — the cross-site "create anywhere" vision | M each |
| ⏳ **Endorsement set — cosmetics/titles/journey badges** | Granted + owned now (ADR-214 sweeps); public rendering still rides the `isEndorsed` gate when it lands | S (rides existing gate) |
| ⏳ **Beta zap supply** | Most beta activity is online (gems). Drive zaps with seeded ghost nodes / QR drops + event check-ins so the rank ladder isn't flat — ships WITH the v2 economy (don't launch into a world with no faucets) | content |
| ⏳ **Celebration art** | Amplitude level-up (mid-tier) + milestone / Full Spectrum (full-screen) are minted but visually stubbed; only 1k/5k art ships in S1 | design |
| ⏳ **Forge Claim** | `forge_claim` metadata flags the Beacon/Luminary tokens; the physical claim flow is unbuilt | M |
| ⏳ **Types regen** | `lib/database.types.ts` was hand-patched for the new columns; regenerate from the live schema after `20260614000000` applies | XS |

> Demo community already looks alive: the demo engine seeds zaps/gems/ranks/streaks
> per rank-band and inserts attendance streaks + trophy cases, so leaderboards and
> ranks read as real. Demo profiles intentionally carry **no ledger rows** (no one
> opens a demo member's personal log), so the log is a real-member surface only.
