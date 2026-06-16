# The Quest — open IA debt (post-build audit, 2026-06-16)

> Tracked as **ADR-293** in `DECISIONS.md`. Captured at the end of a long build thread so the next session has it. The Quest
> redesign shipped end to end (see `QUEST-UI-REDESIGN.md`), but a route audit found the
> member information architecture is **fragmented**: the redesign *added* surfaces without
> collapsing the old ones. Routes are technically wired (0 broken links, only 3 legacy
> redirects orphaned), but a member can't tell which surface is the front door. This is the
> top open item and needs a product decision before building.

## The problem
**Three+ overlapping "journey" surfaces for a member:**
- `/crew` — the new **hub** (Season Map). Intended single front door.
- `/crew/quests` — the season's quest/journey **list** (older surface).
- `/crew/journey` — your per-Journey **progress** (rank ladder, 14-day bar, Expression).
- `/journeys` — the full **library** (browse/build/adopt).

They each answer "where am I in my Journey" differently, and nothing on screen explains
the distinction (`/crew/quests` = this season vs `/journeys` = whole library).

**The crew tab bar is still the old 7-tab sprawl** (`components/crew/quest-tabs.tsx`:
Dashboard · Quests · Achievements · Challenges · Leaderboard · Streaks · Store). The
redesign's "one glanceable hub" was added *next to* this, not in place of it, so the
member got more surface, not less.

## Orphaned / dead routes (low-priority cleanup)
- `/crew/journeys`, `/crew/arcs` — legacy redirects (ADR-085 naming reorg); reachable only by direct URL.
- `/admin/quests` — redirect → `/admin/content/journeys` (ADR-211); nothing links to it.

These are harmless but should be deleted once the IA settles.

## Recommended consolidation (needs an owner decision first)
1. **Pick the canonical "My Journey" surface.** Recommendation: fold `/crew/quests` + `/crew/journey` into the hub's Season Map flow so `/crew` is the one place a member sees the season + their current Journey + the next step. `/journeys` stays as the explicit "browse/build the library" surface.
2. **Collapse the 7-tab `QuestTabs`** to the few that matter (hub + the genuinely-distinct destinations), or replace the tab bar with the hub's in-context navigation.
3. **Delete the 3 orphaned redirects** after links are confirmed migrated.
4. **Label the distinction** between "this season's Quest" and "the library" wherever both appear.

**Open decision for the owner:** which surface is the canonical "My Journey," and how aggressive to be collapsing the tab bar. Do NOT build the consolidation until that's chosen — it's an IA/product call, not a wiring fix.

## What's already done (so it's not re-litigated)
The full redesign is live: completion-model ranks, hub + Season Map, Journey detail, cooperative leaderboard, forgiving streaks, Trophy Case, Expression as the 4th Pillar, member-built Journeys + the Vera AI quality gate, the Season Composer (edit, lifecycle, clone, preview, operator home, bulk, per-Pillar balance, auto-go-live scheduler), Leader Training, and Season 1 "Shine" content. All migrations applied to prod.

The **git** docs are fully synced: `DECISIONS.md` ADR-283..293, `QUEST-UI-REDESIGN.md`, this file, and the member **help center** (`content/help/the-quest/*` corrected to the live model — completion ranks, cooperative leaderboard, no broken tables).

## Also open: operator-doc (Notion) sync
The instructional **operator** pages in the Notion "Web Platform — Training & Strategy" DB were **not** refreshed for the redesign — this remote session couldn't pass the Notion write-approval gate, and the owner chose to skip it (git is the source of truth). Two pages are stale and still describe the **retired 6-rank Zap-threshold model**:
- **"Crew Gamification"** (page `36bfb0d4-b941-812a-8672-c297304171fd`) — needs a current operator quick-reference: rank = Journeys finished (Ghost/Initiate/Adept/Master), four Pillars incl. Expression, pillar-based completion, cooperative leaderboard (Circle/Hub/Global + collective goal + opt-out), forgiving streaks, member-built + Vera gate, and the Season Composer + auto-go-live scheduler. Keep it instructional, no code/schema, link back to the git docs.
- **"Journey Creation"** (page `380fb0d4-b941-81ba-aa4c-f00f9e0b133f`) — verify it covers the Vera ranked-eligibility gate and the Season Composer; mirror `content/leader-training/how-to-create-a-journey.md`.

To finish: run `/sync-docs` from an interactive session where Notion writes are approved (or update the two pages by hand). Not a blocker — members read the help center; this is operator training only.
