# Practice Depth — build plan

> **Earn the tier you actually reach.** A practice ships with a recommended time; the member
> adjusts it on their own page, day to day; the **tier (Zaps) is earned by how long they actually
> practice**, with a live "go a little deeper" pull at every step. Every end-of-session message and
> stat reads back **exactly the practice and mode they did** (a meditation never reads as a yoga
> session). The mechanic ties into Zaps, streaks, and Amplitude with no new economy.
>
> **Decision record:** [ADR-443](DECISIONS.md). **Evolves** [ADR-442](DECISIONS.md) (creator-set
> tier → member-achieved tier for timed practices; the creator value becomes the *recommendation*
> + the quick-log fallback). **Honors** [NAMING.md](NAMING.md) (Mindless · Be Still / Get Moving;
> "Deep" is retired) and [CONTENT-VOICE.md](CONTENT-VOICE.md) (plain, no em dashes, no narrated
> feelings). **Status legend:** ✅ done · ⏳ in progress · 📋 planned · 🔴 bug to fix.

---

## 1. Locked design (from owner decisions)

- **Recommended time ships** with the practice (`practices.duration_min`); it seeds the default
  target.
- **The member adjusts the length at the timer**, day to day (the setup presets + stepper), and the
  chosen length is remembered for next time. *(Supersedes the original "pre-declared personal target
  on the practice page": the owner pivoted to "based on how much they do that day", so the depth is
  set by **actually practicing longer** — auto-continue + achieved tier — not by declaring a number
  up front. The recommended time still ships and still seeds the timer.)*
- **The tier is achieved, not declared:** for a timed practice, the Zaps come from the engaged
  minutes crossing thresholds — Light · Standard · Heavy = 8 · 12 · 15 (tunable in `zap_config`).
- **Auto-continue past target:** when the target completes the timer keeps running with a gentle
  chime at each threshold; the member banks the highest tier reached, then the **achieved length is
  remembered as tomorrow's default**, with a tooltip nudging them to match or beat it.
- **Short stop (below the Light floor):** partial credit (1 Zap) and **the streak still ticks**;
  they can finish later today to reach a tier (top-up).
- **Quick-log practices (no timer):** fixed recommended tier; no depth.
- **Streak** is unaffected by depth (showing up is showing up). **Amplitude** compounds from the
  Zaps earned. No separate currency.

---

## 2. Current system (grounding — what we build on)

| Area | Where | Note |
|---|---|---|
| Two timers under one door | `components/on-air/mindless.tsx` → `session.tsx` (Be Still) · `movement-session.tsx` (Get Moving) | Mode routed by `practices.timer_kind` (`none`/`mindless`/`movement`). |
| Session lifecycle | `session.tsx` stages `setup → live → saving → reveal` | Pre-roll 5s, 250ms tick, pause shifts `startedAt`. |
| Save/economy gate | `app/(main)/on-air/actions.ts` `completeSession()` → `lib/practices.ts` `logPractice()` | Timer-proof (server elapsed ≥ max(5s, claimed·0.5)); full ≥95% / partial 50-95% / award by `weight_class` or `reward_zaps`. |
| Reveal cards | `components/on-air/reveal.tsx` | Rewards · Streak · Stats · Dispatch from Vera. |
| Dispatch opener (mode-aware) | `lib/on-air.ts` `dispatchOpener()` / `buildSessionDispatch()` | "Nice walk." / "Good sit." etc. — already mode-accurate. |
| Mode labels | `lib/on-air.ts` (Mindless), `lib/movement.ts` (Movement) | Source of truth for member-facing labels. |
| Achieved-tier helpers | `lib/practices/tiers.ts` (ADR-442) | `TIER_ZAPS`, floors, `coerceTierZaps`; reused here. |

**Known mode-accuracy bugs to fix (your explicit concern):**
- 🔴 `reveal.tsx` Stats row hardcodes **"This sit"** even for a walk/yoga/run session.
- 🔴 Stats uses the **retired word "Deep"** ("10 to 25 Deep") — NAMING.md violation.
- 🔴 The **Vera AI fallback** dispatch never receives the activity, so on the fallback path it can't name what they did (and could read generic/wrong).

---

## 3. The achieved-tier model (server truth)

For a **timed** practice, resolve the tier from server-verified engaged seconds `E`:

| Achieved | Engaged time | Award |
|---|---|---|
| **Partial** | below the Light floor | 1 Zap, streak ticks, day banked, top-up later |
| **Light** | Light floor → < Standard | `practice_logged_light` (8) |
| **Standard** | ≥ Standard floor (5 min) | `practice_logged` (12) |
| **Heavy** | ≥ Heavy floor (15 min) | `practice_logged_heavy` (15) |

- Floors come from `lib/practices/tiers.ts` (`TIER_FLOOR_MIN`: Standard 5, Heavy 15). The **Light /
  partial floor** is the one new number — default **Light ≥ 3 min, partial < 3 min** (so "2 min
  into a 10-min sit" is a partial, matching the owner example). **Tunable**; confirm in §9.
- Award amounts stay tunable in `zap_config` via the existing `practice_logged_*` actions.
- The creator's `weight_class`/`reward_zaps` no longer caps a timed practice; it becomes the
  **recommendation** (default target) and the **quick-log fallback** tier.
- **Quick-log** (`timer_kind = 'none'`): keep the recommended tier (no time to measure).
- Anti-farm unchanged: tier is bound to timer-proofed engaged time; one log per practice per day;
  25-practices/day cap; Zaps non-spendable. The personal target can only *lower* reward risk (cap
  stays Heavy = 15).

---

## 3a. Build status (what shipped)

| Phase | Status | Notes |
|---|---|---|
| **PD0** Mode-accuracy + on-brand output | ✅ | `statSessionLabel` (mode-accurate "This sit" / "This walk"), "Deep" retired, `dispatchOpener` mode-accurate. Vera AI **fallback** activity pass-through remains a tracked follow-up (the primary dispatch is already mode-accurate). |
| **PD1** Practice header on detail page | ✅ | `header_image` renders on `/practices/[id]`. |
| **PD2** Achieved-tier resolution (server) | ✅ | `achievedTier` / `achievedTierFromMinutes` in `tiers.ts` (+ tests); `logPractice` awards `TIER_ZAPS[achievedTier]` for timed sits; partial = 1 Zap + streak + top-up. |
| **PD3** Personal adjustable target + memory | ✅ *(re-scoped)* | Superseded by achieved-tier + auto-continue (see §1). Recommended time seeds the timer; member adjusts the length at the setup stepper/presets; the actual length is persisted in `profiles.meta.onAir` for next time. **No migration.** |
| **PD4** Auto-continue + live "go deeper" cues | ✅ | Mindless sit (`session.tsx`): the clock keeps counting past target, the live screen counts up (`+M:SS`), and a live tier cue ("You're at Standard. 6 more minutes reaches Heavy.") shows the ladder. `finish()` banks the **actual** elapsed so deeper time earns the deeper tier. Movement `play` already counts up; structured movement plans keep their plan-bounded finish cap (the shared reveal nudge still applies). |
| **PD5** Reveal: tier reached + nudge | ✅ | `reveal.tsx` Stats card shows "You reached {tier}." + the minutes to the next tier (or "Top of the dial." at Heavy), for any full timed sit (Mindless **and** Movement). |
| **PD6** "Dig deeper" daily pull | ⏳ | The reveal nudge + live cue carry the daily pull. A dedicated depth-streak is still planned. |
| **PD7** Tests + verification | ⏳ | `tiers.test.ts` covers the achieved-tier thresholds; tsc/eslint clean. Per-mode live-session walkthrough still to do in preview. |

The economy + timer subsystem has unit tests only (no integration/e2e), so the behavior-changing
timer work above was kept **additive** (a new `overtime` counter + display; `finish()` banks actual
time floored at target) to avoid regressing the core countdown.

## 4. Phased build (work through top to bottom)

### Phase PD0 — Mode-accuracy + on-brand output  ·  *fix first; foundational*
*Goal: every end-of-session string/stat names the exact practice + mode, on brand. Fixes the bugs.*

| ID | Task | Files |
|---|---|---|
| PD0-1 | **One activity-label map** — `ACTIVITY_LABELS` (noun + short verb-phrase per mode: meditate→"meditation"/"sit", breathe→"breathing", journal→"journal", stillness→"stillness", ritual→"ritual", walk→"walk", run→"run", yoga→"yoga", strength→"strength", stretch→"stretch", play→"movement"). One source consumed everywhere. | `lib/activity-labels.ts` (new) or `lib/on-air.ts` |
| PD0-2 | **Pass activity through to the reveal** — add `activityType`/`activityLabel` to `RevealPayload`; compute in `completeSession` from `movementMode`/`mode`. | `lib/on-air.ts`, `app/(main)/on-air/actions.ts` |
| PD0-3 | **Fix Stats "This sit"** → activity-accurate ("This sit" / "This walk" / "This yoga") via PD0-2. | `components/on-air/reveal.tsx` |
| PD0-4 | **Retire "Deep"** — replace the "N to M Deep" label with a non-retired phrasing (e.g. "N logs · M next") per NAMING.md. | `components/on-air/reveal.tsx`, `app/(main)/on-air/actions.ts` |
| PD0-5 | **Vera dispatch gets the activity** — pass mode/activity + practice title into the AI fallback (`vera-dispatch.ts` `voiceCopy`) so it can never name the wrong thing; validate `movementMode` against `MOVEMENT_MODES`. Voice primer already enforces brand. | `lib/vera-dispatch.ts`, `app/(main)/on-air/actions.ts` |

**Done when:** a yoga session shows "yoga" everywhere, a meditation shows "meditation/sit", no
"Deep", and the Vera line always matches what was done.

### Phase PD1 — Practice header on the detail page  ·  *your first ask; standalone*
| ID | Task | Files |
|---|---|---|
| PD1-1 | Show the practice `header_image` (16:9) on the detail page, with the Pillar-gradient + icon fallback (same treatment as the catalog card). | `app/(main)/practices/[id]/page.tsx`, the detail template |

### Phase PD2 — Achieved-tier resolution (server)  ·  *the core economy change*
| ID | Task | Files |
|---|---|---|
| PD2-1 | `achievedTier(engagedSec, { timerKind })` in `lib/practices/tiers.ts` (+ tests): partial / light / standard / heavy from engaged minutes; quick-log → recommended. | `lib/practices/tiers.ts` |
| PD2-2 | Wire it into `logPractice`: timed practice award = `TIER_ZAPS[achievedTier]` via the existing `practice_logged_*` actions, replacing the fixed `weight_class` award. Keep partial = 1 Zap + streak + top-up. | `lib/practices.ts`, `app/(main)/on-air/actions.ts` |
| PD2-3 | Persist the achieved tier on the log for history/stats (derive from `zaps_awarded`/`seconds_done`, or add a small column if needed). | `lib/practices.ts` (+ migration only if a column is added) |

### Phase PD3 — Personal adjustable target + memory
| ID | Task | Files |
|---|---|---|
| PD3-1 | Store a per-member target — `member_practices.target_seconds` (migration), defaulting to the practice recommendation. | `supabase/migrations/*`, `lib/practices.ts` |
| PD3-2 | After a session, **remember the achieved length** as the new target (the ratchet). | `app/(main)/on-air/actions.ts`, `lib/practices.ts` |
| PD3-3 | Practice page + timer setup: a **Target** control pre-filled from the member target (falls back to recommended); adjustable per day; shows the tier ladder ("5 min = Standard, 15 = Heavy"). | `app/(main)/practices/[id]/page.tsx`, `components/on-air/session.tsx`, `components/practice/practice-timer-button.tsx` |

### Phase PD4 — Auto-continue + live "go deeper" cues (timer UI)
| ID | Task | Files |
|---|---|---|
| PD4-1 | **Auto-continue past target** — when the target completes, keep counting (don't force finish); chime softly at each tier threshold crossed. | `components/on-air/session.tsx` (+ `movement-session.tsx`) |
| PD4-2 | **Live tier ladder** on the running screen: "Standard reached · +12. 6 min to Heavy." Updates as thresholds pass. | `components/on-air/session.tsx`, `movement-session.tsx` |
| PD4-3 | Threshold cue plumbing in the 250ms tick (reuse the existing bell/haptic cue path). | `session.tsx` |

### Phase PD5 — Reveal: tier reached + accurate stats + nudge
| ID | Task | Files |
|---|---|---|
| PD5-1 | **Tier-reached moment** in the reveal (e.g. "You reached Heavy · +15"), mode-accurate, on brand. | `components/on-air/reveal.tsx`, `RevealPayload` |
| PD5-2 | Stats read accurate per PD0 (activity label, no "Deep"); add "you went deeper than your target" when true. | `reveal.tsx` |
| PD5-3 | **Vera dispatch nudge** — name the activity + remember: "You went 15 min today · Heavy. Match it tomorrow?" via `buildSessionDispatch` + the remembered target. | `lib/on-air.ts`, `app/(main)/on-air/actions.ts` |

### Phase PD6 — "Dig deeper" incentive (the daily pull)
| ID | Task | Files |
|---|---|---|
| PD6-1 | **Next-day tooltip** on the practice/target control: "Yesterday: 15 min · Heavy. Match it?" + a gentle "+2 min for a new best." | `app/(main)/practices/[id]/page.tsx`, setup |
| PD6-2 | **Depth streak** (consecutive days at your target / Standard+), shown as flavor on the practice + reveal. Derived from `practice_logs`; **no extra Zaps by default** (avoid economy inflation; any bonus is a later `zap_config` decision — §9). | `lib/practice-streak.ts` (or a derive helper), `reveal.tsx` |

### Phase PD7 — Tests + verification
| ID | Task |
|---|---|
| PD7-1 | Unit tests: `achievedTier` thresholds, partial floor, quick-log fallback, the remember/ratchet, label mapping (every mode → correct noun). |
| PD7-2 | Verify a real session per mode (meditate, breathe, walk, yoga) in the preview: stats + Vera read the right activity; auto-continue + tier-reached fire; partial path banks 1 Zap + streak. |

---

## 5. The timer progression — every step, and the pull to go deeper

| Step / button | State | What encourages going a little deeper |
|---|---|---|
| **Open practice → Target control** | setup | Pre-filled with *last time's* length + "Yesterday: 15 min · Heavy." The tier ladder shows the payoff ("5 = Standard, 15 = Heavy"). |
| **Start Practice / pre-roll** | setup→live | "Aiming for [X] min · [tier]. Go as long as feels right." No lock-in language. |
| **Running** | live | Live ladder: "Standard reached · +12. 6 min to Heavy." Soft chime at each threshold. |
| **Target reached** | live (auto-continue) | Gentle chime + "Target done. Keep going for Heavy?" The clock keeps running; a subtle "+min to next tier" sits under it. |
| **Pause / Resume** | live | No pressure; paused time never counts (wall-clock math). |
| **Finish** | live→reveal | Banks the **highest tier reached**; the message names the tier + the exact activity. |
| **Close & Log (early)** | live→reveal | Below Light floor → "You banked the day and earned 1 Zap. Finish any time today for the rest." Above → the achieved tier. Never shaming. |
| **Continue Practice (later)** | resume | Tops up a partial toward a real tier; same ladder. |
| **Reveal → Dispatch from Vera** | reveal | Names the activity + remembers: "You went 15 min · Heavy. Match it tomorrow?" Sets the next default + the nudge. |

The whole arc is "you already did great; one more minute is right there" — never a contract, always an invitation.

---

## 6. Mode-accurate + on-brand output (the rule)

- **One label map** (PD0-1) is the only place mode → words is defined; every surface (reveal stats,
  dispatch opener, Vera AI, notifications) reads it. A meditation never renders as yoga and vice
  versa.
- **The Vera line and any AI copy always receive** the practice title + mode + achieved tier, and
  pass through `lib/ai/voice.ts` (plain, warm, no em dashes, no narrated feelings, proper nouns
  Zaps/Amplitude/Heavy carry the magic).
- **Retire "Deep"** and any other retired term in the reveal (NAMING.md §Retired).
- **Stats name the activity** ("This walk · 18 min", "Airtime today", "Amplitude · Level 6").

---

## 7. Data + schema touches

- `member_practices.target_seconds` (PD3-1) — the member's current target; updated to the achieved
  length after each session (the ratchet). *Migration.*
- Achieved tier on the log: prefer **derived** (from `zaps_awarded` / `seconds_done`); add a column
  only if history/analytics needs it (PD2-3). *Migration only if added.*
- Depth streak: **derived** from `practice_logs` (no schema) (PD6-2).
- No change to the timer-proof, the daily cap, or the idempotency key.

---

## 8. Definition of done

A member opens a practice, sees their remembered target + the tier ladder, runs the timer, is
nudged to go a little deeper as each threshold passes, banks the tier they actually reached (or a
partial that still keeps their streak), and every message + stat + the Vera line names the exact
practice and mode they did, on brand. The achieved length carries into tomorrow with a friendly
"match it" nudge. Anti-farm guarantees are intact.

## 9. Open decisions (confirm before/along the build)

1. **Light / partial floor** — default Light ≥ 3 min, partial < 3 min. Confirm the exact minutes
   (Standard 5 / Heavy 15 already locked by ADR-442).
2. **Depth-streak bonus** — default **none** (the pull is progression + recognition). If you want a
   small bonus for sustaining depth, set the amount in `zap_config` (kept out of code).
3. **Tier proper-noun naming** — keep "Light / Standard / Heavy" member-facing, or give the depth
   ladder a warmer name (would go through NAMING.md).

## 10. Cross-links

- Reuses `lib/practices/tiers.ts` (ADR-442) for floors/amounts; ADR-443 supersedes the *timed*-
  practice tier source (achieved, not creator-set).
- Tracked in [BUILD-SEQUENCE](BUILD-SEQUENCE.md) Idea Inbox; IDEA-003 (other game-value setters)
  remains separate.

---

*Owner: Daniel (Vision Steward). Created 2026-06-29. Build plan; execute phase by phase.*
