# On Air — the practice timer mini-app

> Status: **P1–P4 shipped** (ADR-229; desktop intercepted-modal entry deferred — see Roadmap). Canon names: NAMING.md §The Quest ("On Air",
> "Airtime", "Dispatch from Vera"). Member help: `content/help/the-game/on-air.md`.

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
| Breath math | `lib/on-air.ts` (+ tests) | Box 4-4-4-4 · Coherent 5.5 · 4-7-8; `breathPositionAt` / `ringScaleAt` pure |
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
  a tap preview; an On Air radio icon in the global header.

Metrics to watch (gamification admin): timer-start → completion rate, reveal
swipe-through depth, share of WAM logging via On Air, D7 repeat.
