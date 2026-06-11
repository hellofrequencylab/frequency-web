# On Air — the practice timer mini-app

> Status: **P1 shipped** (ADR-229). Canon names: NAMING.md §The Quest ("On Air",
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
2. **The VOICE**: P1 ships template copy in the brand voice (plain sentences, no em
   dashes, proper nouns carry the magic). **P2 layers AI phrasing over the same
   payload** behind the standard `aiAvailable` + budget gates, templates as
   fallback. The cache row shape doesn't change.

Cached one per (member, day) in `vera_dispatches` (unique race → read the winner).
Replays and the history scroll (`listDispatches`) read the table — **no live Vera
on revisit**, by design.

## Roadmap

- **P2 — Vera live:** AI phrasing over the resolver payload; Dispatch history screen.
- **P3 — the takeover:** PWA manifest shortcut ("Start practice"), desktop
  intercepted-modal entry, interval bells + haptic phase cues, presence ("N members
  practiced today" = count of today's logs), custom pattern slider (3–8s/phase).
- **P4 — beauty pass:** reveal count-up/confetti animations in the arcs motif,
  more welcome-art scenes, optional ambient.

Metrics to watch (gamification admin): timer-start → completion rate, reveal
swipe-through depth, share of WAM logging via On Air, D7 repeat.
