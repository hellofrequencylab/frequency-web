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

## Where the program is still lacking (recommended next)

| Gap | Why it matters | Effort |
|---|---|---|
| ⏳ Journey **join-gating** — the engine auto-progresses every member through every chain | Premium model (ECONOMY §5) wants members to *choose/Join* a Journey; today all chains advance passively | M (engine + UI) |
| ⏳ **Pillar column** on `quest_chains` | Journeys are pillar-themed by name only; a real `domain_id` enables per-Pillar browse + the "4 primary per season" contract | S (migration + admin) |
| ⏳ Member **zap-rate multiplier** (ECONOMY §6, "locked") | Free members are meant to earn zaps slower; not yet implemented — today member vs. crew earn the same | S–M |
| ⏳ Season challenges are all tagged **Season 1** | The engine ignores the season filter so they still fire, but new seasons need fresh challenge sets to feel like "a new climb" | S (seasonal seed) |
| ⚠️ `season_convert` / store **spend** writes `lifetime_gems` as the balance | The Store treats `lifetime_gems` as spendable but redemptions don't decrement it — a separate balance bug worth confirming (out of scope here) | review |
| ⏳ **Beta zap-rate of online reach** | Most beta activity is online (gems). Drive zaps with seeded ghost nodes / QR drops + event check-ins so the rank ladder isn't flat | content |

> Demo community already looks alive: the demo engine seeds zaps/gems/ranks/streaks
> per rank-band and inserts attendance streaks + trophy cases, so leaderboards and
> ranks read as real. Demo profiles intentionally carry **no ledger rows** (no one
> opens a demo member's personal log), so the log is a real-member surface only.
