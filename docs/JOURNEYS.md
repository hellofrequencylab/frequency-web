# Journeys — the canonical system spec (v2, learning-first rebuild)

Status: ✅ **Authoritative (2026-06-14).** This is a **clean-slate rebuild** of the Journey
system around a single idea: **Journeys are group-coaching programs a Circle moves through
together.** It supersedes the prior practice-rhythm/season model entirely (the two-clock
season engine, the 8-of-13 completion rule, and depth tiers are retired — see §9). Decision
record: [ADR-252](DECISIONS.md). Built on a five-angle evidence review of what makes online
learning complete (§10). Code + `supabase/migrations/` remain the ultimate source of truth.

---

## 1. The premise (lead with the answer)

Every course platform ships content and hopes people finish. They don't: self-paced
courses complete at **5-15%**. The one thing that fixes it is **doing it together** —
cohort-based programs complete at **85-96%** because of accountability, a shared group, and a
visible pace (§10). Frequency already has the thing every course startup tries to bolt on:
**real Circles of real people.**

So a **Journey is a guided program your Circle runs together** — bite-sized e-learning
(video, readings, exercises, reflections, knowledge checks) organized into **Phases**, where
each person earns points for finishing parts and the **whole Circle earns trophies** for
completing phases and the program. It's e-learning presented as a game the group plays
together. The learner front-end is dead-simple; the creator back-end is a breeze.

---

## 2. The model

```
Journey (the program / template)
 └─ Phase     ← the weekly milestone. Finishing one = a trophy + reward.
     └─ Module    ← a grouping within a phase (a "session").
         └─ Lesson  ← bite-sized leaf content. One of:
              video · reading · exercise · reflection · knowledge-check · practice · resource
```

- A **Journey** is authored once as a program (or from a template), then **run** many times.
- A **Phase** is the milestone unit and the trophy moment. Phases drip **one per week** by
  default (configurable interval) once a Run starts — soft deadlines that pace the group.
- A **Module** groups lessons inside a phase (optional one-module-per-phase is fine).
- A **Lesson** is the bite-sized leaf. Videos target **≤6 minutes** (the engagement cliff,
  §10). A `practice` lesson is the *optional* real-world act (the old "practice," demoted to
  one block type among several — it is no longer the core of a Journey).

The hierarchy is the existing `journey_plan_items` block tree generalized with two new
container block types (`phase`, `module`) + `parent_id` nesting (§7).

---

## 3. The Run — a Circle moving through a Journey together (the flagship)

A **Run** is one Circle going through one Journey, cohort-style. This is where completion is
won (§10: cohorts 85-96% vs solo 5-15%).

- **Launch:** a Circle **Host/coach** starts a Run of a Journey for their Circle, with a
  **start date**. Members of the Circle are enrolled (or opt in).
- **Kickoff + check-ins:** a Run opens with a **kickoff meetup** and prompts a **phase
  check-in meetup** each week, created through the existing Events system (live touchpoints
  lift completion ~68%, §10). Built-in and encouraged by default; a coach can skip them.
- **Weekly drip:** **Phase N unlocks on (Run start + 7·(N-1) days)** by default; the interval
  is configurable per Journey. Once a phase has dripped it **stays open** — anyone behind can
  catch up; no one is locked out.
- **Shared progress:** the Run shows **one cohort progress meter** ("our Circle is 60%
  through Phase 2"), plus light social proof ("3 of your Circle finished this week"). The
  progress is **cooperative** — a shared meter and group wins, **never a global leaderboard**
  (those demotivate lower performers, §10).
- **Group trophies:** when the **Circle** completes a phase / the whole Journey together, mint
  a **Circle group trophy** + a bonus for every member — on top of each member's individual
  trophy. This rides the existing co-op engine.

**Solo runs.** Any member can also take a Journey **alone** from the public library (the
fallback, not the flagship). A solo enrollment drips phases weekly from the member's own start
date and skips the cohort/meetup layer. Same content, same individual trophies.

---

## 4. Completion, points & trophies

Completion is **phase- and program-based** (the season/8-of-13 model is gone):

| Event | Reward | Notes |
|---|---|---|
| Finish a lesson/module | small **points** (Gems) | a gentle *progress signal*, paired with encouragement — never the reason you're doing it (§10, overjustification) |
| Finish a **Phase** (all required lessons) | **phase trophy** + Gems | the milestone moment; celebration surface |
| Finish the **Journey** | **journey trophy + optional certificate** + Gems | the headline completion; shareable |
| The **Circle** finishes a phase / the Journey together | **Circle group trophy** + bonus for each member | cooperative; co-op engine |
| A `practice` lesson (real-world act) | **Zaps** | real-world acts earn Zaps (ADR-139); on-platform lessons earn Gems |

**Design guardrails (from the research, §10):**
- Points **signal progress**; trophies map to **real mastery** (finishing a phase), not
  busywork. Pair every reward with praise/feedback (protects intrinsic motivation).
- A **progress bar that's never empty** (endowed-progress effect accelerates finishing).
- **Streaks with a freeze** (a stumble shouldn't kill momentum) — reuse the existing streak
  engine.
- **Cooperative only.** Shared meters and group milestones; if any ranking, it's
  Circle-relative, never global.
- **Variable/celebration moments** (confetti, surprise bonuses) keep it feeling like a game.

All grants are idempotent via `reward_grants`. Reward plumbing reuses the existing
Zaps/Gems/trophy/co-op systems — retuned, not rebuilt.

---

## 5. The learner front-end (super clean)

A Netflix-simple **lesson player**:
- **Left:** the syllabus (Phases → Modules → Lessons) with a status dot per lesson + a
  **progress meter** at the top. Current/locked/done states.
- **Right:** the active lesson — title, a ≤6-min video or markdown body or exercise prompt,
  and **one clear next action** ("Mark complete & continue"). Knowledge-check lessons give
  **instant feedback + retries** (the testing effect, §10).
- **Practice steps → On Air (ADR-304):** a practice step shows a SINGLE action keyed to the
  practice's `uses_timer` — **"Practice"** (opens the global On Air timer overlay pre-set to this
  practice, no navigation) for a sit/breathwork, or **"Log it"** (one-tap log) for an action or
  reflection. Completion is **log-gated**: "Mark complete & continue" stays grey until the practice
  is logged today; clicking it unlogged reveals a warning + a "Continue without logging" escape
  hatch. Enrolling a Journey **auto-adopts** its practices (`adoptPlan`), which **auto-links** them
  in On Air (it reads the member's adopted set).
- **Resume where you left off** (last lesson + video position).
- **Celebration moments:** confetti + trophy at each **phase complete** and at **journey
  complete**; a certificate to keep/share.
- **The Run header** (cohort mode): the shared Circle meter, this week's phase, the next
  check-in meetup, and who in the Circle is moving.
- **Mobile:** single scroll, big tap targets, the syllabus collapses; bite-sized by design.

Public discovery (`/discover/journeys`) stays as the SEO/AEO surface with sign-in CTAs.

---

## 6. The editor (a breeze)

A **full-page course builder** at `/journeys/[slug]/edit` (both "New journey" and "Edit journey"
land here — no popup). Best-practice course-creator layout: a sticky builder bar (title · status ·
Preview · Done) over three tabs — **Curriculum** (the structure editor, the star), **Details**
(identity/cover/release), **Settings** (advanced + danger). Panels stay mounted across tab switches
so unsaved input survives; every section autosaves on blur (no Save button).

This is an immersive build surface, so the global community **right rail stays mounted but starts
collapsed to a mini strip** (`railStartsCollapsed` in `lib/layout/page-chrome.ts` — `railFor` still
returns `'global'`, the rail is never removed): an expand toggle at the rail's foot opens it to the
full width, a collapse toggle returns it. Default on this route is collapsed, for the build width.

**Vera composes the opening week.** A new Journey opens pre-propagated with a balanced shape: **one
practice per Pillar** — **Mind**, **Body**, **Spirit**, and **Expression** (an Expression practice is
about putting it out: make/share/connect). So a fresh Journey starts balanced across all four Pillars
(each is a `practice` block tagged to its Pillar `domain_id`; logging it feeds the four-Pillar
Signature like any practice). The Vera box sits at the top of the Curriculum tab — the author says
what they're making and Vera fills the shape, either reusing a fitting library practice
(`searchLibraryPractices({ pillarId })` candidates, picked by id) or writing a new inline one. Falls
back to the empty shape ("Start with the shape") when AI is off. Code: `journey-composer.tsx`,
`lib/ai/journey-composition.ts` (Opus, forced-tool, every library id re-validated against the
candidates), `composeJourneyAction` / `scaffoldJourneyAction`.

**Extra-credit Challenges (ADR-300 Part 2, shipped).** Above-and-beyond bonus tasks on a Journey that
pay **regular Zaps** on completion (not a Pillar practice). An `exercise` block with `required=false`
+ `settings.extra_credit` + `settings.bonus_zaps`; Vera seeds one per composed Journey and the author
can add more (`addExtraCreditAction`). The bonus Zaps are paid exactly once on check-off via the
`reward_grants` lock (`lib/journeys/grants.ts` `grantExtraCreditIfAny`). The editor shows an Award chip
+ editable Zaps field; the player shows an "Extra credit · +N Zaps" badge.

One adjacent layer is still planned (DECISIONS ADR-300 Part 3): **Side Quests** — reward-only missions
that grant a badge and do not touch the Pillar Signature, built on the `achievements` engine.

**Structure-first**, template-driven, with live preview:

1. **Start from a template or blank-with-prompts.** Seeded templates ("4-Week Reset," "5-Phase
   Coaching Arc," "Onboarding Program") + a blank that walks the author with prompts ("Who is
   this for? What will they be able to do by the end?"). An **AI "draft my outline"** turns a
   description into a Phase→Module→Lesson skeleton to edit (AI outlines materially lift creator
   completion, §10).
2. **The outline tree.** Drag-drop **Program → Phase → Module → Lesson** with inline rename +
   reorder; add a phase/module/lesson with one click.
3. **Block-based lessons.** Each lesson is typed (video/reading/exercise/reflection/check/
   practice/resource); a focused inspector per type (paste a video link or upload; markdown
   body; quiz options; mark required/optional; est. minutes).
4. **Live preview.** The lesson player renders as the author types.
5. **Run settings.** Drip interval (weekly default), kickoff/check-in meetups on/off,
   completion rewards (Gems, certificate on/off), visibility + review.
6. **Minimal required fields** to ship: title, who it's for, one outcome, ≥1 phase with ≥1
   lesson. Everything else has a sensible default.
7. **Pillar-faceted practice selector.** Adding a practice to a slot opens a picker with the four
   Pillar facets (Mind/Body/Spirit/Expression): tap a Pillar to preload its practices; unselected
   Pillars stay on screen, greyed, one tap away. No selection = the whole library, plus free-text
   search. (`practices.domain_id` drives the facet; `searchLibraryPractices({ pillarId })` is the
   server twin for paged loads.)
8. **Per-slot Vera coaching prompts.** Each practice slot gets a short coaching line Vera drafts on
   demand (`lib/ai/journey-slot-coaching.ts`, Haiku), grounded **dynamically** in the season, the
   Journey's name, the practice, and its Pillar. Stored on the block's `settings.coaching_prompt`;
   the author can edit it. The player shows it as a Vera nudge when the member reaches the step.

---

## 7. Data model

**Reuse + generalize the existing block spine; add the cohort/Run layer.**

**`journey_plans`** (the program) — kept, simplified. Drops the season fields
(`season_locked`, `min_practices_per_day`, `target_weeks`). Keeps `title`, `slug`, `summary`,
`intro`, `intro_video`, `cover_image`, `emoji`, `accent`, `author_id`, `visibility`, `status`,
`fork_of`, `adopt_count`, `forked_count`, `quest_id`/`official` (official library). **Adds:**
`drip_interval_days int default 7`, `certificate_enabled boolean default false`,
`completion_gems int default 30`.

**`journey_plan_items`** (the block tree) — kept, generalized. `block_type` extends to include
**`phase`** and **`module`** (containers) alongside the leaf types
(`lesson`/`video`/`reading`/`exercise`/`reflection`/`check`/`practice`/`resource`); `parent_id`
gives the Program→Phase→Module→Lesson tree; `sort_order` orders siblings. Existing fields
(`title`, `body`, `media`, `settings`, `required`, `est_minutes`, `practice_id` for practice
leaves) carry over.

**`journey_runs`** (NEW — the cohort) — `id`, `plan_id`, `circle_id`, `host_id`, `started_at`,
`drip_interval_days` (snapshot), `kickoff_event_id` nullable, `status` (`active`/`completed`/
`cancelled`), timestamps.

**`journey_enrollments`** (NEW — replaces `journey_plan_adoptions`) — `id`, `profile_id`,
`plan_id`, `run_id` nullable (null = solo), `started_at`, `completed_at` nullable. One row per
person per take. The drip anchor is `run.started_at` (cohort) or `enrollment.started_at`
(solo).

**`journey_lesson_progress`** (kept) — `profile_id`, `plan_id`, `item_id`, `completed_at`,
`last_position`. The single per-lesson progress store; **all completion derives from it** (no
season buckets). Phase complete = every required leaf under that phase has a row; journey
complete = every phase complete.

**`journey_phase_events`** (NEW, optional) — links a phase to its check-in `event_id` for a
Run (or store on a Run-scoped map). Phase check-in meetups.

Retire: `journey_plan_adoptions` (→ `journey_enrollments`), and the season-coupled progress
derivation in `lib/journey-plans.ts`.

---

## 8. Permissions + lifecycle

| Action | Who |
|---|---|
| Build a Journey (Studio, starts private) | any authenticated member |
| Publish unlisted / public | any member (public by a member → review; Guide/Mentor auto-approve) |
| Flag **official** + link a Quest | `community_role ∈ (guide, mentor)` |
| Start/manage a **Run** for a Circle | that Circle's **Host** |
| Edit another member's Journey | author-only |

Lifecycle: build → private → (unlisted/public, member→`pending`→Guide+ approves) → optionally
official. A Run: created → kickoff → weekly phase drip → completed.

---

## 9. What's retired (the strip)

The old system was a practice-habit engine with e-learning bolted on; v2 flips it (learning
is primary). **Removed:**
- The **two-clock season model** (rhythm + 91-day quest clock) and the **8-of-13 qualifying-
  weeks** completion rule — replaced by phase/program completion (§4).
- **Depth tiers** (Initiate/Adept/Master) as a core mechanic — practices are now one optional
  block type; per-practice tier content is out of the Journey core (may live on `practices`).
- The broken **`/admin/quests`** page (reads dropped legacy tables) — delete.
- Naming drift (chain/arc/track) and **duplicated widgets** (coop-strip vs coop-meter, the
  discovery-widgets monolith) — consolidate.
- The split/season-coupled progress derivation in `lib/journey-plans.ts` — replace with one
  clean per-lesson + phase/program completion model.

`journey_plans` + the block tree + `journey_lesson_progress` survive and are generalized;
the cohort **Run** + **enrollment** layer is net-new.

---

## 10. The evidence base (why this design)

A five-angle research review (full cited brief: ADR-252 / research appendix). Highest-leverage
findings the design is built on:
- **Cohort completion 85-96% vs self-paced 5-15%** (Jordan MOOC analysis; altMBA ~96%; Ruzuku
  32k-course study). Accountability + group + facilitator presence — none alone suffices.
- **Cooperative > competitive; global leaderboards demotivate** (31% negative effect; can lower
  scores). → shared meters, group trophies, no global rank.
- **Videos ≤6 min hold ~100% attention** (Guo et al., 6.9M sessions); micro-lessons ~80%
  completion. → bite-sized lessons.
- **Endowed-progress / goal-gradient** (pre-filled progress 34% vs 19%). → a never-empty bar.
- **Streaks → 3.6× completion *with a freeze*** (Duolingo); knowledge checks (retrieval) **+21
  pts** retention; **certificates/celebration** anchor motivation.
- **Extrinsic points can undermine intrinsic motivation** (Deci/Ryan, 128 studies) — *but
  praise/feedback doesn't*. → points signal progress; trophies = mastery; pair with praise.
- **Weekly live touchpoints +68% completion**; soft deadlines + 4-8 week programs (week-4 is
  the churn cliff). → weekly phase drip + kickoff/check-in meetups.
- **Editor: structure-first + templates + AI outlines** are what make creator tools a breeze
  (Teachable/Kajabi/Skool patterns; AI outlines lift completion materially).

---

## 11. Build phases

| Phase | Ships | Status |
|---|---|---|
| **J0 — Schema + foundation** | The v2 migration (phase/module block types, `journey_runs`, `journey_enrollments`, plan/field changes); the drip-schedule + phase/program-completion pure helpers + unit tests. | ✅ migration applied; helpers + tests shipped |
| **J1 — Learner player** | The clean lesson player on the new tree: syllabus + progress, one-next-action, knowledge-check feedback, resume, phase/journey celebrations. | ✅ player at `/journeys/[slug]/learn` |
| **J2 — The Run (cohort)** | Host starts a Run for a Circle; weekly phase drip; shared cohort meter + social proof; kickoff/check-in meetups via Events; group trophies (co-op). | ✅ Run start on the Circle + cohort meter |
| **J3 — Rewards + completion** | Wire lesson/phase/journey Gems + trophies + certificate, idempotent; streak reuse; celebration surfaces. | ✅ Gems grant (claim-then-pay); trophy + certificate celebration |
| **J4 — The editor** | Template/blank-with-prompts + AI outline; structure-first Program→Phase→Module→Lesson tree; block inspectors; live preview; Run settings. | ✅ template/blank create + structure editor at `/edit`; identity/delivery/publish Settings; practices as an optional block; official + discovery-layout (Advanced) · ⏳ AI outline · ⏳ module layer · ⏳ block inspectors |
| **J5 — Cutover + strip** | Adopted learners go to the v2 player; the author face redirects to the v2 editor; the legacy season course-player + Studio `JourneyBuilder` are retired. | ✅ learner + author cutover; v2 editor owns identity/delivery/publish + structure; season widgets + builder stripped; help docs refreshed; global rail restored on journey routes |

> **Author face = the v2 editor** (`/journeys/[slug]/edit`): a Settings panel (identity, completion
> Gems, certificate toggle, phase-drip interval, visibility/publish) above the Phase → Module →
> Lesson structure tree, with an **Advanced** section (discovery-page layout + official program).
> It reuses the owner-checked plan actions (`saveJourneyMeta`, `setJourneyVisibility`,
> `setJourneyRewards`, `setJourneyDelivery`, `setJourneyPageConfig`, `setJourneyOfficial`). Retired
> with the season model: `JourneyBuilder`, `CoursePlayer`/`journey-course`, the practice-path
> builder, completion-rule + page-layout Studio sections. `/admin/quests` is a harmless redirect
> stub (ADR-211), not legacy to delete.

## 11.1 Backlog — remaining work

Status legend: 🔴 not started · ⏳ partial · ✅ done. Each row is one PR-sized chunk.

| # | Item | What's missing | Why it matters | Status | Size |
|---|---|---|---|---|---|
| 1 | **Phase-drip locking in the player** | `lib/journeys/schedule.ts` (unlock math) is built + unit-tested but **no runtime page imports it** — the player shows every phase unlocked. Wire `isPhaseUnlocked` into the player (and Run anchor date) to lock future phases and show "unlocks in N days". | The "one phase a week" cadence is the core of the cohort pitch; without it a Journey is just a flat lesson list. | ✅ | M |
| 2 | **Knowledge checks / retrieval** | `check` blocks are "mark complete" only — no question/answer or self-check interaction in the player; no per-block quiz settings in the editor. | Retrieval practice is a top, evidence-backed completion + retention lever (JOURNEYS.md §evidence). | ✅ | M |
| 3 | **Module layer in the editor** | The block model + player support Program → Phase → **Module** → Lesson, but the editor only authors Phase → Lesson (modules are skipped, not creatable). | Lets long Journeys group lessons within a phase. | ✅ | M |
| 4 | **AI outline assist** | The "blank-with-prompts" generate-an-outline path from J4 isn't built; templates exist, AI generation does not. | Kills the blank-page problem for authors (highest-leverage authoring feature). | ✅ | M |
| 5 | **Meetups wiring** | `journey_runs.kickoff_event_id` exists but isn't set/used in a flow; no per-phase check-in event links (a `run_phase_events` map) and no built-in "schedule the kickoff" affordance. | Weekly live touchpoints are a large, evidence-backed completion lift; the vision calls them "built-in & encouraged". | ⏳ | M |
| 6 | **Cleanup / tech-debt** | ✅ Legacy season reward/progress engine retired (ADR-253): grant firing removed from `lib/practices.ts`, displays repointed to the v2 reader `lib/journeys/progress.ts`, the engine libs deleted, the season columns (`season_locked` / `min_practices_per_day` / `target_weeks`) dropped by migration `20260624000000` (applies on merge), `lib/database.types.ts` regenerated, and the `runs.ts`/`store.ts`/editor admin handles switched to typed. NAMING v2 pass ✅ done (ADR-252). **Remaining:** retire `journey_plan_adoptions` (still referenced by content-signals, coop-pulse, circles/admin-actions, the prompt cron, demo engine — a separate later assessment). | Keeps the schema + canon honest; removes the untyped-handle workaround. | ⏳ | S |
| 7 | **Polish** | Settings-card visuals (accent dots read as a single faint ring), spacing/empty-state density, and the "Untitled" empty-title lesson UX (prompt or placeholder instead of a bare "Untitled"). | First-impression quality of the editor + player. | ✅ | S |

Recommended order: **#1** (the cadence is the product), then **#7** (cheap first-impression win), then #2 / #4 (engagement + authoring), then #3 / #5, with #6 folded in opportunistically.

> **Progress (2026-06-14):** ✅ **#1–#5 and #7 shipped** — phase-drip locking in the player, interactive
> knowledge checks (player + editor + seeded), the editor module layer, Vera's "draft my outline" assist,
> the kickoff-meetup wiring, and the polish (Untitled fallback, clearer accent picker, cover image as a
> header hero, readable measure). Plus the foundation: `docs/JOURNEYS-DESIGN.md` (cited research spec), the
> official Journeys loaded with real curriculum + covers, and the interior-page redesign onto the kit.
>
> **#6 (2026-06-14, ADR-253):** ✅ **The legacy season reward/progress engine is retired.** Daily practice
> logs no longer grant journey/co-op/season rewards (v2 rewards come solely from completing lessons/phases
> in a Run; practices still pay their own Zaps per ADR-139). The work, in five verified steps: (1) removed
> the `fireJourneyRewardsForLog` + `fireCoopRewardsForLog` firing from `lib/practices.ts` (preserving the
> Surprises/Quiet-Ones toast bonuses); (2) built the v2 progress reader `lib/journeys/progress.ts` and
> repointed every member-facing display (right rail, `/crew/journey`, member-stage signals + feed board,
> vera-dispatch, the journey-prompt cron) off the season derivation onto enrolled-Journey phase/program
> completion + next-lesson; (3) deleted the engine libs (`journey-rewards`, `journey-coop-rewards`,
> `journey-grants`, `journey-quest-clock`, `journey-coop` + tests), the season derivation/fields/patch-writers
> in `lib/journey-plans.ts`, the `setJourneyCompletionRules` action, and the `'completion-rule'` widget;
> (4) authored migration `20260624000000` dropping `season_locked` / `min_practices_per_day` /
> `target_weeks` (applies on merge); (5) regenerated `lib/database.types.ts` and switched the `runs.ts` /
> `store.ts` / journey-editor admin handles to typed. The `docs/NAMING.md` v2 pass was already ✅ done
> (ADR-252). **Remaining:** retire `journey_plan_adoptions` (deliberately kept — still referenced by
> content-signals, coop-pulse, circles/admin-actions, the prompt cron, the demo engine); plus the per-phase
> check-in links (`run_phase_events`) from #5 (needs a new table).
