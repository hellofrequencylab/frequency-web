# Journeys — the canonical system spec

Status: ✅ **Authoritative (2026-06-09).** This doc is the single source of truth for the
Journey system. It **supersedes** the Journey content of
[`ECONOMY-AND-JOURNEYS.md`](ECONOMY-AND-JOURNEYS.md) (§5 "premium marquee", the premium
framing) and **extends** [`THE-QUEST.md`](THE-QUEST.md) (vocabulary stays as-is). Where this
doc and any prior doc disagree, **this doc wins** and the prior doc is reconciled per §16.

> Built on two design briefs + a full codebase audit. The headline finding: ~80% of the
> gamification substrate already exists and is ledger-driven. This spec assembles what's
> there, adds the one mechanic nobody else has (**human-calibrated intensity tiers**), wires
> the **season-completion arc**, fires the **reward moments**, and layers in three signature
> "world's-first" bets (§9). Code + `supabase/migrations/` remain the ultimate source of truth.

---

## 1. The premise (lead with the answer)

Every wellness app gamifies the **symptom** — opening the app, tapping "done", collecting
badges for things you barely did. Frequency gamifies the **system**: verified real behaviour,
in community, in physical space, across a seasonal arc aligned to the real calendar. The game
isn't running alongside your life — **your life is the input.**

The design rule every mechanic serves: **the app rewards you for leaving it.** High Weekly
Active Members with *low* session time is a win — it means the practice happened in the world.

Three things no app has combined, and our whole moat:

1. **Verified real-world practice** — not self-reported; the practice happened at an event, a
   place, with a person (the engagement-capture pipeline, ADR-019/020).
2. **Human-calibrated intensity** — a circle Host sets the difficulty tier for the group. A
   person who knows the room, not an algorithm. §5.
3. **Practice as a community signal** — when you log in Headspace, Headspace knows. When you
   log here, *your circle* knows. The practice is a shared language, not private self-help. §9.

---

## 2. The hierarchy, mapped to real tables

The model is settled (ADR-152) and the briefs re-confirm it. Player-facing vocabulary lives in
[`THE-QUEST.md`](THE-QUEST.md); this is the structural map.

| Level | What it is | Table(s) | Status |
|---|---|---|---|
| **The Quest** | The year-round game. The brand. | — (no table) | ✅ |
| **Season** | 13 weeks, one per solstice/equinox. Name, theme, Act arc. | `seasons` | ✅ |
| **Quest** | A season's 13-week instance + its official, free container of Journeys. *("Seasonal Quest" is retired phrasing — see [NAMING.md](NAMING.md).)* | `quests` (`lib/quests.ts`) | ✅ |
| **Journey** | A themed set of 4–5 practices in one Pillar, moved through over a season. | `journey_plans` + `journey_plan_items` + `journey_plan_adoptions` | ⚠️ extend |
| **Practice** | The atomic real-world act you do + log. The North-Star act. | `practices`, `practice_logs` | ⚠️ extend (tiers) |
| **Challenge** | Season-wide social objectives *beside* Journeys. | `season_challenges`, `challenge_progress` | ✅ |

> **Naming canon:** the hierarchy is **Quest → Journey → Practice** ([NAMING.md](NAMING.md),
> ADR-208). "Season" is the calendar fact; a **Quest** is the season instance in schema/code.

**Spine decision (locked).** `journey_plans` is the **single** Journey spine. Official seasonal
Journeys are `journey_plans` rows with `official = true` + `quest_id` set. The legacy
action-chain engine is **fully retired and dropped** (ADR-152 Phase B3, migration
`20260609104000`) — the tables and the `quest_outcomes()` RPC no longer exist. There is no second
Journey system.

---

## 3. The two-clock time model — how 13 weeks works

The hardest design problem: a 13-week season aligned to a solstice does **not** start on a
calendar week boundary, which breaks naïve weekly counting. **Solved by running two clocks**,
because "week" is being asked to do two incompatible jobs. Split them and the problem vanishes.

### Clock 1 — the rhythm clock (rolling · personal · always-on)
Powers: cadence targets, the daily streak, the weekly-rhythm bonus. A **rolling 7-day window
anchored to *today*.** It never references the season boundary, so none of the "standard weekly
stuff" has to align to 13. This is exactly what `getActiveJourneyProgress()` already does — kept
untouched. *(Internal-only name — the UI says "streak"; [NAMING.md](NAMING.md) §Internal-only timers.)*

### Clock 2 — the quest clock (fixed · seasonal)
Powers: the 8-of-13 completion track and the narrative Acts. **Season-relative week buckets**
anchored to the season start, not the calendar. *(Internal-only name — the UI says "season,"
never "quest clock"; see [NAMING.md](NAMING.md) §Internal-only timers.)*

```
Season Week N  =  days [ start + 7·(N−1) ,  start + 7·N )
bucket(log)    =  floor( (logged_for − season.starts_at) / 7 )   →  clamp 0..12
```

A **season is defined as exactly 91 days = 13 × 7**, beginning on/near the solstice
(`seasons.ends_at = starts_at + 91d`). Every bucket is a clean 7 days — no partial weeks, no
Monday dependency. The ~1–2 day drift from the exact astronomical solstice is invisible and
buys perfect counting.

### Why this fully resolves the tension
- The two clocks answer different questions — *"Am I in rhythm right now?"* (rolling) vs.
  *"How many weeks have I banked this season?"* (fixed buckets) — so they never fight.
- **Zero new progress schema.** A bucket is pure arithmetic over `practice_logs.logged_for` vs
  `seasons.starts_at`. The briefs' "no new tracker" promise holds.
- Each bucket carries a satisfying **two-tier** meaning:
  - **Touched** (≥1 qualifying day) → counts toward **8-of-13 completion** (the forgiving bar).
  - **In rhythm** (all steps hit target that week) → fires the **+50 rhythm bonus**, shows a
    "perfect week", paid **once per bucket** (idempotent via `reward_grants`).

### Acts (narrative) fall out for free
The 13 buckets map to the season's story beats. Live reward track is "visible from day one"
because the buckets are fully determined the moment the season drops.

| Act | Weeks | Beat |
|---|---|---|
| **Act 1 — Open** | 1–4 | Establish the practice. Onboarding pressure → get to Day 7. |
| **Act 2 — Deepen** | 5–9 | Mid-season. Master tier unlocks, twist/variable rewards. |
| **Act 3 — Land** | 10–13 | Bring it home. Completion pushes, season-close ceremony. |

---

## 4. The Journey — adoption, progress, completion

**Adopting** (free, always — ADR-152): a Journey's practices flow into the member's daily log
via `adoptPractice`; the adoption is recorded in `journey_plan_adoptions`. **No separate
tracker** — progress is derived from `practice_logs` (ADR-144).

**Per-step weekly progress** (rhythm clock): for each step, count distinct days logged in the
rolling 7-day window. A step is **on track** when that count ≥ its weekly target
(`weeklyTargetFromCadence`: Daily=7, A-few-times=3, Weekly=1). The **current step** = the first
not-yet-on-track step, in order. *(All canonical, unchanged.)*

**Season completion** (quest clock — net-new): a **qualifying day** = a day with ≥
`min_practices_per_day` logs (default 1). A **qualifying week** = a season-week bucket with ≥1
qualifying day. **Complete the Journey when qualifying weeks ≥ `target_weeks` (default 8) of the
13.** Forgiving by design: 5 hard weeks won't end you.

**Completion reward:** `completion_gems` (default **30**) + a permanent completion badge. Fires
once, idempotent (§6).

**Season-locked vs evergreen.** Official Journeys are season-locked (anchor = the quest's
season). Library Journeys can be evergreen (anchor = adoption date, rolling 13-week personal
window). `season_locked` toggles it.

**Late-adopter grace** (on-brand): if a member adopts an official Journey too late to bank 8 of
the season's remaining buckets, at season close their copy **converts to evergreen** so they can
still finish — they forfeit only the season-trophy facet, not the badge.

`JourneyProgress` gains: `seasonWeek` (current bucket+1), `qualifyingWeeks`, `targetWeeks`,
`complete`, `weeksRemaining` — all derived in `getActiveJourneyProgress()`.

---

## 5. Practice depth tiers — the differentiator (Initiate / Adept / Master)

> **Canon ([NAMING.md](NAMING.md), ADR-208):** the depth tiers are **Initiate / Adept / Master**,
> default **Adept** (the middle tier — exactly the old default's behavior). The retired
> Spark/Current/Deep names were renamed in schema by migration `20260613000020`.

**The mechanic no app has.** Every practice ships **three versions**. Same practice, same Zap,
same streak — different depth of what you actually do in the world.

| Tier | Form | Example — *Morning Stillness* |
|---|---|---|
| **Initiate** | Minimum viable. 5–10 min. The worst-day version. | 5 min before screens, eyes closed, no agenda. |
| **Adept** | Standard. 15–30 min. The default display. | 15 min sitting, phone in another room, before coffee. |
| **Master** | Full expression. 30+ min, or needs facilitation/buildup. | 30 min extended sit with breath work, before any device. |

**The circle adjustment** — the whole story. A circle **Host sets the default tier** for the
group: a beginner circle runs Initiate, a seasoned circle runs Master. A human who knows the room,
not an algorithm. Members can **individually override**. **Tier never affects Zap reward or
streak math** — only the practice content.

### Schema (net-new)
- **Tier content lives on the practice** (authored once, reused everywhere):
  `practice_tiers (practice_id, tier ['initiate'|'adept'|'master'], title, body, est_minutes,
  UNIQUE(practice_id, tier))`. Missing tier falls back to `practices.description` as "Adept".
- **Tier selection** resolves in order: **member override → circle default → item default →
  `'adept'`**:
  - `journey_plan_items.default_tier` (item default; default `'adept'`).
  - `circles.default_intensity_tier` (Host-set; nullable).
  - `journey_plan_adoptions.tier_override` (per-member, per-Journey; nullable).

Resolver: `resolveTier(member, circle, item)` in `lib/journey-plans.ts` — pure, unit-tested.

---

## 5A. Lessons & blocks — the e-learning layer (net-new, ADR-244)

> **The shift.** Everything above treats a Journey as a *practice-rhythm engine* — adopt
> practices, log them, progress is derived. ADR-244 layers an **instructional course** on
> top of that engine so a Journey can also teach: header video, video lessons, readings,
> knowledge checks, and members checking lessons off. The practice loop is untouched; it
> becomes *one block type among several*. This is Frequency's edge — most courses are all
> theory and no application; we keep the application loop inside the course.

**The block model.** `journey_plan_items` was one practice per row. It generalizes to a
typed **block**:

| `block_type` | What it is | Progress |
|---|---|---|
| `practice` | An existing real-world practice (keeps cadence, tier, all rewards). The default; existing rows backfill to this. | Derived from `practice_logs` (unchanged) |
| `lesson` | Title + markdown body, optional **video** + images + attachments. The unit a member checks off. | `journey_lesson_progress` row |
| `resource` | A download / external link. | Optional check-off |
| `check` | A knowledge check or reflection prompt; can gate the next block. | `journey_lesson_progress` row |
| `section` | A structural header; blocks point at it via `parent_id` → **Course → Modules → Lessons**. | n/a |

A practice block must carry a `practice_id`; a non-practice block must not (`CHECK`). The
old `UNIQUE(plan_id, practice_id)` becomes a **partial** index (practices still can't
duplicate; lessons can repeat). The plan gains `intro_video` (a hero video to pair with
`intro`) and `sequential` (off = open navigation; on = unlock-next-on-complete).

**Two independent completion tracks.** The decision (ADR-244) keeps them un-entangled:

- **Course complete** = every `required` lesson/`check` block has a completion row for the
  member → pays `completion_gems` + a badge **once**, idempotency key
  `journey.course.complete:<profile>:<plan>` (no season token — lessons aren't seasonal).
- **Season complete** (the practice/quest clock, §4/§6) keeps firing exactly as today, on
  its own clock. A Journey with both lessons and practices can pay on both tracks.

**The one net-new progress store.** Practices stay derived; lesson check-offs need
persistence → `journey_lesson_progress (profile_id, plan_id, item_id, completed_at,
last_position)`, member-owned RLS. `last_position` powers "resume where you left off"
(e.g. video seconds). That is the *only* new progress table — the two clocks are unchanged.

**Authoring is unchanged (§12).** Any member authors their own journey including lessons;
Guide/Mentor or community-ops staff publish official + link a Quest; member public
submissions still pass review. No new permission concepts.

---

## 6. The reward stack + firing rules

Currency follows **ADR-139**: real-world acts → **Zaps**; on-platform acts → **Gems**. Practice
logging and its consistency bonuses are real-world → Zaps; Journey completion pays Gems (matches
the existing ladder's "Finish a Journey = 30 Gems"). Every grant is ledgered
(`zap_transactions`/`gem_transactions`); the profile totals + rank move only via the existing
trigger. **Idempotency is non-negotiable** — every bonus is keyed in `reward_grants`.

| Trigger | Reward | Idempotency key | Status |
|---|---|---|---|
| Log one practice | **+12 Zaps** (per-practice override 8–15 via `practices.reward_zaps`) | existing per-log guard | ✅ |
| All today's steps logged | **+25 Zaps** (Full Day) | `fullday:<profile>:<date>` | 🔴 wire |
| All steps on track this bucket | **+50 Zaps** (Weekly Rhythm) | `rhythm:<profile>:<plan>:<season>:<bucket>` | 🔴 wire |
| Qualifying weeks ≥ target | **+30 Gems** + badge (Journey complete) | `journeycomplete:<profile>:<plan>:<season>` | 🔴 wire |
| All `required` lesson/check blocks done | **`completion_gems` + badge** (Course complete — ADR-244) | `journey.course.complete:<profile>:<plan>` | 🔴 wire |
| Challenge complete | 15–200 Zaps/Gems by act type | existing | ✅ |
| Streak milestone | bonus Zaps + permanent badge | existing | ✅ |
| Season end | Zaps → Gems at rank rate + **trophy** | `reset_season()` | ✅ |

**Variable reward** matters: not every log feels identical. Surprise milestone toasts, **secret
achievements** (`achievements.is_secret` already exists), and the rhythm bonus that only fires
on full consistency create the unpredictability that sustains the loop.

**The dopamine moment** (logging) must *feel* good: the number ticks up (animated `+`), the
streak pulses, the step goes green. Server actions already grant; this spec adds the missing
**Full Day / Rhythm / Completion** firings + the celebration surfaces (§10).

---

## 7. Streaks + shields (exists — how Journeys use it)

The daily **practice streak** (the headline retention metric) lives on
`profiles.current_streak`/`longest_streak` with **freeze-token shields** (`streaks.freeze_tokens`,
cap 2). One practice logged = streak lives; zero = breaks (or spends a shield). **Day 7 is the
inflection point** (7-day streakers are 3.6× more likely to finish) — Act 1 is engineered to get
members there. Shields are **earned** (log all of a day's steps → bank a shield), never bought —
preserving the streak's emotional weight ("Earn Back" model). Milestones (7/14/30/60/91-day) fire
celebrations + permanent badges; "Season 1, 13-week streak" becomes an identity marker.

*No change to the streak engine — Journeys simply ride it. The 91-day season milestone aligns to
the full-season streak.*

---

## 8. Challenges (exists — the social layer)

Season-wide objectives that sit **beside** Journeys, rewarding what builds community. ~12 per
season (3 easy · 4 normal · 3 hard · 2 legendary), in `season_challenges` + `challenge_progress`.
**Social challenges** (the real ones) require another person, a place, or a public act — bring
someone in, host a gathering, show up to N events, scan N nodes. Solo is impossible; that's the
point. They pay **4–10×** a practice log (50–200 vs 12).

**The Luminary double gate:** completing every season challenge sets
`profiles.season_challenges_complete = true`; that flag **plus** the Zap threshold (3000) is
required for **manual** Luminary promotion. Auto-advance never grants Luminary (ADR-012). Expect
a handful per season — genuinely rare.

---

## 9. Signature bets — "world's never seen" (go-big redesign)

The briefs are the floor. These three are the ceiling, chosen because they exploit substrate we
already have (circles, hosts, memberships, pillars, `reward_grants`, `is_secret`) for maximum
novelty at low cost.

### 9.1 Co-op — circle co-op completion (the headline)
> **Canon ([NAMING.md](NAMING.md), ADR-199/ADR-208):** this mechanic is **Co-op**. It is **not**
> "Resonance" — Resonance is the Connection-Layer tie-strength concept (ADR-186), a separate thing.
> The earlier draft naming here is retired.

A **raid for self-development.** When **≥3 active members of a circle** hold an active adoption of
the **same Journey**, the circle forms a **Co-op** — a shared progress meter visible to all of
them. Mechanics:
- **Weekly co-op bonus:** in any season-week where ≥3 members hit rhythm, every co-op
  member gets a circle bonus (Zaps), keyed `coop:<circle>:<plan>:<season>:<bucket>`.
- **Shared trophy:** when the Co-op completes the Journey together, mint a **circle trophy**
  + bonus Gems for each member.
- **Detection is derived** (memberships ⨝ adoptions); grants are idempotent via `reward_grants`.
  An optional `circle_coops` row tracks formation for display (Phase 2).
- Turns solo habit into a team objective and directly drives the **Circle Journey Alignment**
  metric (>40%). No habit app has co-op completion.

### 9.2 The Frequency Signature
A personal, **evolving visual identity** derived from a member's Mind/Body/Spirit/Expression
balance across their practice logs — a four-axis "constellation" that changes shape as they
practise across Pillars. Becomes the **profile centerpiece** and a **season-trophy facet**. Makes
"balance across Pillars" a *visible identity*, pulling members toward the **>2 Pillars by Week 4**
target. **Fully derived** (`practice_logs ⨝ practices.domain_id` — the FK column keeps its
`domain_id` name until the Wave-3 rename) — no schema.

### 9.3 Variable & secret rewards
Surprise the player. **Secret achievements** (already supported) that no one knew were possible;
a **mid-season Act 2 twist**; occasional bonus multipliers on a perfect week. The unpredictable
reward (Pokémon Go's "rare spawn" delight) that keeps the loop alive.

**Shipped — Surprises (ADR-210):** the variable-bonus piece is live (`lib/surprises.ts`), in two
flavors, each at most once per UTC day, both pure-deterministic per `(member, day)` (idempotent +
unfarmable) and claimed once through `reward_grants`:
- **Gems** on any practice log (≈ once every ~4-5 active days) — the personal daily loop. Gems are
  cosmetic/spendable, so a lucky roll never touches the season ladder. Sizes common 6-12 / rare 25 /
  gleam 50; surfaced in the existing log toast.
- **Zaps** on *appropriate behavior* — the real-world / community acts that earn Zaps (attend, host,
  refer, complete a task, scan a code; ADR-139). Because Zaps drive rank, the variance is tied to
  genuine in-person participation (never idle luck) and kept modest against the base award (common
  3-6 / rare 12 / gleam 25, rate 0.18). Hooked once at `processGamificationEvent`; granted through
  `awardZaps` so rank advances normally; surfaced as a **toast** (a global `SurpriseToaster` reads
  recent grants via `/api/surprises/recent`, since these acts fire-and-forget) and in the Vault Zap
  ledger.

The odds stay secret by design (no operator page). Still ahead: the Act-2 mid-season twist and the
season-launch moment below.

*Supporting texture from the briefs: the **season-launch moment** (an event, not an update —
the Fortnite reference) and the **live reward track** visible from day one.*

---

## 10. The Journey page + widgets

**Canonical URL:** `/journeys/[slug]` is the one Journey page; it flips between **Discovery**
(not adopted / visitor) and **Active** (adopted) modes. `/crew/journey` stays as the
**all-my-journeys aggregator** (every active adoption at a glance).

**Discovery mode:** emoji + accent band, title, Pillar·Season·Author, premise, Pillar balance
meter, social proof ("47 on this journey"), Adopt / Remix / Preview, the Story (markdown), The
Path (ordered steps), reward preview (30 Gems), completion rule (8 of 13).

**Active mode:** gamification panel (Zaps · rank · streak · Gems), Journey progress (Week N of
13 · qualifying-weeks toward 8 · % toward completion), the **Next Step card** (the dominant
element — practice, time, days-this-week, one big **Log** tap target), the full step checklist
with on-track states, the Co-op/circle-companions strip, streak + shields, the practice
guide (markdown).

**Widget system (`page_config`).** The Journey page composes toggleable, reorderable content
blocks — same pattern as the right-rail panel framework (`WidgetCard`, Suspense streaming). The
author configures which blocks show, order, and per-widget settings; this lives on
`journey_plans.page_config JSONB` (ordered array of `{id, enabled, settings}`). A sensible
default is hardcoded in `lib/journey-plans.ts` and applied when `page_config` is null. Available
widgets: progress tracker · next-step card · checklist · pillar balance · streak · gamification
panel · reward preview · circle companions · **Co-op** · leaderboard (scope: circle/nexus/
global) · season context · practice guide · related journeys · community activity.

**Mobile:** single vertical scroll; compact gamification strip; full-width Next Step card on top;
**swipe-to-log** on checklist rows; **circular progress arc** (not a bar); story collapses to
"Read more"; no right rail (widgets stack, per `page_config`).

**Public discovery surface (SEO/AEO).** `/discover/journeys` (index) and
`/discover/journeys/[slug]` (detail) are the only PUBLIC, indexable Journey pages — anon, in the
`app/discover` route group, `revalidate = 3600`, listed in the sitemap and the Discover nav. They
reuse the same discovery widgets the in-app page composes (Story / Path / Pillar balance /
Completion rule / Reward preview) and replace the adopt/remix actions with a sign-in CTA. Each
detail page emits **`HowTo` JSON-LD** (the answer-engine lever for guides, CONTENT-VOICE §8b): the
ordered Practices become `HowToStep`s, with the default (Adept) tier minutes summing to
`totalTime`. Reads go through `getPublicJourney` / `listPublicJourneys` (`lib/journey-plans.ts`),
which use the module's admin handle guarded in code to `visibility = 'public'` AND
`status != 'rejected'` — no SECURITY DEFINER RPC is needed because a published library Journey
carries no private/location data (ADR-209).

---

## 11. The editor (extend `JourneyBuilder`)

Lives in the existing Studio window shell (`components/studio/journey/journey-builder.tsx`,
ADR-142) with `useStudioDraft` autosave. **Live preview pane** renders the Journey page as others
will see it. Built today: identity block, story, path builder (drag-reorder, per-step
cadence/note), pillar meter, visibility radios + publish celebration. **Net-new sections:**

| Section | Adds |
|---|---|
| **Outline — blocks** (ADR-244) | Add/reorder/nest typed blocks: **Lesson** (markdown + video/images/files), **Reading**, **Resource**, **Knowledge check**, **Practice**, **Section**. Per-block inspector; sections group blocks (`parent_id`). |
| **Path — per step** | **Default depth tier** (Initiate/Adept/Master), required-vs-optional toggle, log type. |
| **Identity — hero video** (ADR-244) | `intro_video` header video to pair with the story. |
| **Completion rules** | `min_practices_per_day` (1/2/3), `target_weeks` (6/8/10/13), `season_locked`; `sequential` gating (ADR-244); course-completion is lessons-done (separate from the season clock). |
| **Rewards** | `completion_gems` (10–100, default 30); per-practice Zap override (Mentor/Admin only). |
| **Page layout** | The `page_config` widget toggles + drag-reorder (mirrors the rail framework). |
| **Visibility & publishing** | Private/Unlisted/Public; `status` (draft/pending/approved/rejected). |
| **Official (Guide/Mentor)** | `official` flag + `quest_id` assignment dropdown. |

---

## 12. Permissions + lifecycle

Roles are the real system — `profiles.community_role ∈ member/crew/host/guide/mentor` (there is
**no `is_staff`**; the briefs' `is_staff` maps to `mentor`). See [`ROLES.md`](ROLES.md).

| Action | Who |
|---|---|
| Create a Journey (starts private) | any authenticated member |
| Publish to Unlisted / Public | any member (Public by member → review; Mentor+ auto-approves) |
| Flag **official** + link a Quest | `community_role ∈ (guide, mentor)` |
| Edit another member's Journey | **nobody** — author-only |
| Set a circle's default tier | the circle **Host** |

**Lifecycle:** created → private → (unlisted/public) → if public & member-built: `status=pending`
→ Guide+ approves/rejects → if official: Mentor/Guide sets `official=true` + `quest_id`.

**Review backlog** target: 0 within 48h (`status='pending'` count) — Journeys sitting in pending
kill the motivation to publish.

---

## 13. Data model — exists vs. net-new

**Already exists (assemble, don't rebuild):** `journey_plans` (incl. `quest_id`, `official`,
`intro`, `emoji`, `accent`), `journey_plan_items` (incl. `cadence`), `journey_plan_adoptions`,
`quests`, `seasons`, `practices` (incl. `domain_id`, `cadence`, `reward_zaps`), `practice_logs`,
`season_challenges`/`challenge_progress`, `achievements`/`user_achievements`, `streaks`
(`freeze_tokens`), `season_trophies`, `reward_grants`, full Zap/Gem ledgers + triggers, `circles`/
`memberships`, `pillars` (renamed 2026, see docs/NAMING.md; migration `20260613000010`).

**Net-new migrations:**
1. `practice_tiers` — Initiate/Adept/Master content per practice (tier text renamed
   2026 — see docs/NAMING.md; migration `20260613000020`).
2. `journey_plan_items.default_tier` (default `'adept'`).
3. `circles.default_intensity_tier`.
4. `journey_plan_adoptions.tier_override`.
5. `journey_plans`: add `status`, `page_config JSONB`, `min_practices_per_day`, `target_weeks`,
   `season_locked`, `completion_gems`.
6. `seasons`: ensure `starts_at` set + 91-day `ends_at` convention.
7. *(Phase 2)* `circle_coops` — co-op formation/trophy record.
9. **Lesson blocks (ADR-244, migration `20260617000000`):** `journey_plan_items` gains
   `block_type`, `parent_id` (section nesting), `title`, `body`, `media`, `settings`,
   `required`, `est_minutes`; `practice_id` → nullable + partial unique. `journey_plans`
   gains `intro_video`, `sequential`. New `journey_lesson_progress` (member-owned RLS) is
   the only net-new progress store — practices stay derived.
8. **Done (ADR-152 Phase B3):** the legacy action-chain engine + the `quest_outcomes()` RPC
   are dropped (migration `20260609104000`); `database.types.ts` regenerated.

**Code:** surface the existing-but-unread columns (`quest_id`, `official`, `status`,
`page_config`, completion fields) in `PLAN_COLS` + the `JourneyPlan` interface in
`lib/journey-plans.ts`; extend `getActiveJourneyProgress()` for the quest clock + tiers.

---

## 14. Metrics

**North Star — WAM:** `COUNT(DISTINCT profile_id)` with a `practice_logs` row in the last 7 days.
Every mechanic exists to move this. We do **not** optimise time-in-app, posts, or sessions.

| Metric | Definition | Target |
|---|---|---|
| Day-7 streak rate | streak≥7 ÷ adopters-within-14d | >40% (<30% = onboarding fail) |
| Journey adoption | adoptions ÷ active members/season | >60% |
| Journey completion | qualifying-weeks≥8 ÷ adoptions | >30% (<15% too hard) |
| Practice log freq | avg logs/member/week | 4+ |
| Full-day rate | 4+-log days ÷ any-log days | >20% |
| 14-day streak rate | streak≥14 ÷ WAM | >25% |
| **Circle Journey alignment** | circles w/ ≥3 on same Journey ÷ active circles | **>40%** (the community signal / Co-op) |
| Official Journey coverage | members w/ ≥1 official adopted ÷ active | >70% |
| Pillar balance / member | distinct Pillars across active Journeys | >2 by Week 4 |
| Season trophy rate | trophies minted ÷ members who logged once | >60% |
| Luminary rate | Luminary promos ÷ active/season | <3% |
| Season-over-season retention | active in N **and** N+1 | >50% |

---

## 15. Build phases

Sequenced so a playable, addicting loop lands first; "everything in the briefs" follows.

| Phase | Ships | Why first |
|---|---|---|
| **P0 — Schema + engine** | Migrations 1–6; surface columns; extend `getActiveJourneyProgress` (quest clock, tiers); `resolveTier`. Unit tests. | Foundation everything reads from. |
| **P1 — The loop feels good** | Fire Full Day / Rhythm / Completion (idempotent); celebration surfaces (toast, full-screen completion, perfect-week); Next Step card + swipe-to-log + circular arc. | The dopamine loop is the product. |
| **P2 — Intensity tiers** | `practice_tiers` content; circle Host default-tier control; member override; tier display on the page + editor. | The differentiator, end-to-end. |
| **P3 — Active page + widgets** | `/journeys/[slug]` Active mode; `page_config` widget system + editor "Page layout" section; defaults. | The full briefed page. |
| **P4 — Official program + review** | `status` workflow; official flag + `quest_id` linkage; seed the 4 Pillar Journeys (one per Pillar) for the active season. *(legacy action-chain engine retirement already done — mig `20260609104000`.)* | Season-1 official content. |
| **P5 — Signature bets** | Co-op · Frequency Signature · variable/secret rewards · season-drop moment. | Go-big, on top of a proven loop. |
| **P6 — Notifications** | Daily next-step prompt at local morning (timezone-aware): "[Journey]: [Practice]. [time]." | Fogg prompt — Ability already high. |

**Lesson-layer phases (ADR-244), sequenced independently of P0–P6 above:**

| Phase | Ships |
|---|---|
| **L0 — Schema** | Migration `20260617000000` (block columns, `journey_lesson_progress`, hero video, `sequential`); backfill items → `practice`; surface the block fields in `JourneyPlanItem`/a `JourneyBlock` union + `PLAN_COLS`/`ITEM_COLS`. Unit tests. |
| **L1 — Render + check-off** | Member journey page renders blocks (video, readings, sections), persists check-offs, shows %-complete + resume; a syllabus/lessons page widget. |
| **L2 — Course-completion reward** | Fire the course-complete bonus (`journey.course.complete:*`, idempotent) → `completion_gems` + badge when all `required` lessons are done; practice rewards untouched. |
| **L3 — Block editor** | Block-based outline in `JourneyBuilder` (+ the admin variant): add/reorder/nest, per-block inspector, live preview. Register the editor route's chrome in `lib/layout/page-chrome.ts`. |
| **L4 — E-learning polish** | `sequential` gating, knowledge-check blocks, transcripts/captions, total-time, optional drip. |

---

## 16. Docs to reconcile (staged — apply when the repo is clear)

This spec is authoritative; the following edits make the rest of `docs/` agree. **Staged, not
applied** (another agent is live; `DECISIONS.md` is an append file). Apply on the go-ahead:

- **`THE-QUEST.md`** — add Season = 91-day/13-bucket convention + Act arc; point "Journey
  progress" line at this doc for the completion model.
- **`ECONOMY-AND-JOURNEYS.md`** — mark §5 fully superseded by this doc (not just by ADR-152);
  the premium-Journey framing is dead.
- **`DATABASE.md`** — document migrations 1–6 once written.
- **`DEVELOPMENT-MAP.md`** — add the P0–P6 build items.
- **`GLOSSARY.md`** — add: depth tier (Initiate/Adept/Master), Co-op, Frequency Signature,
  season-week bucket, qualifying week.
- **`content/help/the-game/`** — member articles for tiers, completion, Co-op (P2/P5).
- **`DECISIONS.md`** — these ADRs are now **appended** (read them verbatim in their era;
  naming superseded by ADR-208). Canon names, for reference:
  - **ADR-196** — `journey_plans` is the single Journey spine; legacy action-chain engine retirement (now done, ADR-152).
  - **ADR-197** — Two-clock time model: rolling **rhythm clock** + fixed 91-day **quest clock**
    buckets; completion = 8 of 13, derived from `practice_logs` (no progress schema).
  - **ADR-198** — Depth tiers: content on `practice_tiers`; selection resolves
    member→circle→item→`adept`; tier never affects Zap/streak math. *(Tier names Initiate/Adept/
    Master per ADR-208; the ADR-198 entry itself reads in its era.)*
  - **ADR-199** — **Co-op**: derived circle co-op completion; idempotent grants via
    `reward_grants`; optional `circle_coops` for display. *(Coined as "Chorus"; renamed Co-op by
    ADR-208. Not "Resonance" — that's the Connection Layer.)*
  - **ADR-200** — Reward firing: Full Day / Weekly Rhythm / Journey completion, each keyed in
    `reward_grants`; currency per ADR-139.
</content>
</invoke>
