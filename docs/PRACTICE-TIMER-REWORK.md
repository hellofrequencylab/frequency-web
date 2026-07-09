# Practice ⇄ Timer rework — build plan

> **Every practice carries its own timer, preset by the creator.** The one member-facing
> timer (**Mindless**, internal **On Air**, `/on-air`; modes **Be Still** / **Get Moving**)
> is already practice-linked through `practices.timer_kind`. This rework closes the
> **authoring** gaps (a creator-set warm-up + message, and a full workout preset that ships
> ready to run), reworks the **launch affordance** (a timed practice says **Start Practice**
> with a timer icon; a logged one shows a check-off), and adds three deeper integrations
> (timer preview on cards, Journey/Run choreography, and sequenced practices).
>
> **Decision record:** [ADR-592](DECISIONS.md). **Sits beside** [PRACTICE-DEPTH-BUILD.md](PRACTICE-DEPTH-BUILD.md)
> (ADR-442/443, achieved-tier depth) — the depth model owns *how long earns what*; this plan
> owns *what the creator presets and what the member sees at launch*. **Honors**
> [NAMING.md](NAMING.md) (Mindless · Be Still / Get Moving; "Workout" is retired member-side)
> and [CONTENT-VOICE.md](CONTENT-VOICE.md) (plain, warm, no em dashes, no narrated feelings).
> **Status legend:** ✅ done · ⏳ in progress · 📋 planned · 🔴 bug to fix.

---

## 1. Locked design (from owner decisions, 2026-07-09)

- **Warm-up model: extend the pre-roll.** The creator's message + length ride on top of the
  existing 3/5/10s pre-roll countdown (one unified warm-up moment), not a separate intro card.
  The member's personal pre-roll length still applies when the creator sets none.
- **Workout authoring: full custom.** The creator composes the exact session in the builder
  (preset chips + Work/Rest/Rounds steppers, every Get Moving mode), stored in
  `movement_config`, so the timer opens preset and ready. No migration (the fields exist).
- **All three extra integrations are in scope**: timer preview on cards, Journey/Run
  choreography, and sequenced practices.
- **The launch affordance splits by `timer_kind`**: timed (≠ `none`) → **Start Practice** +
  timer icon; logged (`none`) → a **check-off** ("Log it").

---

## 2. Current system (grounding — what we build on)

| Area | Where | Note |
|---|---|---|
| One timer, two modes | `components/on-air/session.tsx` (Be Still) · `movement-session.tsx` (Get Moving), routed by `mindless.tsx` | Mode auto-selects from `practices.timer_kind` (`none`/`mindless`/`movement`). |
| Practice → timer link | `practices.timer_kind` + `mindless_mode` + `movement_config` jsonb + `duration_min` + `duration_locked` | First-class; `uses_timer` is a generated mirror `= timer_kind <> 'none'`. |
| Creator authoring | `components/studio/practice/practice-builder.tsx` | Sets `duration_min`, `timer_kind`, and the movement **mode only** (not the full preset). |
| Workout preset fields | `lib/movement.ts` `MovementConfig` (`strengthKind`/`workSec`/`restSec`/`rounds`); `buildPlan()` reads them | Schema ready; the builder writes only `{ mode }` today. Member tunes at start (`movement-session.tsx`). |
| Warm-up (pre-roll) | member pref `warmupSec` (3/5/10, `lib/on-air.ts` `WARMUP_PRESETS`); rendered in `session.tsx` pre-roll | Member-only, no message. |
| Launch affordance | `components/practice/practice-timer-button.tsx` (timed) · `log-practice-button.tsx` (logged) | Timed reads "Practice"; no Start-vs-check split. Timer-gate (`lib/practices.ts`) refuses one-tap on timed practices. |
| Completion economy | `app/(main)/on-air/actions.ts` `completeSession()` → `lib/practices.ts` `logPractice()` | Single write path; timer-proof + partial/full + achieved-tier (ADR-443). |
| Journey attachment | `journey_plan_items` (FK `practice_id`, `settings` jsonb) | `settings` already holds the Anchor flag — the home for a per-step timer override. |

**Two-engine caveat:** `session.tsx` (1,939 lines) and `movement-session.tsx` duplicate the
clock / pre-roll / persistence logic. Phases that touch the running timer (**P3, P6**) must
touch **both**. This is why the engine rework (P6) is fenced off last.

---

## 3. Phased build (top to bottom; cheap + isolated first)

| # | Phase | Ships | Schema | Risk | Status |
|---|---|---|---|---|---|
| **P0** | Foundation | Warm-up migration; ADR-592; this doc; type foundation. | 1 migration | 🟢 | ✅ |
| **P1** | Affordance rework | Timed → **Start Practice** + timer icon; logged → **check-off**. | none | 🟢 | ✅ |
| **P2** | Full workout authoring | Preset chips + Work/Rest/Rounds steppers (all modes) in the builder → full `movement_config`, seeded into the launched session. + time-ladder polish + server sanitize. | none | 🟡 | ✅ |
| **P3** | Creator warm-up + message | Builder warm-up block; render inside the pre-roll (both engines). | uses P0 | 🟡 | ✅ |
| **P4** | Timer preview on cards | Shape string from `movement_config` + `buildPlan()` on card + detail. | none | 🟢 | 📋 |
| **P5** | Journey / Run choreography | Per-step **warm-up message** override at `journey_plan_items.settings` (merge-safe). Timer-shape override deferred. | none | 🟡 | ✅ |
| **P6** | Sequenced practices | Chain timed practices into one continuous run, auto-advance; each leg logs its own practice. Entry: a Journey module's "Start all as one session". | none (provider-orchestrated) | 🔴 | ✅ |

### Phase P0 — Foundation · *this phase*
*Goal: the schema + records the rest of the plan builds on. No member-visible change.*

| ID | Task | Files |
|---|---|---|
| P0-1 | **Warm-up columns** — `practices.warmup_message text` + `warmup_sec int`, both nullable/additive (null/empty = today's silent pre-roll; null `warmup_sec` = member's personal length). | `supabase/migrations/20261024000000_practice_warmup.sql` |
| P0-2 | **Type foundation** — add `warmup_message` / `warmup_sec` to the `Practice` interface + `PRACTICE_COLS`; exclude from `RANKED_COLS` (like the other timer columns — the library reads them from the base table via `getPractice`). | `lib/practices.ts` |
| P0-3 | **ADR + plan doc** — record the decision (ADR-592) and this phased plan. | `docs/DECISIONS.md`, `docs/PRACTICE-TIMER-REWORK.md` |
| P0-4 | **Regenerate `lib/database.types.ts`** after the migration applies (integrator step; until then the untyped admin handle reaches the new columns, per ADR-246). | `lib/database.types.ts` |

**Done when:** the migration + types compile, `PRACTICE_COLS` reads the new columns, the
ranked view still resolves (columns excluded), and the plan + ADR are committed.

### Phase P1 — Affordance rework · *fast, visible; ship first*
| ID | Task | Files |
|---|---|---|
| P1-1 | Timed practice launch reads **"Start Practice"** + a timer icon (keep "Continue Practice" on resume). | `components/practice/practice-timer-button.tsx` |
| P1-2 | Logged practice (`timer_kind = 'none'`) reads a **check-off** ("Log it" + check icon). | `components/practice/log-practice-button.tsx` |
| P1-3 | Propagate the split to every surface that renders these (practice detail, library/mine cards, circle row, Journey lesson step). | `app/(main)/practices/[id]/page.tsx`, `components/widgets/practices/*`, `components/journey/v2/learn/practice-actions.tsx` |

### Phase P2 — Full workout authoring · *the creator-power core*
| ID | Task | Files |
|---|---|---|
| P2-1 | Lift the member Strength setup (preset chips + Work / Rest / Rounds steppers) into the builder's Movement section; extend to Walk/Run/Yoga/Stretch tuning. Persist the full `MovementConfig`. | `components/studio/practice/practice-builder.tsx`, `lib/movement.ts` |
| P2-2 | Ensure `updatePracticeAction` / `createPractice` accept + store the full `movement_config` (not just `{ mode }`). | `app/(main)/practices/actions.ts`, `lib/practices.ts` |
| P2-3 | Time-ladder polish (your Ask A): show the tier ladder ("5 min = Standard, 15 = Heavy") beside the length control. | `components/studio/practice/practice-builder.tsx` |
| P2-4 | Confirm the launcher opens the stored preset directly (it already passes `movement_config` through; verify no forced setup step). | `components/practice/practice-timer-button.tsx`, `components/on-air/movement.tsx` |

### Phase P3 — Creator warm-up + message · *uses P0*
| ID | Task | Files |
|---|---|---|
| P3-1 | Builder **warm-up block**: length picker + a short message field (≤140, voice-checked; a Vera-draft affordance via `lib/ai/voice.ts`). | `components/studio/practice/practice-builder.tsx` |
| P3-2 | Render the message inside the **existing** pre-roll countdown; seed the length from `warmup_sec` (member `warmupSec` overrides when the creator set none). **Both engines.** | `components/on-air/session.tsx`, `components/on-air/movement-session.tsx`, `lib/on-air.ts` |
| P3-3 | Clamp + sanitize `warmup_sec` / `warmup_message` in app code (band + length + voice). | `lib/practices.ts` or `lib/on-air.ts` |

### Phase P4 — Timer preview on cards
| ID | Task | Files |
|---|---|---|
| P4-1 | A pure `timerPreview(practice)` helper → "Get Moving · Tabata · 20/10 · ×8 · ~8 min" (or "Be Still · 10 min", "Log it") from `timer_kind` + `movement_config` + `buildPlan()`. | `lib/movement.ts` or `lib/practices.ts` |
| P4-2 | Render on the practice card + detail (read-only; needs the base-table `movement_config`, so on cards it comes via `getPractice`, not the ranked view). | `components/widgets/practices/*`, `app/(main)/practices/[id]/page.tsx` |

### Phase P5 — Journey / Run choreography
| ID | Task | Files |
|---|---|---|
| P5-1 | Per-step override authored on `journey_plan_items.settings` (jsonb; alongside the Anchor flag) — warm-up message + timer shape. **No migration.** | Journey step editor, `lib/journeys*` |
| P5-2 | At launch from a Journey/Run step, merge the step override over the practice defaults. | `components/journey/v2/learn/practice-actions.tsx`, the timer launchers |

### Phase P6 — Sequenced practices ("a session") · *engine rework, isolated last*
| ID | Task | Files |
|---|---|---|
| P6-1 | A **run queue** (ordered practice ids) carried in `practice_timer_sessions.setup`; the launcher can open a sequence, not just one practice. | `app/(main)/on-air/timer-session-actions.ts`, `components/on-air/mindless.tsx` |
| P6-2 | Auto-advance: on a leg finishing, log THAT practice through `completeSession` → `logPractice` (unchanged economy per leg), then roll into the next leg's warm-up. | `components/on-air/session.tsx`, `movement-session.tsx`, `app/(main)/on-air/actions.ts` |
| P6-3 | Reconcile resume/crash-recovery (3-layer persistence) + the daily-log idempotency across a multi-practice run. | `lib/on-air/live-session.ts`, `lib/on-air/active-session.ts` |

---

## 4. Data + schema touches

- **`practices.warmup_message` + `warmup_sec`** (P0) — the only migration. Nullable/additive.
- **Workout preset** (P2) — reuses `practices.movement_config` jsonb (`strengthKind` / `workSec`
  / `restSec` / `rounds` already read by `buildPlan()`). **No migration.**
- **Card preview** (P4) — derived; no schema.
- **Journey/Run override** (P5) — `journey_plan_items.settings` jsonb. **No migration.**
- **Sequenced run** (P6) — the queue lives in the existing `practice_timer_sessions.setup`
  jsonb; no new table (compose Practices rather than model exercises/sets).
- Regenerate `lib/database.types.ts` after P0 applies; until then the untyped admin handle
  reaches the new columns (ADR-246).

---

## 5. Naming + voice

- Member copy stays **Mindless · Be Still / Get Moving · Strength · Start Practice**. Never
  surface **"Workout"** as a member noun (retired, ADR-360) — it is the internal Strength mode.
- **Warm-up term is an OPEN QUESTION** (§6): "warm-up" is not in the locked NAMING canon. It is
  used today as an internal pre-roll label; a member-facing warm-up *noun* needs owner sign-off +
  a NAMING.md entry before P3 copy ships. Until then, keep to the existing "Warm up" pre-roll label.
- All warm-up + preview copy (incl. any Vera-drafted message) passes `lib/ai/voice.ts` and the
  CONTENT-VOICE §10 checklist: plain, warm, no em dashes, no narrated feelings, skeptic test.

---

## 6. Open decisions (confirm along the build)

1. **Warm-up member-facing name** — keep the plain "Warm up" pre-roll label, or give the
   creator-authored warm-up a proper noun (would go through NAMING.md). *Owner call.*
2. **`warmup_sec` band** — the member pre-roll is 3/5/10s; a creator message may want longer to
   read. Confirm the allowed band (default: allow up to ~60s for authored warm-ups, clamp in code).
3. **Sequenced run rewards (P6)** — each leg logs its own practice (one Zap per leg, existing
   caps). Confirm no bonus for completing a full sequence (keeps the "timer is a stage, not a
   second economy" invariant).

---

## 7. Cross-links

- Depth model: [PRACTICE-DEPTH-BUILD.md](PRACTICE-DEPTH-BUILD.md) (ADR-442/443) — achieved-tier
  Zaps; this plan defers all "how long earns what" to it.
- Timer internals: [ON-AIR.md](ON-AIR.md) (ADR-229) · naming: [NAMING.md](NAMING.md) (ADR-360).
- Schema: [DATABASE.md](DATABASE.md) (practices timer columns).

---

*Owner: Daniel (Vision Steward). Created 2026-07-09. Build plan; execute phase by phase.*
