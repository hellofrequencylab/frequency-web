# The Quest — naming & vocabulary

The game is named **The Quest**. This doc is the canonical source for game
vocabulary and records the decision that resolved the naming collision between the
game ("The Quest") and the existing multi-step feature (`quest_chains`).

## Canonical vocabulary

| Player-facing term | What it is | Schema / code |
|---|---|---|
| **The Quest** | The game as a whole. Seasonal, 13-week cycle on the natural calendar. | (brand; no single table) |
| **Zaps** ⚡ | In-person / external currency. Season XP that drives ranks. Resets each season. | `lib/zaps.ts`, `current_season_zaps`, `lifetime_zaps` |
| **Gems** 💎 | On-platform currency. The spendable one (store, merch). Durable. | `lib/gems.ts`, `gem_transactions`, `store_*` |
| **Season Ranks** | ghost → runner → operative → agent → conduit → luminary | `current_season_rank` |
| **Arcs** | Multi-step seasonal journeys a member chooses. Was "quests". | `arc_chains` (renamed from `quest_chains`) |
| **Steps** | The stages within an Arc (each ~a weekly action). | `arc_steps` |
| **Challenges** | Community-wide seasonal goals (everyone wins together). | `season_challenges`, `challenge_progress` |
| **Achievements** | Permanent unlock badges. | `achievements`, `user_achievements` |
| **Streaks** | Daily/weekly consistency (the "daily minimum"). | `streaks` |
| **Domains** | Mind / Body / Spirit / Expression — the lens Arcs are organised by. | tag on Arcs/achievements |

## The collision and how it's resolved

"The Quest" (game) collided with the in-app feature historically called "quests"
(`quest_chains`). Resolution: **the game is The Quest; the multi-step feature is an
Arc.** No player-facing surface calls an Arc a "quest." Internal table names are
being migrated from `quest_*` to `arc_*` but are invisible to members, so the
visible collision is already gone once UI strings + routes are renamed.

## Migration status (quest_* → arc_*) — DONE 2026-06-04 (ADR-079)

✅ Shipped:
1. Migration `20260604000000_rename_quests_to_arcs.sql`: tables renamed
   `quest_chains/steps/progress` → `arc_chains/steps/progress` (constraints, RLS,
   FKs, indexes follow). The `quest_outcomes()` RPC was recreated against the new
   tables. **`security_invoker` compatibility views** named `quest_*` were left in
   place for one release so the always-loaded stats dock kept working across deploy.
2. `lib/database.types.ts` regenerated.
3. Symbols renamed: `QuestChain/QuestStep/QuestProgress` → `ArcChain/ArcStep/ArcProgress`;
   `isQuestStepRelevant` → `isArcStepRelevant`; the dock `quest` field → `arc`.
4. Route `app/(main)/crew/quests/` → `app/(main)/crew/arcs/`, with a redirect stub at
   the old path; nav + links updated.
5. UI strings "Quest"/"Quests" (the multi-step feature) → "Arc"/"Arcs" in the dock,
   the moved page, and the admin outcomes view.

⏳ Deliberately deferred (invisible to members, so not urgent):
- **Drop the compat views** `quest_*` in a follow-up migration once the deploy is
  confirmed stable.
- **`quest_outcomes()` RPC** kept under its name (internal admin analytics) rather
  than renamed to `arc_outcomes`.
- **`quest_complete`** engagement source key kept for historical-data continuity
  (`engagement_events` rows already use it); renaming needs a data migration + mapping.
