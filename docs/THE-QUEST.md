# The Quest — naming & vocabulary

The game is named **The Quest**. This doc is the canonical source for game vocabulary.
The model (ADR-152) is a four-level hierarchy:

> **The Quest** (the game) → **Seasonal Quest** (a season's official, free container) →
> **Journeys** (a set of practices) → **Practices** (the atomic thing you do).

Quests and Journeys are **distinct nested levels** — a Quest *contains* Journeys; a Journey
*is made of* practices. Everything is **free** (ADR-150/152); only the Store (Gem spend) and
the public rank badge (ADR-141) are Crew-gated.

## Canonical vocabulary

| Player-facing term | What it is | Schema / code |
|---|---|---|
| **The Quest** | The game as a whole. Seasonal, 13-week cycle on the natural calendar. | (brand; no single table) |
| **Seasonal Quest** | A season's official, free collection of Journeys. | `quests` (`lib/quests.ts`) |
| **Journey** | A set of practices you move through. Official (nested under a Quest) or member-built (open library). Free. | `journey_plans` + `journey_plan_items` (`lib/journey-plans.ts`) |
| **Practice** | The atomic thing a member does + logs. The North-Star act. | `practices`, `practice_logs` (`lib/practices.ts`) |
| **Zaps** ⚡ | In-person / external currency. Season XP that drives ranks. Resets each season. | `lib/zaps.ts`, `current_season_zaps`, `lifetime_zaps` |
| **Gems** 💎 | On-platform currency. The spendable one (store, merch). Durable. | `lib/gems.ts`, `gem_transactions`, `store_*` |
| **Season Ranks** | ghost → runner → operative → agent → conduit → luminary | `current_season_rank` |
| **Challenges** | Community-wide seasonal goals (everyone wins together). | `season_challenges`, `challenge_progress` |
| **Achievements** | Permanent unlock badges. | `achievements`, `user_achievements` |
| **Streaks** | Daily practice streak (the headline) + weekly rhythms. | `profiles.current_streak` + `streaks` (`lib/practice-streak.ts`) |
| **Domains / Pillars** | Mind / Body / Spirit / Expression — the lens Journeys are organised by. | `domains`; `journey_plan_items.domain_id` |

Journey **progress** is derived from the practice log (ADR-144) — logging a Journey's
practices advances it and earns the practice loop's zaps/streak; there is no separate tracker.

## Naming history (settled — no more renames)

The multi-step engine churned through names — `quest_*` → `arc_*` (ADR-079) → `journey_*`
(ADR-085) → `quest_*` (ADR-087) — and ADR-150 briefly collapsed Quests and Journeys into one
concept. **ADR-152 settles it:** "Quest" = the game and its seasonal containers; "Journey" = a
practice path. "Arc" is **retired**. The word is stable now.

## Legacy engine retirement (ADR-152, Phase B3)

The old action-chain engine (`quest_chains` / `quest_steps` / `quest_progress` — steps like
"attend an event / make a post / refer someone", advanced by `advanceQuests`) is **retired in
code**: `advanceQuests`, the `/crew/quests` action-chain reads, and `startQuest` are removed;
`/crew/quests` now renders Seasonal Quests → their Journeys (`lib/quests.ts`); the sidebar's
"current track" reads the active Journey. The mechanic those action-chains expressed already
lives in `season_challenges` + achievements.

⏳ **Deferred (small follow-up):** physically **drop** the dormant `quest_chains/steps/progress`
tables. Held back because the `quest_outcomes()` analytics RPC (`lib/analytics/outcomes.ts`)
still reads them; retire that RPC + its surface (and regenerate `database.types.ts`) first.
The `quest_complete` engagement-source key stays for historical `engagement_events` continuity.
