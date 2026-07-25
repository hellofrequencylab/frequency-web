# Practice ⇄ Timer — continuity bug-fix + redesign plan (2026-07-25)

> A focused bug-hunt + redesign pass over the practice-timer system, from the owner's report
> (double countdown, editable timers, free-practice fallback, Just Log = a note, seamless smart
> authoring) plus a full continuity sweep. Builds on **[PRACTICE-TIMER-REWORK.md](PRACTICE-TIMER-REWORK.md)**
> (ADR-592, P0–P7 shipped) and **[PRACTICE-DEPTH-BUILD.md](PRACTICE-DEPTH-BUILD.md)** (ADR-442/443).
>
> **Status legend:** ✅ done · ⏳ in progress · 📋 planned · 🔴 confirmed bug · 🧩 design-gap · 🧑 owner call.
> **Voice:** all member copy passes CONTENT-VOICE §10 (plain, warm, no em dashes, no narrated feelings).

---

## 0. Headline

The timer **save path is sound** — every builder control persists and reloads (full wiring map in §5).
The bugs live in the **runtime reads and launch routing**, and the redesign is about collapsing two
overlapping "get ready" moments into one and making Just Log a note, not a timer.

| # | Item | Kind | Where | State |
|---|---|---|---|---|
| 1 | Double countdown on ALL Get Moving modes (Walk/Run/Yoga/Stretch/Strength) | 🔴 bug | `lib/movement.ts` + `movement-session.tsx` | 📋 P1 (owner call on approach) |
| 2 | Authored "Just Log" never opens the Just Log screen (routes to Meditate) | 🔴 bug | `session.tsx:341` + `lib/practices.ts:1486` | 📋 P2 |
| 3 | `'none'` practice opens Meditate + logs the WRONG practice on feed/journey/prompt | 🔴 bug | `log-practice-button.tsx` call sites | ✅ FIXED this pass |
| 4 | Get Moving free/unattached timer ignores the last-known config | 🧩 gap | `movement-session.tsx` + `session-data.ts:224` | 📋 P3 |
| 5 | Breath pattern / bell / ambient not authorable from the practice | 🧩 gap | `practice-builder.tsx` + `PRACTICE_COLS` | 📋 P4 (🧑) |
| 6 | Lead-in inflates elapsed vs target; `timerPreview` counts it | 🟡 minor | `lib/movement.ts` | folds into P1 |
| 7 | Just Log one-tap path captures no note | 🧩 gap | `log-practice-button.tsx:130` | 📋 P2 |

---

## 1. 🔴 P1 — The double countdown (owner bug #1)

### Root cause (confirmed, all modes)
A Get Moving launch plays **two** "get ready" countdowns back to back:

1. **Unified pre-roll "Warm up" ring** — `movement-session.tsx:790`
   `setPreroll(resolveWarmupSec(practice?.warmupSec, warmupSec))`, member default **5s**, move-accent
   styling, label "Warm up" (the ADR-592 P3 warm-up moment; carries the creator's warm-up message).
2. **A `PREPARE` lead-in phase** prepended by **every** builder — `lib/movement.ts:186` walk `'Get going'`,
   `:200` run, `:213` yoga `'Find your mat'`, `:235` stretch `'Settle in'`, `:267` strength `'Get ready'`,
   `PREPARE_SECONDS = 3` (`:78`). On `begin()` the clock runs `phaseAt(plan, 0)` → lands in this phase →
   a **second** 3s countdown in the prepare-phase styling.

So the member sees **5s "Warm up" → 3s "Get ready/going" → the work block**. That is the reported
"5 seconds then another 3 seconds in another color." It hits Walk, Run, Yoga, Stretch and Strength; only
**Play** escapes (no lead-in). **Be Still does NOT double up** — `session.tsx:1414` already treats the
pre-roll as the one countdown (ADR-566: "the pre-roll IS the big timer"). The two engines have drifted.

Side effects (fold into the fix): the 3s lead-in also inflates logged elapsed vs `duration_min` target
(`actions.ts` measures `secondsDone` against `duration_min*60`), and `timerPreview` (`movement.ts:408`)
adds the 3s to card previews.

### The fix — two options (🧑 owner call)
The lead-in is **intentional and unit-tested** (15+ assertions in `lib/movement.test.ts`), so this is a
design reconciliation, not a one-liner. Both options land ONE countdown.

- **Option A (recommended) — drop the `PREPARE` lead-in from the movement plans.** The pre-roll warm-up
  (member-tunable 3/5/10, carries the creator message) becomes the single count, making Get Moving
  symmetric with Be Still. `phaseAt`/`totalSeconds` already handle a lead-in-less plan
  (`movement.ts:447` `hasLeadIn` falls back to looping the whole array), so the engine change is small;
  the cost is rewriting the `movement.test.ts` lead-in assertions + `timerPreview` expectations, and a
  manual QA pass of the running timer (resume, Strength rounds, the 3-2-1 audio — the pre-roll's
  per-second buzz already covers the count-in). Also removes the elapsed-vs-target inflation (item #6).
- **Option B — keep the lead-in, suppress the separate pre-roll ring on movement** (render the creator
  warm-up message on the `PREPARE` phase instead). Keeps the plan model + tests intact, but the member's
  personal warm-up-length pref no longer applies to Get Moving, and the two engines stay asymmetric.

**Recommendation: Option A** for engine symmetry + the accounting fix. Ship it as its own PR with the
test rewrite and a live manual-QA checklist (Walk, Strength multi-round, resume-after-reload, Journey-step
launch). *Not* auto-shipped in this pass because it edits the fenced live-timer engine (REWORK §2
two-engine caveat) and rewrites a tested model.

---

## 2. 🔴 P2 — "Just Log" should be a note, not a timer (owner bug #4)

### Current behavior (broken, two ways)
- `session.tsx:341 modeForPractice`: a `'none'` practice returns `findFreeSit ? 'timer' : 'log'`, but the
  loader **always** appends a Free-Practice sit (`session-data.ts:193`), so `findFreeSit` is never empty →
  it resolves **'timer' (Meditate)**, never 'log'.
- Same function: a `mindless` practice with `mindless_mode='log'` is explicitly rewritten `'log' → 'timer'`
  (`:353`), so a creator's Be Still → "Just Log" also opens **Meditate with a countdown**.
- `lib/practices.ts:1486`: `updatePractice` nulls `mindless_mode` whenever `timer_kind ≠ 'mindless'`, so a
  `timer_kind='none'` practice **cannot carry** `mindless_mode='log'` — the data model can't even express
  "this log-only practice wants the note screen."

### The redesign
- Decide the single authoring shape for "Just Log": **`timer_kind='none'` = the note-capture screen**
  (drop the parallel `mindless_mode='log'` route, or make `'none'` imply it). One source of truth.
- `modeForPractice` returns `'log'` for a `'none'` practice regardless of whether a Free-Practice sit
  exists (the Free sit is the *unattached* entry, not the authored-practice entry).
- The Just Log screen: **no timer, no countdown** — a title, a short note/journal field
  (≤ the existing `cleanSessionNote` bound), and one "Log it" action. The note plumbing already works
  (`session.tsx:1183 → completeSession → actions.ts:136 cleanSessionNote → practice_sessions.note`); only
  the auto-routing is missing.
- The plain one-tap `logPracticeAction` path (`log-practice-button.tsx:130`) captures **no note** (item #7).
  Decide whether the note-capture screen replaces one-tap for `'none'` everywhere, or one-tap stays for
  quick rows and the note screen is the "open" affordance. Recommended: `'none'` → note screen when opened
  from a detail/prompt surface; the tight row keeps a fast one-tap.

---

## 3. ✅ P0 (shipped this pass) — stop the `'none'` mislog (owner requirement, bug #3)

`LogPracticeButton` treated `isTimer = timerKind != null`, so surfaces passing `timer_kind` raw
(`practice-prompt.tsx:177,197`, `feed/journey-board.tsx:272,293`, `practices-mine.tsx:76`) opened the
Meditate/Free-Practice sit for a **log-only** practice and logged the **wrong** practice. Hardened the guard
centrally: `isTimer = timerKind != null && timerKind !== 'none'` so no call site can miswire it. `'none'`
now one-taps "Log it" everywhere (matching `practice-row-actions.tsx:103`). This is the safe interim; P2
upgrades `'none'` from one-tap to note-capture.

---

## 4. 🧩 P3 — Get Moving free-practice memory (owner bug #3, movement side)

Be Still already restores the last free config (`session.tsx:359 readSavedSetup` ←
`localStorage['fq_mindless_setup']`). Get Moving does not: the synthetic Free-Practice hardcodes
`{ mode: 'walk' }` (`session-data.ts:224`) and `movement-session.tsx` has no `readSavedSetup` equivalent,
and `completeSession` never persists the `MovementConfig` (it stores the sit `SessionMode`, not the movement
shape). So a bare Get Moving open always lands on Walk/20-min.

**Build:** persist the last movement config (localStorage `fq_movement_setup`, mirroring the sit) written on
`begin()`/complete, and seed the Free-Practice movement session from it; keep Walk/20 as the first-run
default. No migration.

---

## 5. Edit-experience wiring map + the seamless vision (owner bugs #2, #5)

**Every builder control already persists and reloads** (seeded at `practice-builder.tsx:143-157`; saved via
`updatePractice`), so #2 ("all timer functions editable from the practice") is mostly **already true** — the
gap is one un-authorable set (breath pattern) and the runtime reads above.

| Builder control | Column | Persist | Timer reads it |
|---|---|---|---|
| How it's done (`timerKind`) | `timer_kind` | ✅ `practices.ts:1480` | ✅ routes engine |
| Movement mode + full preset | `movement_config` | ✅ sanitized `:1488` | ✅ `buildPlan` |
| Be Still mode | `mindless_mode` | ✅ `:1494` | ⚠️ `'log'` coerced to Meditate (P2) |
| Warm-up message | `warmup_message` | ✅ `:1505` | ✅ both engines |
| Warm-up length | `warmup_sec` | ✅ `:1506` | ✅ `resolveWarmupSec` |
| Time / lock | `duration_min` / `duration_locked` | ✅ | ✅ |
| Breath pattern / bell / ambient | — none — | 🧩 member-pref only | member-only |

### 🧩 P4 (🧑) — authorable breath pattern + cues
Today a creator can pick "Breathe" but not *which* pattern (Box / 4-7-8 / …), bell, or ambient — those live
only in member prefs (`OnAirPrefs`). To fully honor "all timer functions editable from the practice," add
`mindless_config jsonb` (pattern, bell, ambient, interval) on `practices`, author it in the Be Still section
of the builder, and read it as the session seed (member pref as the fallback). Needs a migration + an owner
call on how far the "creator's own custom timer" should override the member's personal cue prefs.

### The seamless-edit north star (owner #5)
One builder surface where picking **How it's done** reveals exactly the controls for that timer (Be Still →
mode + pattern + cues + warm-up; Get Moving → mode + full preset + warm-up; Just Log → note prompt only), a
**live preview** of the member's launch (the same `timerPreview` string + a "what the member sees" mini
run), and everything the creator sets round-trips into the member session verbatim. P1–P4 are the wiring
prerequisites; the preview + progressive-disclosure polish is P5.

---

## 6. Continuity notes (owner #6)

Mostly clean: no orphaned `MovementConfig` fields (every field the builder writes is read by `buildPlan` +
re-sanitized server-side), legacy `workout→strength` mapping is consistent across `buildPlan` /
`sanitizeMovementConfig` / `resolveDefaultMode`, and the ranked-view timer-column exclusion matches the
loader reading them from the base table. The only continuity debts are the elapsed-vs-target lead-in
inflation (fixed by P1-A) and the two-engine pre-roll/persistence asymmetry (Be Still has free-config memory
+ a warm-up-skip param on top-ups; Get Moving has neither — P3 + the P1 engine pass).

---

## 7. Phase order + sign-off

| Phase | Scope | Risk | Sign-off |
|---|---|---|---|
| **P0** | ✅ `'none'` mislog guard (this pass) | 🟢 | ✅ shipped, lint/tsc green |
| **P1** | Double countdown — Option A (drop lead-in) + test rewrite + manual QA | 🔴 high (live engine) | one countdown on all modes; movement tests + timerPreview updated; resume/Strength QA'd |
| **P2** | Just Log = note screen; one authoring shape; `'none'` carries the note intent | 🟡 med | authored Just Log opens note-capture, logs with note; no Meditate route |
| **P3** | Get Moving free-config memory | 🟢 low | bare Get Moving reopens last mode/preset |
| **P4** | Authorable breath pattern + cues (🧑 migration) | 🟡 med | creator sets pattern/bell/ambient; member-pref fallback |
| **P5** | Seamless builder: progressive disclosure + live launch preview | 🟢 low | one edit surface, live preview, verbatim round-trip |

Execution: P0 ✅ → P1 (own PR, owner picks A/B) → P2 → P3 → P4 (owner sign-off on the migration) → P5.
P1 is fenced as its own manually-QA'd PR because it edits the running timer (REWORK §2).

---

*Owner: Daniel (Vision Steward). Created 2026-07-25 from the meta-scan timer sweep. Execute phase by phase.*
