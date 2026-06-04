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
| **Arcs** | Multi-step seasonal journeys a member chooses. Was "quests". | `quest_chains` → `arc_*` (migration pending) |
| **Steps** | The stages within an Arc (each ~a weekly action). | `quest_steps` |
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

## Migration checklist (quest_* → arc_*) — run in dev, with type regen + tests

Do this as a deliberate refactor, not a blind edit, because it touches a migration
and generated types.

1. New migration `*_rename_quests_to_arcs.sql`: `ALTER TABLE quest_chains RENAME TO
   arc_chains;` (same for `quest_steps` → `arc_steps`, `quest_progress` →
   `arc_progress`); rename FKs/indexes/policies; optionally add temporary updatable
   **views** named `quest_chains` etc. for one release to avoid a hard cutover.
2. Regenerate `lib/database.types.ts` (`supabase gen types`).
3. Rename symbols: `QuestChain` → `ArcChain`, `QuestStep` → `ArcStep`,
   `quest_complete` event → `arc_complete`, etc. (grep for the exact identifiers
   from GLOSSARY, not the substring "quest" — it collides with "request").
4. Route: `app/(main)/crew/quests/` → `app/(main)/crew/arcs/`; add a redirect from
   `/crew/quests` → `/crew/arcs`; update nav (`lib/nav-areas.ts`) and links.
5. UI strings: "Quest" / "Quests" → "Arc" / "Arcs" in the moved page + dock +
   notifications.
6. Analytics: rename `quest`-keyed outcome events in `lib/analytics/` and
   `lib/analytics/outcomes.ts` to `arc`; keep a mapping note so historical
   `engagement_events` rows remain interpretable.
7. Update `docs/GLOSSARY.md` to drop the "migration pending" note once done.

Until step 1 ships, docs intentionally say "Arc (quest_chains in schema)".
