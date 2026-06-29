# On Air: the practice timer mini-app (member-facing: **Mindless**)

> Status: **P1 to P17 shipped** (ADR-229; desktop intercepted-modal entry deferred, see Roadmap). **Unified into one timer with two modes (ADR-360, see "The unified timer" below); select-not-start setup + auto-resume from a partial + crash-safe recovery shipped (P15); design alignment + Get Moving teal/blue recolor shipped (P16).** Canon names: NAMING.md §The Quest ("On Air" =
> internal name; member-facing the app is **Mindless**, verb **"tune out"**, modes **Be Still** / **Get Moving**, tagline **"Get out of your head, and into your life."**; "Airtime", "Dispatch from Vera"). Member help: `content/help/the-quest/on-air.md`.

One tap → the world goes quiet → you breathe (or you move) → the game pays you in
person → Vera hands you tomorrow's thread. A little app inside The Quest, and the
intended daily anchor for WAM. There is now **one** member-facing timer, Mindless,
with two modes (**Be Still** / **Get Moving**); the former separate Movement timer
is folded in as the Get Moving mode (ADR-360).

## The unified timer: one Mindless, two modes (ADR-360)

There is **one** member-facing practice timer, **Mindless**, tagline **"Get out
of your head, and into your life."** It carries two modes the member toggles
between:

| Mode | What it is | Sub-modes |
|---|---|---|
| **Be Still** | the quiet sit (the former Mindless sit) | Meditate · Breathe · Stillness · Ritual · Journal · Just Log |
| **Get Moving** | the moving timer (the former Movement timer) | Walk · Run · Yoga · Strength · Stretch · Play |

Mode labels are EXACTLY `Be Still` and `Get Moving`. **"Movement" is no longer a
separate member-facing timer name**; it is the Get Moving mode (NAMING.md Retired,
ADR-360). "On Air" stays the internal name (this doc, routes, schema, `timer_kind`).

- **Two engines, one door.** Nothing about the two timer engines changes. Be Still
  reuses the breath/quiet engine (`lib/on-air.ts`, the breath patterns below); Get
  Moving reuses the Movement interval engine (`lib/movement.ts`, ADR-346). They are
  reused under one door, not rebuilt.
- **Auto-route by `timer_kind`.** Launching from a practice auto-selects the mode
  from the practice's `timer_kind`: `mindless` → **Be Still** · `movement` → **Get
  Moving** · `none` → **Be Still** (defaulting to Just Log). A generic open (the
  Free sit / a non-specific entry) lands on **Be Still** and **remembers the last
  mode** used. (Generic opens stay neutral per ADR-354; only a practice-specific
  entry pre-selects a practice and its mode.)
- **Crossover is INTERNAL; one reward per session.** A practice may develop more
  than one Pillar through the existing `focus_details` map (e.g. breathwork = Body
  + Spirit, yoga = Body + Spirit). This is **never surfaced as a visible rubric**,
  and there is exactly **one Zap reward per session**: a session ends through the
  same `completeSession` → `logPractice()` path either mode shares, and nothing
  else pays. **The invariant holds: On Air is a stage, never a second economy**
  (see below). Multi-Pillar crossover is scoring metadata, not a member-facing
  scoreboard, and it never multiplies the payout.

**Why one timer (rationale).** One door = one daily anchor, one streak, one
identity, the lowest friction, which is what habit formation wants. A single plain
timer also fits the skeptical, anti-precious demographic (CONTENT-VOICE §2) far
better than a two-timer taxonomy with a visible crossover-scoring rubric. The
two-name split (Mindless vs Movement) added a taxonomy the member had to learn
before doing the thing; one timer with a mode toggle removes that.

## Why it's built this way (research)

- **The reveal is the retention engine, not the timer.** Duolingo stages the streak
  increment *inside* the lesson flow. The state change is the session's payoff.
  On Air does the same: the streak ticks over on a full screen you swipe through,
  never a badge discovered later.
- **Insight Timer beats Calm/Headspace ~2× on D30 retention** on the strength of a
  *customizable ritual* (your duration, your pattern, remembered setup), radical
  stats transparency, and a sub-5-minute no-guilt floor. We copy the ritual, not
  the content library.
- **Variable reward at completion** (Duolingo's chest): already live. Surprises
  (ADR-210) ride `logPractice` and surface in the reveal's bonus cascade for free.
- **Honest distraction-blocking:** a web app cannot suppress OS notifications
  (Opal/one sec use OS Screen Time APIs). The truthful web version is Wake Lock +
  Fullscreen (+ PWA standalone, P3): screen stays lit, chrome disappears.

## The loop

```
ENTER (1 tap)            SESSION                     THE REVEAL (swipe →)
feed JourneyBoard ⚡  →   fullscreen 'On Air'    →    ① Rewards   zaps + bonus cascade + surprise
practice page button      wake lock · visualizer      ② Streak    N-1 → N, milestone bar, freezes
/on-air direct            quiet End, no shame         ③ Stats     airtime + depth + Amplitude
                                                      ④ Dispatch  Vera's next assignment
```

## Architecture (P1)

| Piece | Where | Notes |
|---|---|---|
| Route | `app/(main)/on-air/` | Focus surface; `'/on-air'` registered `'none'` in `lib/layout/page-chrome.ts` |
| Session machine | `components/on-air/session.tsx` | setup → live → saving → reveal; wake lock + mobile fullscreen, re-acquired on visibility. The setup **selects** a practice (it does not auto-start); the primary button starts it |
| Get Moving engine | `components/on-air/movement-session.tsx` | the interval engine under the same door (`lib/movement.ts`); same crash-resume + partial-resume wiring as Be Still |
| Crash-safe persistence | `lib/on-air/live-session.ts` (+ tests) | a running sit/run is mirrored to `localStorage` (start/pause/resume + 30s heartbeat); a reload offers a Resume prompt. See "Crash-safe persistence" below |
| Visualizer | `components/on-air/visualizer.tsx` | RippleRings motif breathing; rAF writes transforms via refs (no React frame-rate renders); reduced-motion → opacity fade |
| Breath math | `lib/on-air.ts` (+ tests) | Box 4-4-4-4 · 3X (physiological sigh, 4-1-7) · 4-7-8; `breathPositionAt` / `ringScaleAt` pure, per-phase scale ranges for stacked breaths |
| Completion | `app/(main)/on-air/actions.ts` | ONE action: insert `practice_sessions` → **`logPractice()` (the only economy entry: same idempotency, zaps, bonuses, streaks)** → gather reveal payload → Dispatch |
| Reveal | `components/on-air/reveal.tsx` | 4 scroll-snap panels; bonus cascade staged 550ms apart; type-on Dispatch card |
| Dispatch engine | `lib/vera-dispatch.ts` | See below |
| Data | `supabase/migrations/20260615000000_on_air.sql` | `practice_sessions` (mode/pattern/seconds: airtime + history) + `vera_dispatches` (one per member/day, cached); RLS read-own |
| Prefs | `profiles.meta.onAir` | last mode/pattern/minutes (zero-config repeat) + `onAirTotalSeconds` (lifetime airtime counter; hosted PostgREST has aggregates off, sessions table can recompute) |

**Invariant: On Air is a stage, never a second economy.** A session that ends calls
`logPractice()` and nothing else pays. A practice already logged today still records
a session (airtime). The reveal shows "already counted" honestly, streak intact.

## Entry, selection, and resume (the final flow)

The setup **selects** a practice; it does not auto-start. Across every entry path
(Zap menu chooser, a "Continue Practice" button, an auto-selected lone practice, a
`/on-air?practice` link, a Journey **Practice** button), the timer lands on the
setup with the practice pre-selected and the mode + minutes seeded, then waits for
the member to tap the primary button.

- **Primary button label.** `Start Practice` normally; **`Continue Practice`** when
  the selected practice has a resumable partial today (Just Log keeps `Log it`). The
  setup also surfaces the remaining time on a partial ("N min left. Continue Practice
  picks up where you stopped."), and Get Moving shows the same as "Continue Practice,
  N min left." The chooser is re-opened from a **Change** affordance; with one or zero
  practices nothing renders (auto-selected, ADR-306).
- **Auto-resume from the SELECTED practice's `partialToday`.** Resume is no longer
  gated to an explicit resume link. `lib/on-air/session-data.ts` attaches each
  practice's `partialToday` (`{ bankedSec, targetSec }`), and the engines recompute
  the resume from whichever practice is selected. So a Zap-menu pick, the Continue
  Practice button, and an auto-select all resume the same way: the timer runs only
  the **remaining** time and banks only the rest. Switching to a non-partial practice
  abandons the in-flight resume. The partial is the completion-economy partial (ADR-353):
  a started, banked-but-unfinished log today (`completed = false`, banked seconds with a
  larger target ahead). `getPracticeMemberState` (detail surfaces) and `getPartialMapToday`
  (index surfaces) both derive it through one `partialFromLogRow` helper in `lib/practices.ts`.
- **The "Continue Practice" affordance.** A practice with a partial today reads
  **Continue Practice** wherever a Log/Practice button appears (practice pages, the
  JourneyBoard, the learn player, the "Your practices" rows, the Zap-menu chooser):
  `components/practice/log-practice-button.tsx`, `practice-timer-button.tsx`,
  `practice-row-actions.tsx`, `practice-prompt.tsx`, `components/feed/journey-board.tsx`,
  `components/journey/v2/learn/practice-actions.tsx`. It resumes the remaining time, then
  tops the partial up to complete and pays the rest of the Zaps (ADR-353's "Finish
  Practice" top-up; the member-facing label is now "Continue Practice").
- **Countdown rule.** Get Moving has **no** pre-roll countdown; Be Still keeps the
  5-second "Starting in N" pre-roll on its sit modes (P14), with **Start** overriding
  it to begin now. Just Log is an instant log (no live screen, no countdown).

## Crash-safe persistence (recover a dropped sit/run)

Both engines hold their running state (startedAt, pausedAt, mode/config) in React
memory only. Mobile browsers freeze a backgrounded tab and then **discard** it to
reclaim RAM; on reopen the page reloads and a naive timer resets to setup, losing the
sit. The fix (`lib/on-air/live-session.ts`): mirror a tiny record to `localStorage` on
start / pause / resume plus a 30s heartbeat, so a reload **detects** an in-progress run
and offers a **Resume** prompt that restores the exact elapsed.

- The clock is wall-clock based (`Date.now() - startedAt`, pause-adjusted), so the
  exact elapsed is recovered from the saved `startedAt` — no time is lost to the freeze.
- A per-surface `setup` payload rebuilds the mode + config on resume; a `resumeFromSec`
  field carries any earlier-banked partial so crash-recovery and partial-resume compose.
- Staleness guard: a record older than `LIVE_SESSION_MAX_AGE_MS` (6h) since its last
  heartbeat is dropped, so a sit left overnight never resurrects. Best-effort throughout
  (any read/parse/quota failure degrades to "no saved run"; never throws into a render).
  The record is cleared on finish, discard, or recovery cleanup.

## Design specifics (the alignment + recolor pass)

- **Aligned setup screens.** Be Still and Get Moving share one setup layout. A
  single-row **5 / 10 / 15 / 20 / 30** minute preset set serves the sit modes
  (Meditate / Journal / Stillness / Ritual), with the free-form stepper (1 to 120)
  beside it.
- **"Free sit" is labeled "Free Practice".** The always-available neutral entry reads
  the same in both modes (`lib/on-air/session-data.ts`); it still logs the default sit
  practice (`morning-stillness`) through the one economy path.
- **Get Moving is teal/blue.** A new `move` token (`--color-move`, cerulean blue-teal)
  colors the Get Moving accents (resume cue, Change link, Start button, Resume prompt,
  the live + standalone labels), set roughly opposite Be Still's warm amber and bluer
  than the green-leaning success teal so it never collides with "done". Tokens only, no
  hardcoded hex in UI.
- The Get Moving Play icon is the **Volleyball** glyph; the masthead carries more top
  margin.

## Dispatches from Vera

Two layers so it's fast, cheap, and never wrong:

1. **The WHAT is deterministic** (`resolveAssignment`): priority = next Journey step
   due → challenge ≥50% done → no event attendance this week → depth mark ≤5 logs
   away → steady default. All reads from existing systems.
2. **The VOICE** (P2, shipped): `voiceCopy()` asks Haiku to rephrase the payload's
   fact line (names + numbers verbatim, 140-char cap) behind the standard
   `aiAvailable` + `featureOverBudget('vera-dispatch')` gates, with usage recorded
   to the AI ledger. `cleanDispatchCopy` validates the result (strips quotes /
   prefixes, swaps em dashes, rejects emoji / junk lengths) so a model hiccup can
   never reach a member; the P1 templates remain the always-on fallback. Whatever
   copy is minted is what replays forever (the cache row marks `voiced`).

Cached one per (member, day) in `vera_dispatches` (unique race → read the winner).
Replays and the history scroll (`listDispatches`) read the table. **No live Vera
on revisit**, by design.

## Roadmap

- ~~P2: Vera live~~ ✅ shipped: AI phrasing + the Dispatch archive at `/on-air/dispatches`.
- ~~P3: the takeover~~ ✅ shipped: PWA "Go On Air" manifest shortcut, interval
  bell (Web Audio synth, opt-in) + haptic phase cues (opt-in), presence line
  ("N members practiced today", shown at ≥3), custom pattern sliders (3 to 8s/phase,
  hold may be 0). Deferred from P3: the desktop intercepted-modal entry. It
  touches the shared (main) layout while parallel admin-chrome work is active;
  pick it up once that settles.
- ~~P4: beauty pass~~ ✅ shipped: four reveal spot scenes in the welcome-art
  language (components/on-air/reveal-art.tsx), the zap count-up (700ms ease-out),
  the streak N−1 → N tick with pulse (skipped on "already counted" sits), a
  one-shot celebration dot burst, and luminosity-breathing holds on the
  visualizer. Everything bows out under prefers-reduced-motion. Optional ambient
  audio remains unscheduled.

- ~~P5: mobile polish (owner feedback)~~ ✅ shipped: the live session, saving
  state and reveal now run in a TRUE full-viewport takeover (`fixed inset-x-0 top-0
  h-[100dvh] z-50`, above the app header and tab bar) until done or End. Sized in
  `dvh` (dynamic viewport height), not `inset-0`/`vh`: on mobile the browser's
  address/tool bars shrink the *visible* area, so `dvh` fills exactly what's on
  screen and never hides the End controls under the toolbar. The browser's own
  chrome can't be removed by a web page on iOS Safari. True chrome-free fullscreen
  is the installed PWA (manifest `display: standalone`; the "Mindless" home-screen
  shortcut opens it that way). Bigger rings + a flashing
  per-phase breath counter in the center; larger ON AIR indicator; chevron swipe
  indicators flanking the reveal dots; swiping (or arrowing) past the last card
  slides it off and closes the mode back to a refreshed setup; free-form minutes
  stepper (1 to 120) beside the presets; three bell voices (Soft / Low / Bowl) with
  a tap preview; an On Air radio icon in the global header (since retired by the
  Zap button owner pass, ADR-230: On Air's entries are the Zap menu's
  full-width Mindless row, the JourneyBoard, practice pages, /on-air and the
  PWA shortcut).

- ~~P6: live-screen pass (owner feedback)~~ ✅ shipped: more air in the live
  column (title down, End up); the title now reads **Mindless** under a lotus
  mark, softly pulsing; swiping off the last reveal card returns to the screen
  the member came from (history back) instead of always the setup; and every
  On Air control wears a custom SVG mark from the new kit
  (`components/on-air/icons.tsx`: lotus, breath ring, dial, bolt, bell,
  vibration, broadcast) in the zap-menu-art language, replacing the stock
  lucide glyphs.

- ~~P7: the member-facing name~~ ✅ shipped: member surfaces say **Mindless**
  and the verb is **"tune out"** ("tune back in" = done): setup title +
  metadata + CTA, the Zap menu door (moved between the live and coming-soon
  rows, lotus-on-water art), the lotus entry buttons on the JourneyBoard and
  practice pages (Radio glyph retired there), the Dispatch archive, the saving
  line, the reveal exit, the PWA shortcut, help and changelog. "On Air" stays
  the internal name (this doc, routes, schema, ADRs); Airtime keeps its name.

- ~~P8: the setup is the takeover too~~ ✅ shipped: entering Mindless is
  chrome-free from the FIRST screen. The setup renders inside the same
  full-viewport overlay as the sit (no app header/tab bar/edge pills), crowned
  by the same lotus + MINDLESS wordmark (still, not pulsing, until you're in)
  with a quiet ✕ that returns to the screen you came from. Compact one-viewport
  layout: practices became a horizontal chip row, sections tightened, and the
  **Tune out** button is PINNED in a sticky footer so it never sinks below the
  fold (even with the Custom sliders open). The page shell only hosts the
  empty "adopt a practice first" state.

- ~~P9: controls polish (owner feedback)~~ ✅ shipped: the setup breathes,
  wider edge margins, looser section rhythm, a slightly taller CTA; the
  lotus + MINDLESS wordmark grew into a proper masthead; the Practice row
  hides entirely when only one practice is adopted (auto-selected, no badge);
  modes renamed and reordered: **Meditate** (plain silent countdown, lotus
  icon) · **Breathe** (guided rings) · **Just Log**. Help copy updated.

- ~~P10: live controls (owner feedback)~~ ✅ shipped: the live screen gains a
  **dynamic primary button** (Pause ⇄ Start while running, **Finish** once the
  clock lands) with a ghost **Close Session** link beneath (replaces End).
  Finish and Close Session both log and advance to the reveal. Pausing freezes
  the clock, cues, and rings (the visualizer takes a `paused` prop), and the
  pause length never counts as airtime (startedAt shifts on resume). At zero
  the end bell rings once and the screen WAITS, no auto-advance; the member
  collects in their own time.

- ~~P11: 3X replaces Coherent~~ ✅ shipped: the middle pattern is now the
  **physiological sigh** as **3X** (big inhale 4s → "Sip in" 1s → "Let go" 7s).
  The phase model gained optional per-phase scale ranges so the double inhale
  grows the rings in two stacked steps with no reset between breaths (tested).
  Saved 'coherent' prefs fall back to Box gracefully.

- ~~P12: pull-down dismiss~~ ✅ shipped: a clearly-vertical downward drag on
  any reveal card (dy > 80px and > 1.5× the horizontal travel) slides the
  whole reveal down and closes the mode, same `onClose` path as the ghost
  panel. Horizontal swipes keep paging; reduced motion skips the slide.

- ~~P13: armed start~~ ✅ shipped: the live screen no longer starts the clock
  on entry. It opens ARMED (paused at zero, rings still, full time showing)
  and the dynamic button reads **Start**; tapping it begins the sit, then the
  P10 lifecycle takes over (Pause ⇄ Start → Finish at zero). Implemented as a
  pause from the first millisecond, so airtime math and cues needed nothing new.

- ~~P14: always-on + Journey-aware (ADR-306)~~ ✅ shipped: the timer is never
  blocked. A **Free sit** chip is always offered (it logs the default sit
  practice, `morning-stillness`, through the same `logPractice` path, so the
  empty "adopt a practice first" wall is gone). When enrolled, the list shows
  **only the current Journey leg** (the unlocked drip phase, via
  `lib/journeys/current-leg.ts`), not the whole library; a practice opened from
  a Journey **Practice** button is pinned + pre-selected even when unadopted (a
  previewing author). The timer now **defaults to the selected practice's
  `duration_min`** (no duration = an open-length sit on that practice). The
  armed wait (P13) becomes a **5-second "Starting in N" auto-start countdown**;
  the **Start** button overrides it to begin now. Publishing a Journey gains an
  **"Adopt it for myself"** option so an author's own Journey fills On Air. Plus
  a mobile Zap-popup pass: Check In / Ghost Node / Partners go to the inert
  ghost state, and the Capture box is one line shorter.

- ~~P15: the unified door + auto-resume + crash-recovery~~ ✅ shipped: the two
  timers became ONE Mindless with **Be Still** / **Get Moving** modes (ADR-360,
  "The unified timer" above); the setup **selects** a practice instead of
  auto-starting, and the primary button reads **Start Practice** (or **Continue
  Practice** for a partial). Resume is no longer gated to an explicit link: the
  timer **auto-resumes from the selected practice's `partialToday`** across every
  entry path, running only the remaining time, and a **Continue Practice**
  affordance appears wherever a Log/Practice button does. Crash-safe persistence
  (`lib/on-air/live-session.ts`) mirrors a running sit/run to `localStorage` so a
  reload after a mobile tab discard offers a **Resume** prompt that restores the
  exact elapsed. See "Entry, selection, and resume" + "Crash-safe persistence".

- ~~P16: design alignment + recolor~~ ✅ shipped: aligned Be Still / Get Moving
  setup screens, a single-row 5/10/15/20/30 minute preset set, "Free sit" labeled
  **Free Practice**, Get Moving recolored teal/blue via the new `move` token, the
  Play icon swapped to **Volleyball**, and more masthead top margin. See "Design
  specifics".

- ~~P17: optional ambient audio~~ ✅ shipped: a soft background loop for a Be
  Still sit (the "Sound & cues" **Ambient** row: Off · Forest · Ocean · Drift,
  default off). The player (`lib/on-air-ambient.ts`) decodes each MP3 and builds
  a crossfade-to-self loop buffer so it wraps with no seam (no `<audio loop>`
  click, no offline pre-processing step). It fades in over 3s at the start, ducks
  on pause, lifts on resume, fades out at the end, and rides the bell's shared
  AudioContext. Tracks are a registry (`AMBIENT_TRACKS`) over `/public/tracks`;
  the choice persists in `profiles.meta.onAir` and is restored on crash-resume.
  Drop an MP3 in + one registry line to add more. See ADR-408.

Metrics to watch (gamification admin): timer-start → completion rate, reveal
swipe-through depth, share of WAM logging via On Air, D7 repeat.
