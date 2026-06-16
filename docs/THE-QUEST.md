# The Quest — naming & vocabulary

The game is named **The Quest**. This doc reflects game vocabulary; the **single source of
truth for every name is [`docs/NAMING.md`](NAMING.md) (ADR-208)** — when in doubt, that file
wins. The canon hierarchy is three levels:

> **Quest → Journey → Practice.**

- **The Quest** = the year-round game (brand name; never appears in schema).
- **A Quest** (table `quests`) = one season's 13-week instance, and its official, free
  collection of **Journeys**. In schema/code, `quest` always means the season instance.
  *("Seasonal Quest" is retired phrasing — a `quests` row simply **is** the season.)*
- **A Journey** *is made of* **Practices** (the atomic real-world acts).

Everything is **free** (ADR-150/152); only the Store (Gem spend) and the public rank badge
(ADR-141) are Crew-gated.

## Canonical vocabulary

| Player-facing term | What it is | Schema / code |
|---|---|---|
| **The Quest** | The game as a whole (brand). | (brand; no single table) |
| **Quest** | One season's 13-week instance + its official, free collection of Journeys. | `quests` (`lib/quests.ts`) |
| **Journey** | A set of practices you move through. Official (nested under a Quest) or member-built (open library). Free. | `journey_plans` + `journey_plan_items` (`lib/journey-plans.ts`) |
| **Practice** | The atomic real-world act a member does + logs. The North-Star act. | `practices`, `practice_logs` (`lib/practices.ts`) |
| **Zaps** ⚡ | In-person / external currency. Season XP that drives ranks. Resets each season. | `lib/zaps.ts`, `current_season_zaps`, `lifetime_zaps` |
| **Gems** 💎 | On-platform currency + the Zap rollover. The spendable one (store, merch). Durable. | `lib/gems.ts`, `gem_transactions`, `store_*` |
| **Season Ranks** | Ghost → Initiate → Adept → Master (completion-based, 4 values — by Journeys finished this season; ADR-283, see docs/NAMING.md). The old 6-rank Zap ladder (ghost/echo/signal/beacon/conduit/luminary) is RETIRED. | `current_season_rank` (`season_rank_enum`) |
| **Practice depth tiers** | Initiate / Adept / Master (default Adept). Tier never changes zap/streak math. | `practice_tiers.tier` |
| **Challenges** | Community-wide seasonal goals (everyone wins together). | `season_challenges`, `challenge_progress` |
| **Achievements** | Permanent unlock badges. | `achievements`, `user_achievements` |
| **Side Quests** | Reward-only, self-directed missions: a member claims one for bonus Zaps + a badge. Do NOT count toward the four Pillars. An `achievements` row flagged `is_side_quest` with manual criteria; claimed on `/crew/side-quests` (ADR-300 Part 3). | `achievements.is_side_quest`, `lib/side-quests.ts` |
| **Streaks** | Daily practice streak (the headline) + weekly rhythms. | `profiles.current_streak` + `streaks` (`lib/practice-streak.ts`) |
| **Pillars** | Mind / Body / Spirit / Expression — the lens Journeys are organised by. Never called Channels. | `pillars`; `journey_plan_items.domain_id` (column rename deferred to Wave 3) |
| **Co-op** | ≥3 active circle members on the same Journey (renamed 2026 — see docs/NAMING.md). Distinct from Resonance. | `lib/journey-coop.ts` |
| **Circle Current** | A circle's collective, non-competitive seasonal standing (renamed 2026 — see docs/NAMING.md). | `circles.season_current`, `circle_current_transactions` |

Journey **progress** is derived from the practice log (ADR-144) — logging a Journey's
practices advances it and earns the practice loop's zaps/streak; there is no separate tracker.

## Naming history (settled — canon-locked in NAMING.md)

The multi-step engine churned through names — `quest_*` → `arc_*` (ADR-079) → `journey_*`
(ADR-085) → `quest_*` (ADR-087); ADR-150 briefly collapsed Quests and Journeys into one
concept; ADR-152 split them again. **ADR-208 / [`NAMING.md`](NAMING.md) lock the final canon:**
"Quest" = the game (brand) and the season instance; "Journey" = a practice path. **Arc** is
**retired and gone**. No more renames.

## Legacy engine retirement — done (ADR-152 Phase B3)

The legacy action-chain engine (dropped, ADR-152 — steps like
"attend an event / make a post / refer someone", advanced by `advanceQuests`) is **fully retired
and dropped**: `advanceQuests`, the action-chain reads, and `startQuest` are gone; the tables and
the `quest_outcomes()` RPC no longer exist (migration `20260609104000`); `/crew/quests` renders
Quests → their Journeys (`lib/quests.ts`) and `/admin/quests` is the Journey-Library manager. The
mechanic those action-chains expressed lives on in `season_challenges` + achievements. The
`quest_complete` engagement-source key stays for historical `engagement_events` continuity.
