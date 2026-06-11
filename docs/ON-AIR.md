# On Air — the practice timer mini-app (member-facing: **Mindless**)

> Status: **P1–P7 shipped** (ADR-229; desktop intercepted-modal entry deferred — see Roadmap). Canon names: NAMING.md §The Quest ("On Air" =
> internal name; member-facing the app is **Mindless**, verb **"tune out"**; "Airtime", "Dispatch from Vera"). Member help: `content/help/the-game/on-air.md`.

One tap → the world goes quiet → you breathe → the game pays you in person → Vera
hands you tomorrow's thread. A little app inside The Quest, and the intended daily
anchor for WAM.

## Why it's built this way (research)

- **The reveal is the retention engine, not the timer.** Duolingo stages the streak
  increment *inside* the lesson flow — the state change is the session's payoff.
  On Air does the same: the streak ticks over on a full screen you swipe through,
  never a badge discovered later.
- **Insight Timer beats Calm/Headspace ~2× on D30 retention** on the strength of a
  *customizable ritual* (your duration, your pattern, remembered setup), radical
  stats transparency, and a sub-5-minute no-guilt floor. We copy the ritual, not
  the content library.
- **Variable reward at completion** (Duolingo's chest): already live — Surprises
  (ADR-210) ride `logPractice` and surface in the reveal's bonus cascade for free.
- **Honest distraction-blocking:** a web app cannot suppress OS notifications
  (Opal/one sec use OS Screen Time APIs). The truthful web version is Wake Lock +
  Fullscreen (+ PWA standalone, P3) — screen stays lit, chrome disappears.

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
| Session machine | `components/on-air/session.tsx` | setup → live → saving → reveal; wake lock + mobile fullscreen, re-acquired on visibility |
| Visualizer | `components/on-air/visualizer.tsx` | RippleRings motif breathing; rAF writes transforms via refs (no React frame-rate renders); reduced-motion → opacity fade |
| Breath math | `lib/on-air.ts` (+ tests) | Box 4-4-4-4 · 3X (physiological sigh, 4-1-7) · 4-7-8; `breathPositionAt` / `ringScaleAt` pure, per-phase scale ranges for stacked breaths |
| Completion | `app/(main)/on-air/actions.ts` | ONE action: insert `practice_sessions` → **`logPractice()` (the only economy entry — same idempotency, zaps, bonuses, streaks)** → gather reveal payload → Dispatch |
| Reveal | `components/on-air/reveal.tsx` | 4 scroll-snap panels; bonus cascade staged 550ms apart; type-on Dispatch card |
| Dispatch engine | `lib/vera-dispatch.ts` | See below |
| Data | `supabase/migrations/20260615000000_on_air.sql` | `practice_sessions` (mode/pattern/seconds — airtime + history) + `vera_dispatches` (one per member/day, cached); RLS read-own |
| Prefs | `profiles.meta.onAir` | last mode/pattern/minutes (zero-config repeat) + `onAirTotalSeconds` (lifetime airtime counter — hosted PostgREST has aggregates off; sessions table can recompute) |

**Invariant: On Air is a stage, never a second economy.** A session that ends calls
`logPractice()` and nothing else pays. A practice already logged today still records
a session (airtime) — the reveal shows "already counted" honestly, streak intact.

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
Replays and the history scroll (`listDispatches`) read the table — **no live Vera
on revisit**, by design.

## Roadmap

- ~~P2 — Vera live~~ ✅ shipped: AI phrasing + the Dispatch archive at `/on-air/dispatches`.
- ~~P3 — the takeover~~ ✅ shipped: PWA "Go On Air" manifest shortcut, interval
  bell (Web Audio synth, opt-in) + haptic phase cues (opt-in), presence line
  ("N members practiced today", shown at ≥3), custom pattern sliders (3–8s/phase,
  hold may be 0). Deferred from P3: the desktop intercepted-modal entry — it
  touches the shared (main) layout while parallel admin-chrome work is active;
  pick it up once that settles.
- ~~P4 — beauty pass~~ ✅ shipped: four reveal spot scenes in the welcome-art
  language (components/on-air/reveal-art.tsx), the zap count-up (700ms ease-out),
  the streak N−1 → N tick with pulse (skipped on "already counted" sits), a
  one-shot celebration dot burst, and luminosity-breathing holds on the
  visualizer. Everything bows out under prefers-reduced-motion. Optional ambient
  audio remains unscheduled.

- ~~P5 — mobile polish (owner feedback)~~ ✅ shipped: the live session, saving
  state and reveal now run in a TRUE full-viewport takeover (`fixed inset-0 z-50`,
  above the app header and tab bar) until done or End; bigger rings + a flashing
  per-phase breath counter in the center; larger ON AIR indicator; chevron swipe
  indicators flanking the reveal dots; swiping (or arrowing) past the last card
  slides it off and closes the mode back to a refreshed setup; free-form minutes
  stepper (1–120) beside the presets; three bell voices (Soft / Low / Bowl) with
  a tap preview; an On Air radio icon in the global header (since retired by the
  Zap button owner pass, ADR-230 — On Air's entries are the Zap menu's
  full-width Mindless row, the JourneyBoard, practice pages, /on-air and the
  PWA shortcut).

- ~~P6 — live-screen pass (owner feedback)~~ ✅ shipped: more air in the live
  column (title down, End up); the title now reads **Mindless** under a lotus
  mark, softly pulsing; swiping off the last reveal card returns to the screen
  the member came from (history back) instead of always the setup; and every
  On Air control wears a custom SVG mark from the new kit
  (`components/on-air/icons.tsx` — lotus, breath ring, dial, bolt, bell,
  vibration, broadcast) in the zap-menu-art language, replacing the stock
  lucide glyphs.

- ~~P7 — the member-facing name~~ ✅ shipped: member surfaces say **Mindless**
  and the verb is **"tune out"** ("tune back in" = done): setup title +
  metadata + CTA, the Zap menu door (moved between the live and coming-soon
  rows, lotus-on-water art), the lotus entry buttons on the JourneyBoard and
  practice pages (Radio glyph retired there), the Dispatch archive, the saving
  line, the reveal exit, the PWA shortcut, help and changelog. "On Air" stays
  the internal name (this doc, routes, schema, ADRs); Airtime keeps its name.

- ~~P8 — the setup is the takeover too~~ ✅ shipped: entering Mindless is
  chrome-free from the FIRST screen — the setup renders inside the same
  full-viewport overlay as the sit (no app header/tab bar/edge pills), crowned
  by the same lotus + MINDLESS wordmark (still, not pulsing, until you're in)
  with a quiet ✕ that returns to the screen you came from. Compact one-viewport
  layout: practices became a horizontal chip row, sections tightened, and the
  **Tune out** button is PINNED in a sticky footer so it never sinks below the
  fold (even with the Custom sliders open). The page shell only hosts the
  empty "adopt a practice first" state.

- ~~P9 — controls polish (owner feedback)~~ ✅ shipped: the setup breathes —
  wider edge margins, looser section rhythm, a slightly taller CTA; the
  lotus + MINDLESS wordmark grew into a proper masthead; the Practice row
  hides entirely when only one practice is adopted (auto-selected, no badge);
  modes renamed and reordered: **Meditate** (plain silent countdown, lotus
  icon) · **Breathe** (guided rings) · **Just Log**. Help copy updated.

- ~~P10 — live controls (owner feedback)~~ ✅ shipped: the live screen gains a
  **dynamic primary button** — Pause ⇄ Start while running, **Finish** once the
  clock lands — with a ghost **Close Session** link beneath (replaces End).
  Finish and Close Session both log and advance to the reveal. Pausing freezes
  the clock, cues, and rings (the visualizer takes a `paused` prop), and the
  pause length never counts as airtime (startedAt shifts on resume). At zero
  the end bell rings once and the screen WAITS — no auto-advance; the member
  collects in their own time.

- ~~P11 — 3X replaces Coherent~~ ✅ shipped: the middle pattern is now the
  **physiological sigh** as **3X** (big inhale 4s → "Sip in" 1s → "Let go" 7s).
  The phase model gained optional per-phase scale ranges so the double inhale
  grows the rings in two stacked steps with no reset between breaths (tested).
  Saved 'coherent' prefs fall back to Box gracefully.

Metrics to watch (gamification admin): timer-start → completion rate, reveal
swipe-through depth, share of WAM logging via On Air, D7 repeat.
