'use client'

// Movement — the live movement timer (WEBSITE-CHANGES-PLAN §4 C.6). A sibling of
// the Mindless sit (components/on-air/session.tsx): same takeover shell, same
// wake lock + true fullscreen, the same Web Audio cue voice, the same 250ms
// wall-clock tick + pause/resume math, and the SAME completeSession -> logPractice
// log path. The difference is the engine: instead of a single countdown it walks
// a movement plan (Walk / Run / Yoga / Strength / Stretch / Play) built by
// lib/movement.ts.
//
// The shape: setup (pick one of six modes + its preset, or tune Strength) -> live
// (a big M:SS, a round counter, the next-phase line, color-coded phases) -> the
// shared Reveal / log. Color reads the phase kind: work = success, rest = warning,
// the lead-in is neutral, and the final 3 seconds of any timed phase ring danger so
// the change is felt before it lands. Audio: a 3-2-1 countdown into each work phase,
// a bell on every phase change, the closing double-strike at the end.
//
// Completion economy: the live screen reports the ACTUAL elapsed seconds to
// completeSession, which measures them against the practice's authored target and
// pays a partial (>= 50%, 1 Zap) or a full reward. A "Finish Practice" resume opens
// mid-way (resumeFromSec already banked, secondsTarget the whole length): the clock
// runs the REMAINING time, and the total banked is resumeFromSec + this session.
//
// VOICE (docs/CONTENT-VOICE.md): plain, warm labels. No em or en dashes. Proper
// nouns (Tabata, EMOM) carry the magic. Tokens only, never hex (docs/THEME.md).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Minus,
  Plus,
  X,
  Check,
  Footprints,
  Rabbit,
  Flower2,
  Dumbbell,
  StretchHorizontal,
  Volleyball,
} from 'lucide-react'
import { OnAirIcon } from './icons'
import { MovementArt } from '@/components/feed/zap-menu-art'
import { Reveal } from './reveal'
import { MindlessMasthead } from './mode-toggle'
import type { TimerMode } from './mindless'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { chime, endChime, countBeep } from '@/lib/timer-audio'
import { bellToneBySlug, clampWarmupSec, resolveWarmupSec } from '@/lib/on-air'
import type { OnAirPractice } from './session'
import {
  MOVEMENT_MODES,
  STRENGTH_PRESETS,
  YOGA_PRESETS,
  WALK_DURATION_PRESETS,
  WALK_INTERVAL_PRESETS,
  RUN_DURATION_PRESETS,
  RUN_INTERVAL_PRESETS,
  STRETCH_DURATION_PRESETS,
  STRETCH_INTERVAL_PRESETS,
  buildPlan,
  phaseAt,
  totalSeconds,
  clampRounds,
  clampSeconds,
  type MovementMode,
  type MovementConfig,
  type MovementPlan,
  type PhaseKind,
  type StrengthPresetKind,
  type YogaPresetKind,
} from '@/lib/movement'
import type { RevealPayload } from '@/lib/on-air'
import {
  loadLiveSession,
  saveLiveSession,
  clearLiveSession,
  liveElapsedSeconds,
  type LiveSessionRecord,
} from '@/lib/on-air/live-session'
import {
  pushActiveSession,
  pauseActiveSession,
  resumeActiveSession,
  clearActiveSession,
} from '@/lib/on-air/active-session'
import { clampLoggedSeconds, runOverStateAt } from '@/lib/on-air/run-over'

// What a saved Movement run carries beyond the shared record fields: the config the plan is
// rebuilt from. Everything else (startedAt, pausedAt, practiceId, banked, target) is on the record.
interface MovementSetup {
  config: MovementConfig
}

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// The bell voice is fixed to the tuned default for Movement (the sit's voice
// picker is the place to choose one; here the cues are functional beats).
const TONE = bellToneBySlug('soft')

// The six mode icons (C.1): the movement modes show the SAME way the Mindless
// modes do, so each gets a small glyph above its label in the 3-up grid.
const MODE_ICON: Record<MovementMode, React.ElementType> = {
  walk: Footprints,
  run: Rabbit,
  yoga: Flower2,
  strength: Dumbbell,
  stretch: StretchHorizontal,
  // A ball glyph reads as outdoor / active play, not video gaming (item #6).
  play: Volleyball,
}

/** Vibration where supported (Android). iOS web has no vibration; never throw. */
function buzz(pulse: number | number[] = 15) {
  try {
    navigator.vibrate?.(pulse)
  } catch {
    // no vibration on this device
  }
}

/** The phase color: work banks success, rest warns, the lead-in is neutral. The
 *  final-3s danger ring is layered on top in the live screen, not here. */
function phaseTone(kind: PhaseKind): { text: string; ring: string; bg: string; label: string } {
  switch (kind) {
    case 'work':
      return { text: 'text-success', ring: 'ring-success/40', bg: 'bg-success-bg/40', label: 'Work' }
    case 'rest':
      return { text: 'text-warning', ring: 'ring-warning/40', bg: 'bg-warning-bg/40', label: 'Rest' }
    default:
      return { text: 'text-muted', ring: 'ring-border', bg: 'bg-surface-elevated', label: 'Ready' }
  }
}

/** The takeover shell, matching the Mindless Overlay (fixed, dvh-sized so the
 *  controls never hide behind mobile browser chrome). */
function Overlay({ children, flash = false }: { children: React.ReactNode; flash?: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-5">{children}</div>
      {/* The warm-up "one" flash as the run begins. Semantic tokens (move accent); hidden under
          prefers-reduced-motion. */}
      {flash && (
        <div
          aria-hidden
          className="animate-warmup-flash pointer-events-none fixed inset-0 z-[70] bg-move/40 motion-reduce:hidden"
        />
      )}
    </div>
  )
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function MovementSession({
  practices,
  defaultPracticeId,
  defaultMode,
  resumeFromSec = 0,
  secondsTarget,
  practicedToday = 0,
  autoStart = false,
  warmupSec: warmupSecProp,
  warmupMessageOverride,
  queuePosition,
  onCompleted,
  resumeRecord,
  onExit,
  onLeaveViaLink,
  mode: doorMode,
  onModeChange,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  /** The Movement mode this session opens on (from a practice's movement_config, or Walk). */
  defaultMode?: MovementMode | null
  /** "Finish Practice" resume: seconds already banked from an earlier partial sit. The
   *  live clock runs the REMAINING time and reports resumeFromSec + this session's
   *  elapsed as the total to completeSession. 0 = a fresh sit. */
  resumeFromSec?: number
  /** "Finish Practice" resume: the practice's full target length in seconds. Bounds the
   *  remaining run so the resume stops at the target, and feeds the completion messaging. */
  secondsTarget?: number
  /** A practice-SELECT launch: skip the setup screen and begin the movement immediately, on the
   *  initial practice's configured mode + plan. Off (the default) for the manual entry points,
   *  which still open to setup. A crash-recovered run surfaces its Resume prompt instead. */
  autoStart?: boolean
  /** Distinct members with a practice log today (presence line, shown at >=3). */
  practicedToday?: number
  /** The member's warm-up length pref (seconds), shared with the sit (item #10). Default 5. */
  warmupSec?: number
  /** A per-step warm-up message override (ADR-592, P5): when set (a Journey-step launch), the
   *  pre-roll shows THIS instead of the launched practice's own warm-up message. */
  warmupMessageOverride?: string | null
  /** This leg's position in a sequenced run (ADR-592, P6): { index (0-based), total }. Absent for
   *  a single run. Drives a "Practice N of M" chip + the "up next" reveal hint. */
  queuePosition?: { index: number; total: number } | null
  /** Fired once when the leg COMPLETES (log saved, reveal opens) — distinct from onExit (which also
   *  fires on an early bail). Lets the provider auto-advance a sequence only on real completion. */
  onCompleted?: () => void
  /** The server-authoritative active session (ADR-521): when present and no localStorage record
   *  exists, the run resumes as RUNNING on mount (cross-device), never a prompt. */
  resumeRecord?: LiveSessionRecord | null
  /** Overlay mode: leaving CLOSES the overlay via this callback instead of navigating. */
  onExit?: () => void
  /** A reveal DEEP-LINK exit (the member tapped Vera's dispatch link and is navigating away):
   *  close the overlay WITHOUT advancing a sequenced run over the new page. Falls back to onExit. */
  onLeaveViaLink?: () => void
  /** The unified-door mode this session is showing ('move'). Only meaningful with onModeChange. */
  mode?: TimerMode
  /** When provided (the unified Mindless door), the setup masthead renders the Be Still | Get
   *  Moving toggle wired to this. Always set today (the door is the only mounter of this engine),
   *  but kept optional so the component stays standalone-renderable. */
  onModeChange?: (mode: TimerMode) => void
}) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('setup')

  // --- setup state ----------------------------------------------------------
  // Get Moving must resolve a MOVEMENT practice, never a Be Still one: the shared loader default
  // (defaultPracticeId) is mode-agnostic and can be a Mind sit / log-only practice (e.g. "One Small
  // Reach"), which a walk must not log against (item #1). Prefer, in order: the shared default when
  // it IS a movement practice, a movement practice with a partial today, a movement practice not yet
  // logged, then any movement practice (the loader's movement Free Practice is one). Only if there is
  // no movement practice at all do we fall back to the old resolution.
  const isMove = (p: OnAirPractice) => p.timerKind === 'movement'
  const initialId =
    (defaultPracticeId && practices.find((p) => p.id === defaultPracticeId && isMove(p))?.id) ||
    practices.find((p) => isMove(p) && p.partialToday)?.id ||
    practices.find((p) => isMove(p) && !p.loggedToday)?.id ||
    practices.find((p) => isMove(p))?.id ||
    defaultPracticeId ||
    practices.find((p) => !p.loggedToday)?.id ||
    practices[0]?.id ||
    ''

  // The resume point for a practice, in { bankedSec, targetSec }. The SELECTED practice's
  // `partialToday` is now the PRIMARY source (so a Zap-menu / chooser / auto-select all resume),
  // recomputed when the selected practice changes. The explicit resumeFromSec/secondsTarget
  // open-args remain a fallback for the initial practice (the "Finish Practice" button). Returns
  // null unless there's real remaining time, so anything malformed is a fresh sit.
  function resolveResume(id: string): { bankedSec: number; targetSec: number } | null {
    const partial = practices.find((p) => p.id === id)?.partialToday
    if (partial && partial.targetSec > 0 && partial.targetSec - partial.bankedSec > 0) {
      return { bankedSec: Math.round(partial.bankedSec), targetSec: Math.round(partial.targetSec) }
    }
    if (
      id === initialId &&
      resumeFromSec > 0 &&
      typeof secondsTarget === 'number' &&
      secondsTarget > 0 &&
      secondsTarget - resumeFromSec > 0
    ) {
      return { bankedSec: Math.round(resumeFromSec), targetSec: Math.round(secondsTarget) }
    }
    return null
  }
  const initialResume = resolveResume(initialId)
  // The launched practice's CREATOR-authored preset (ADR-592, P2): its stored movement_config
  // seeds the setup tuning below, so a timed movement practice opens ready to run exactly as the
  // author set it (Tabata 20/10 x8, a 30 min walk, a Yin flow), not the generic defaults. The
  // member can still adjust before starting. A resume still overrides the LENGTH to the remaining
  // time; the preset supplies everything else.
  const initialCfg = practices.find((p) => p.id === initialId)?.movementConfig ?? null

  const [practiceId, setPracticeId] = useState(initialId)
  const [mode, setMode] = useState<MovementMode>(defaultMode ?? initialCfg?.mode ?? 'walk')
  // The manual "Select practice" step is GONE (owner directive 2026-07-06). The door already
  // auto-resolved WHAT to run on the server (loadOnAirSessionData.defaultPracticeId): the adopted
  // practice due today when there is one and it isn't done, else Free Practice. So there is nothing
  // to pick here — the primary button always STARTS the resolved practice.
  // The per-mode duration default, overridden to the resumed practice's TARGET length so the plan
  // total matches and the live screen runs exactly the remaining time. A fresh sit uses the preset.
  const resumeMin = initialResume ? Math.max(1, Math.round(initialResume.targetSec / 60)) : 0
  // Walk
  const [walkMinutes, setWalkMinutes] = useState(defaultMode === 'walk' && resumeMin ? resumeMin : (initialCfg?.walkMinutes ?? 20))
  const [walkIntervalMin, setWalkIntervalMin] = useState(initialCfg?.walkIntervalMin ?? 0)
  // Run
  const [runMinutes, setRunMinutes] = useState(defaultMode === 'run' && resumeMin ? resumeMin : (initialCfg?.runMinutes ?? 20))
  const [runIntervalMin, setRunIntervalMin] = useState(initialCfg?.runIntervalMin ?? 0)
  // Yoga
  const [yogaKind, setYogaKind] = useState<YogaPresetKind>(initialCfg?.yogaKind ?? 'vinyasa')
  // Stretch
  const [stretchMinutes, setStretchMinutes] = useState(
    defaultMode === 'stretch' && resumeMin ? resumeMin : (initialCfg?.stretchMinutes ?? 10),
  )
  const [stretchIntervalMin, setStretchIntervalMin] = useState(initialCfg?.stretchIntervalMin ?? 0)
  // Strength (a preset, plus tunable steppers that override it). Seeds from the author's config.
  const [strengthKind, setStrengthKind] = useState<StrengthPresetKind>(initialCfg?.strengthKind ?? initialCfg?.workoutKind ?? 'tabata')
  const [workSec, setWorkSec] = useState(initialCfg?.workSec ?? 20)
  const [restSec, setRestSec] = useState(initialCfg?.restSec ?? 10)
  const [rounds, setRounds] = useState(initialCfg?.rounds ?? 8)

  const practice = practices.find((p) => p.id === practiceId)

  // The config the setup screen has composed, and the plan it builds.
  const config: MovementConfig = useMemo(() => {
    switch (mode) {
      case 'walk':
        return { mode, walkMinutes, walkIntervalMin }
      case 'run':
        return { mode, runMinutes, runIntervalMin }
      case 'yoga':
        return { mode, yogaKind }
      case 'stretch':
        return { mode, stretchMinutes, stretchIntervalMin }
      case 'play':
        return { mode }
      case 'strength':
        return { mode, strengthKind, workSec, restSec, rounds }
      default:
        return { mode }
    }
  }, [
    mode,
    walkMinutes,
    walkIntervalMin,
    runMinutes,
    runIntervalMin,
    yogaKind,
    stretchMinutes,
    stretchIntervalMin,
    strengthKind,
    workSec,
    restSec,
    rounds,
  ])

  const plan = useMemo<MovementPlan>(() => buildPlan(config), [config])

  // The banked-seconds + target the live math reads. They seed from the SELECTED practice's resume
  // (its partial today, or the "Finish Practice" open-args), are re-seeded when the pick changes
  // (selectPractice), and a CRASH-RECOVERY resume overrides them from the saved record so a restored
  // top-up still banks the earlier partial (see resumeFromRecord below).
  const [bankedSec, setBankedSec] = useState(initialResume?.bankedSec ?? 0)
  const [targetSec, setTargetSec] = useState<number | undefined>(initialResume?.targetSec)

  // "Finish Practice" resume: the seconds already banked from an earlier partial sit.
  // The live screen reads the plan from this offset (so the member picks up where the
  // plan left off), and the only time we COUNT is this session's own elapsed. Clamped
  // to the plan total so a resume never reads past the end. A fresh sit has offset 0.
  const resumeOffset = useMemo(() => {
    if (bankedSec <= 0) return 0
    const total = totalSeconds(plan)
    return total === null ? Math.round(bankedSec) : Math.min(Math.round(bankedSec), total)
  }, [bankedSec, plan])

  // The cap on what a finish can bank: the authored target on a "Finish Practice" resume
  // (targetSec), else the plan's own run length, else null for open-ended Play. The
  // server still owns the partial-vs-full economy decision; this only stops an overshoot.
  const finishCap = useMemo<number | null>(() => {
    if (bankedSec > 0 && typeof targetSec === 'number' && targetSec > 0) {
      return Math.round(targetSec)
    }
    return totalSeconds(plan)
  }, [bankedSec, targetSec, plan])

  // This session's own target for the run-over gate: the finish cap minus what an earlier partial
  // already banked (a resume runs only the remaining time), or the plan total for a fresh sit.
  // Open-ended Play (finishCap null) has no target, so the gate is a no-op there (it counts up).
  const gateTargetSec = finishCap === null ? 0 : Math.max(0, finishCap - resumeOffset)
  useEffect(() => {
    gateTargetRef.current = gateTargetSec
  }, [gateTargetSec])

  // Whether THIS session is a resume (the selected practice has a partial today, or the open-args
  // did). Drives the setup's "Continue Practice" label + the remaining-time cue. The live math
  // already resumes off bankedSec; this is the render flag for the SELECTED practice.
  const activeResume = resolveResume(practiceId)
  // The remaining time of a resume, in seconds: target minus what's already banked. The plan total
  // is seeded to the target (seedFromPractice), so the live screen runs exactly this.
  const remainingSec = activeResume
    ? Math.max(0, activeResume.targetSec - activeResume.bankedSec)
    : 0
  const remainingMin = remainingSec > 0 ? Math.max(1, Math.round(remainingSec / 60)) : 0

  // Seed the Strength steppers from the chosen preset (so picking Tabata fills
  // 20/10/8, then the member can tune from there).
  function pickStrength(kind: StrengthPresetKind) {
    const preset = STRENGTH_PRESETS.find((p) => p.kind === kind) ?? STRENGTH_PRESETS[0]
    setStrengthKind(kind)
    setWorkSec(preset.workSec)
    setRestSec(preset.restSec)
    setRounds(preset.rounds)
  }

  // The member's warm-up length (item #10): shared with the sit via the prefs prop. Default 5.
  const warmupSec = clampWarmupSec(warmupSecProp)

  // --- live state -----------------------------------------------------------
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  // The warm-up pre-roll before a run begins (mirrors the sit): null = not counting.
  const [preroll, setPreroll] = useState<number | null>(null)
  // The full-screen warm-up flash as the "one" count lands. Auto-clears.
  const [flash, setFlash] = useState(false)
  // After an automatic (no-gesture) resume, a small non-blocking chip to re-arm sound.
  const [needRestore, setNeedRestore] = useState(false)
  // Run-over confirmation gate (shared with the Be Still sit): once THIS session runs past 150%
  // of its target we ask "still moving?" and only confirmed time (or the target) is banked, so an
  // unattended run never inflates airtime. `confirmationsRef` holds the airtime-elapsed (seconds)
  // of each confirm; `gateTargetRef` mirrors this session's target for the 250ms tick. An
  // open-ended Play run (no target) is never gated — it counts up by design.
  const confirmationsRef = useRef<number[]>([])
  const gateTargetRef = useRef(0)
  const [runOverPrompt, setRunOverPrompt] = useState(false)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const lastPhaseLabel = useRef<string | null>(null)
  const lastBeep = useRef(-1)
  const lastWalkMinute = useRef(0)
  const endCued = useRef(false)
  // Once-only guard for the warm-up -> live handoff (the countdown hitting zero AND a Start tap can
  // both reach begin() in the same instant, each shifting startedAt a warm-up behind). Re-armed by
  // start(); latched by the first begin(). Mirrors the sit engine.
  const begunRef = useRef(false)

  // --- takeover plumbing (shared shape with the Mindless sit) ---------------
  async function acquireQuiet() {
    try {
      wakeLock.current =
        (await (navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock?.request('screen')) ?? null
    } catch {
      // wake lock is progressive enhancement
    }
    // True fullscreen, gesture-gated, so this only lands from the Start tap.
    await requestAppFullscreen()
  }

  async function releaseQuiet() {
    try {
      await wakeLock.current?.release()
    } catch {
      /* released already */
    }
    wakeLock.current = null
    await exitAppFullscreen()
  }

  // Re-acquire the wake lock when the tab comes back (the OS drops it on blur).
  useEffect(() => {
    const onVisible = () => {
      if (stage === 'live' && document.visibilityState === 'visible' && !wakeLock.current) {
        void acquireQuiet()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [stage])

  // Release everything the takeover holds when the surface unmounts. finish()/leave() already run
  // releaseQuiet() on the normal exits; this is the backstop for an UNEXPECTED unmount (e.g. the
  // provider closing the overlay mid-run) so the screen wake lock + fullscreen never leak.
  useEffect(() => {
    const ctx = audio
    const lock = wakeLock
    return () => {
      try {
        void ctx.current?.close()
      } catch {
        // already closed
      }
      ctx.current = null
      try {
        void lock.current?.release()
      } catch {
        // already released
      }
      lock.current = null
      void exitAppFullscreen()
    }
  }, [])

  // --- the clock ------------------------------------------------------------
  // One 250ms wall-clock tick walks `elapsed` against the plan via phaseAt, firing
  // the cues on transitions. Pauses shift startedAt forward so they never count.
  useEffect(() => {
    if (stage !== 'live') return
    const id = setInterval(() => {
      if (pausedAt !== null) return
      // This session's own elapsed. The plan is read from resumeOffset + elapsed so a
      // "Finish Practice" resume picks up where the earlier partial left off, while the
      // counter we bank (in finish) stays this session's elapsed plus what was banked.
      const e = (Date.now() - startedAt) / 1000
      setElapsed(e)

      // Run-over gate: once THIS session runs past 150% of its target, show the "still moving?"
      // chip; a checkpoint left a whole interval unanswered means the member walked away ->
      // auto-finalize at the last confirmed point (or target). Also catches a background return:
      // the tick recomputes elapsed from the wall-clock startedAt, so on refocus a run past its
      // deadline finalizes on the next tick. Open-ended Play (gate target 0) is never gated.
      const gate = gateTargetRef.current
      if (gate > 0) {
        const runOver = runOverStateAt(gate, e, confirmationsRef.current)
        if (runOver.phase === 'abandoned') {
          autoFinalizeRunOver()
          return
        }
        setRunOverPrompt(runOver.phase === 'prompting')
      }

      const pos = phaseAt(plan, resumeOffset + e)

      // Phase change -> a bell + a small buzz. Lead-in into work, work into rest,
      // round to round all read here off the label changing.
      if (pos.phase.label !== lastPhaseLabel.current) {
        if (lastPhaseLabel.current !== null && !pos.done) {
          chime(audio.current, TONE)
          buzz(15)
        }
        lastPhaseLabel.current = pos.phase.label
      }

      // 3-2-1 countdown into the NEXT phase: when a timed phase is about to end,
      // beep on each of its final three whole seconds, the last one accented.
      if (pos.remaining !== null && !pos.done && pos.remaining <= 3) {
        const tick = Math.ceil(pos.remaining) // 3,2,1
        if (tick >= 1 && tick <= 3 && tick !== lastBeep.current) {
          lastBeep.current = tick
          countBeep(audio.current, 1, tick === 1)
        }
      } else {
        lastBeep.current = -1
      }

      // Interval reminder: a gentle chime on each chosen-minute mark, not a phase, so
      // the block stays one clean countdown. Walk = a nudge, Run = a split cue, Stretch
      // = a soft "switch sides." All three fire on the minute of the work block.
      const intervalMin =
        plan.mode === 'walk'
          ? walkIntervalMin
          : plan.mode === 'run'
            ? runIntervalMin
            : plan.mode === 'stretch'
              ? stretchIntervalMin
              : 0
      if (intervalMin > 0 && pos.phase.kind === 'work') {
        const minute = Math.floor(pos.phaseElapsed / 60)
        if (minute > lastWalkMinute.current) {
          lastWalkMinute.current = minute
          if (minute > 0 && minute % intervalMin === 0) chime(audio.current, TONE)
        }
      }

      // The end: the closing double-strike rings once, then the screen waits for
      // the member to Finish (no auto-advance), mirroring the sit.
      if (pos.done && !endCued.current) {
        endCued.current = true
        endChime(audio.current, TONE)
        buzz([30, 80, 30])
      }
    }, 250)
    return () => clearInterval(id)
    // autoFinalizeRunOver is a stable hoisted handler reading refs/current state; listing it (a
    // per-render function) would needlessly re-subscribe the wall-clock tick. Deps are otherwise complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, startedAt, pausedAt, plan, resumeOffset, walkIntervalMin, runIntervalMin, stretchIntervalMin])

  // The warm-up pre-roll (item #10): tick down, buzz each second (a stronger pulse + flash on the
  // final "one"), then begin() to unpause the run. The Start tap opened the run armed/paused.
  useEffect(() => {
    if (stage !== 'live' || preroll === null) return
    if (preroll <= 0) {
      begin()
      return
    }
    const isOne = preroll === 1
    buzz(isOne ? [30, 80, 30] : 15)
    countBeep(audio.current, 1, isOne)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOne) setFlash(true)
    const id = setTimeout(() => setPreroll((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, preroll])

  // Clear the warm-up flash after it plays (the CSS animation is 0.7s; reduced-motion hides it).
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(false), 750)
    return () => clearTimeout(id)
  }, [flash])

  // --- persistence + global resume (lib/on-air/live-session + active-session) ------
  // On mount, if a run is already going, RESUME IT AS RUNNING (ADR-521) — never a prompt. The
  // localStorage record is the fast same-browser cache; the server `resumeRecord` (fetched by
  // MindlessProvider) carries it CROSS-DEVICE. Either re-opens the run and computes elapsed from
  // the wall-clock startedAt; the auto path re-acquires audio/screen only best-effort.
  useEffect(() => {
    const rec =
      loadLiveSession<MovementSetup>('movement') ??
      (resumeRecord as LiveSessionRecord<MovementSetup> | null) ??
      null
    if (rec) resumeFromRecord(rec, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AUTO-START (a practice-select launch): skip setup and begin the movement immediately, on the
  // initial practice's configured mode + plan (already seeded in state above). Fires ONCE on mount,
  // only when there's a real practice to run and no recovered / server-active run is waiting (that
  // auto-resumes above). Manual entry points pass autoStart=false and still show setup.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    if (loadLiveSession<MovementSetup>('movement') || resumeRecord) return // a run already owns the screen
    if (!initialId) return
    void start()
    // Run once on mount; mode + plan are the seeded state for the launched practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While live (including warm-up), persist the localStorage cache on every state change + a 30s
  // heartbeat. The wall-clock startedAt is what lets a reload recover the exact elapsed. The SERVER
  // active session is written from the lifecycle transitions (start / begin / pause / resume).
  useEffect(() => {
    if (stage !== 'live') return
    const write = () =>
      saveLiveSession<MovementSetup>({
        kind: 'movement',
        startedAt,
        pausedAt,
        practiceId: practice?.logsAs ?? practiceId,
        resumeFromSec: resumeOffset,
        secondsTarget: typeof targetSec === 'number' ? targetSec : null,
        setup: { config },
      })
    write()
    const id = setInterval(write, 30_000)
    return () => clearInterval(id)
  }, [stage, startedAt, pausedAt, practiceId, practice, resumeOffset, targetSec, config])

  // Apply a saved MovementConfig back onto the setup state, so the plan rebuilds to the same shape.
  // MovementConfig is a flat interface with per-mode optional fields, so fall back to the setup
  // defaults (matching the initial state) for any field a stored config didn't carry.
  function applyMovementConfig(c: MovementConfig) {
    setMode(c.mode)
    if (c.mode === 'walk') {
      setWalkMinutes(c.walkMinutes ?? 20)
      setWalkIntervalMin(c.walkIntervalMin ?? 0)
    } else if (c.mode === 'run') {
      setRunMinutes(c.runMinutes ?? 20)
      setRunIntervalMin(c.runIntervalMin ?? 0)
    } else if (c.mode === 'yoga') {
      setYogaKind(c.yogaKind ?? 'vinyasa')
    } else if (c.mode === 'stretch') {
      setStretchMinutes(c.stretchMinutes ?? 10)
      setStretchIntervalMin(c.stretchIntervalMin ?? 0)
    } else if (c.mode === 'strength') {
      setStrengthKind(c.strengthKind ?? 'tabata')
      setWorkSec(c.workSec ?? 20)
      setRestSec(c.restSec ?? 10)
      setRounds(c.rounds ?? 8)
    }
    // 'play' carries no params.
  }

  // Resume a recovered run: rebuild the config, restore the exact wall clock, and seed the cue
  // trackers to the current phase so the part already done is not replayed. Audio + wake lock are
  // re-acquired on this tap (a gesture), so the screen re-locks just like a fresh start.
  //
  // `viaGesture` = the resume rides a user tap (audio + wake lock re-acquire). The global auto-resume
  // on load passes false: the clock resumes immediately, but audio/screen re-acquire best-effort, so
  // a "Tap to restore sound" chip is offered.
  function resumeFromRecord(rec: LiveSessionRecord<MovementSetup>, viaGesture = true) {
    // Run-over gate on the RESUME path (the double-count culprit, ADR-521): a run restored PAST its
    // abandonment deadline (left running overnight, then auto-resumed cross-device) must NOT come
    // back as a runaway clock. Confirmations are not persisted, so an over-deadline resume finalizes
    // at the target (plus any earlier banked partial), never the elapsed. A paused record is a
    // deliberate hold, so it still resumes; open-ended Play (no plan total) is never gated.
    const gatePlan = buildPlan(rec.setup.config)
    const gateTotal = totalSeconds(gatePlan)
    if (gateTotal !== null && rec.pausedAt === null) {
      const recOffset = rec.resumeFromSec > 0 ? Math.min(Math.round(rec.resumeFromSec), gateTotal) : 0
      const recRemainingTarget = Math.max(0, gateTotal - recOffset)
      const recElapsed = liveElapsedSeconds(rec)
      if (
        recRemainingTarget > 0 &&
        runOverStateAt(recRemainingTarget, recElapsed, []).phase === 'abandoned'
      ) {
        finishing.current = true
        const bankedThis = clampLoggedSeconds(recRemainingTarget, recElapsed, [])
        const seconds = Math.min(gateTotal, recOffset + Math.max(0, bankedThis))
        void finishWith(Math.max(0, seconds), {
          startedIso: new Date(rec.startedAt).toISOString(),
          practiceIdOverride: rec.practiceId,
          resumeFromSecOverride: recOffset,
          movementModeOverride: rec.setup.config.mode,
          // Over-deadline resume (ADR-627): finalized on the member's behalf, NOT attended airtime.
          attended: false,
        })
        return
      }
    }
    if (viaGesture) {
      try {
        audio.current = audio.current ?? new AudioContext()
        void audio.current.resume()
      } catch {
        // cues are a nicety
      }
    }
    applyMovementConfig(rec.setup.config)
    setPracticeId(rec.practiceId)
    setBankedSec(rec.resumeFromSec)
    setTargetSec(rec.secondsTarget ?? undefined)
    setStartedAt(rec.startedAt)
    setPausedAt(rec.pausedAt)
    setPreroll(null)
    setElapsed(liveElapsedSeconds(rec))
    // Seed the cue trackers to the resumed position so nothing already passed re-fires.
    const recPlan = buildPlan(rec.setup.config)
    const total = totalSeconds(recPlan)
    const recOffset =
      rec.resumeFromSec > 0 ? (total === null ? Math.round(rec.resumeFromSec) : Math.min(Math.round(rec.resumeFromSec), total)) : 0
    const pos = phaseAt(recPlan, recOffset + liveElapsedSeconds(rec))
    lastPhaseLabel.current = pos.phase.label
    lastBeep.current = -1
    lastWalkMinute.current = pos.phase.kind === 'work' ? Math.floor(pos.phaseElapsed / 60) : 0
    endCued.current = pos.done
    // Offer the sound-restore chip when we couldn't take a gesture (a running, unpaused resume).
    setNeedRestore(!viaGesture && rec.pausedAt === null)
    setStage('live')
    // Re-write the server row so a localStorage-only recovery becomes cross-device too (idempotent).
    pushActiveSession({
      kind: 'movement',
      practiceId: rec.practiceId,
      startedAt: rec.startedAt,
      pausedAt: rec.pausedAt,
      resumeFromSec: rec.resumeFromSec,
      secondsTarget: rec.secondsTarget,
      setup: rec.setup,
    })
    void acquireQuiet()
  }

  // Restore audio + screen on the next tap after an automatic resume. Best-effort; clears the chip.
  function restoreCues() {
    try {
      audio.current = audio.current ?? new AudioContext()
      void audio.current.resume()
    } catch {
      // cues are a nicety
    }
    void acquireQuiet()
    setNeedRestore(false)
  }

  // --- transitions ----------------------------------------------------------
  async function start() {
    // Single-owner guard: never arm a second warm-up/clock over a run already live on this instance.
    if (stage === 'live') return
    if (!practiceId) return
    // Unlock audio on the tap (autoplay policy only opens the context in a gesture).
    try {
      audio.current = audio.current ?? new AudioContext()
      void audio.current.resume()
    } catch {
      // the cues are a nicety, never a blocker
    }
    lastPhaseLabel.current = null
    lastBeep.current = -1
    lastWalkMinute.current = 0
    endCued.current = false
    setFlash(false)
    setNeedRestore(false)
    begunRef.current = false
    // A fresh run starts with a clean run-over gate: no confirmations, no prompt.
    confirmationsRef.current = []
    setRunOverPrompt(false)
    const now = Date.now()
    setStartedAt(now)
    setElapsed(0)
    // Open ARMED with the warm-up pre-roll (item #10): paused from the first millisecond, the
    // countdown ticks, then begin() unpauses. Same shape as the sit.
    setPausedAt(now)
    // The pre-roll length: the creator's authored warm-up (practice.warmupSec) when set, else the
    // member's own pre-roll pref (ADR-592), so an authored message has time to land.
    setPreroll(resolveWarmupSec(practice?.warmupSec, warmupSec))
    setStage('live')
    // Open the server-authoritative active session immediately (ADR-521), even through warm-up.
    pushActiveSession({
      kind: 'movement',
      practiceId: practice?.logsAs ?? practiceId,
      startedAt: now,
      pausedAt: now,
      resumeFromSec: resumeOffset,
      secondsTarget: typeof targetSec === 'number' ? targetSec : null,
      setup: { config },
    })
    void acquireQuiet()
  }

  // Begin the run now: end the pre-roll and unpause from the armed state (shift startedAt so elapsed
  // starts at zero). Called by the warm-up reaching 0.
  function begin() {
    // Fire the arm->begin handoff exactly once (see begunRef): the countdown reaching zero and a
    // Start tap in the same instant would otherwise each shift startedAt, starting a warm-up behind.
    if (begunRef.current) return
    begunRef.current = true
    setPreroll(null)
    if (pausedAt !== null) {
      const shifted = startedAt + (Date.now() - pausedAt)
      setStartedAt(shifted)
      resumeActiveSession(shifted)
    }
    setPausedAt(null)
  }

  function togglePause() {
    if (pausedAt === null) {
      const now = Date.now()
      setPausedAt(now)
      pauseActiveSession(now)
    } else {
      const shifted = startedAt + (Date.now() - pausedAt)
      setStartedAt(shifted)
      setPausedAt(null)
      resumeActiveSession(shifted)
    }
  }

  // This session's real airtime (seconds) right now, paused-adjusted.
  function currentElapsedSec(): number {
    return Math.max(0, Math.round(((pausedAt ?? Date.now()) - startedAt) / 1000))
  }

  // The member tapped "still here" on the run-over prompt: bank the elapsed up to now as a
  // confirmation, extending the logged ceiling and arming the next checkpoint one interval out.
  function confirmRunOver() {
    confirmationsRef.current = [...confirmationsRef.current, currentElapsedSec()]
    setRunOverPrompt(false)
    buzz(10)
  }

  // A checkpoint went a whole interval unanswered (walked away / tab left open / background return
  // past the deadline): AUTO-FINALIZE at the last confirmed point (or target), never the unattended
  // run-over. Absent member -> the current elapsed is NOT counted as a confirmation.
  function autoFinalizeRunOver() {
    if (finishing.current) return
    finishing.current = true
    const bankedThis = clampLoggedSeconds(gateTargetRef.current, currentElapsedSec(), confirmationsRef.current)
    const done = resumeOffset + Math.max(0, bankedThis)
    const seconds = finishCap === null ? done : Math.min(done, finishCap)
    // Unattended auto-finalize (ADR-627): the member walked away, so this is NOT attended airtime.
    void finishWith(Math.max(0, seconds), { attended: false })
  }

  async function finish() {
    if (finishing.current) return
    const e = pausedAt !== null ? (pausedAt - startedAt) / 1000 : (Date.now() - startedAt) / 1000
    // Warm-up / no-op guard: an end before ANY real airtime this session (still in the pre-roll, or
    // paused at zero) banks nothing — leave instead of writing a 0-second junk log or re-banking a
    // resume's already-counted time. A run that actually elapsed always has e > 0 here.
    if (Math.round(e) <= 0) {
      leave()
      return
    }
    finishing.current = true
    // The total banked = what an earlier partial already banked (resumeOffset, 0 for a fresh sit) +
    // this session's own elapsed, run-over-gated. A member who taps Stop is PRESENT, so their tap
    // confirms the elapsed up to now (appended to the confirmations) and the actual airtime banks;
    // the gate only bites the ABSENT paths. Under 150% of target the clamp is a no-op, so the happy
    // path is unchanged. Still capped so we never log more than the whole practice: a resume's cap
    // is the authored target, else the plan length; open-ended Play has neither so it banks raw.
    const el = Math.round(e)
    const bankedThis = clampLoggedSeconds(gateTargetRef.current, el, [...confirmationsRef.current, el])
    const done = resumeOffset + bankedThis
    const seconds = finishCap === null ? done : Math.min(done, finishCap)
    buzz(10)
    await finishWith(Math.max(0, seconds))
  }

  async function finishWith(
    seconds: number,
    opts?: {
      startedIso?: string
      practiceIdOverride?: string
      resumeFromSecOverride?: number
      movementModeOverride?: string
      // ADR-627 WAM: false on the unattended auto-finalize / over-deadline resume paths so the
      // run-over gate's clamp is recorded on the practice.verified event. Defaults to a present Stop.
      attended?: boolean
    },
  ) {
    // The run is ending: drop the crash-recovery cache + the server active session (completeSession
    // also clears the row server-side as the authoritative end).
    clearLiveSession('movement')
    clearActiveSession()
    setStage('saving')
    await releaseQuiet()
    const result = await completeSession({
      practiceId: opts?.practiceIdOverride ?? practice?.logsAs ?? practiceId,
      // A Movement sit is a real timed sit: it claims mode 'timer' so the economy +
      // timer-proof path runs unchanged. The movement mode tags the session row.
      mode: 'timer',
      pattern: null,
      seconds,
      resumeFromSec: opts?.resumeFromSecOverride ?? resumeOffset,
      // Overrides let the resume-path run-over finalize report the RECORD's own started_at /
      // banked / mode synchronously, before the resumed state has landed (see resumeFromRecord).
      startedAt: opts?.startedIso ?? new Date(startedAt).toISOString(),
      movementMode: opts?.movementModeOverride ?? plan.mode,
      attended: opts?.attended ?? true,
    })
    finishing.current = false
    if (isError(result)) {
      setStage('error')
      return
    }
    setPayload(result.data)
    setStage('reveal')
    // The leg completed (log saved). Signal the provider so a sequenced run (P6) can auto-advance
    // when the member dismisses the reveal — never on an early bail (leave() never runs this).
    onCompleted?.()
  }

  function leave() {
    // Leaving is an explicit exit: drop the crash-recovery cache + the server active session.
    clearLiveSession('movement')
    clearActiveSession()
    void exitAppFullscreen()
    if (onExit) {
      onExit()
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace('/feed')
  }

  function closeReveal() {
    setPayload(null)
    void exitAppFullscreen()
    setStage('setup')
    if (onExit) onExit()
    else router.replace('/feed')
  }

  // --- screens --------------------------------------------------------------

  if (stage === 'reveal' && payload) {
    const hasNext = !!queuePosition && queuePosition.index + 1 < queuePosition.total
    return (
      <Overlay>
        {/* Sequenced run (P6): a progress chip; when more remain, closing this rolls into the next. */}
        {queuePosition && (
          <div className="mx-auto shrink-0 rounded-full bg-surface-elevated px-3 py-1.5 text-center text-xs font-medium text-muted">
            Practice {queuePosition.index + 1} of {queuePosition.total}
            {hasNext ? ' · closing this starts the next' : ' · last one'}
          </div>
        )}
        {/* Completion economy line: a partial sit banks 1 Zap and clears the day; come
            back to finish for the rest. A top-up (finished) celebrates the rest landing.
            Plain, no shame, no em or en dashes (docs/CONTENT-VOICE.md). */}
        {payload.partial && (
          <div className="shrink-0 rounded-xl border border-success/40 bg-success-bg/30 px-4 py-2.5 text-center text-sm text-text">
            1 Zap now, and the day is logged. Finish the rest of it later for the full reward.
          </div>
        )}
        {payload.finished && (
          <div className="shrink-0 rounded-xl border border-success/40 bg-success-bg/30 px-4 py-2.5 text-center text-sm text-text">
            You finished it. The rest of the Zaps just landed.
          </div>
        )}
        <Reveal payload={payload} onClose={closeReveal} onAction={onLeaveViaLink ?? onExit} />
      </Overlay>
    )
  }

  if (stage === 'saving') {
    return (
      <Overlay>
        <CenterScreen>
          <MovementArt className="block h-10 animate-pulse" />
          <p className="text-sm font-medium text-muted">Counting it up...</p>
        </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'error') {
    return (
      <Overlay>
        <CenterScreen>
          <p className="text-sm font-medium text-text">That did not save. Your movement still happened.</p>
          <button
            type="button"
            onClick={() => {
              const done = resumeOffset + Math.round((Date.now() - startedAt) / 1000)
              void finishWith(Math.max(0, finishCap === null ? done : Math.min(done, finishCap)))
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Try again
          </button>
        </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'live') {
    // Read the plan from the resume offset: a "Finish Practice" resume picks the plan
    // up where the earlier partial left off; a fresh sit reads from 0.
    const pos = phaseAt(plan, resumeOffset + elapsed)
    const tone = phaseTone(pos.phase.kind)
    const paused = pausedAt !== null
    const ended = pos.done
    // The final-3s danger ring: a timed phase about to change rings danger so the
    // shift is felt before it lands. Open-ended Play never rings.
    const closing = pos.remaining !== null && pos.remaining > 0 && pos.remaining <= 3
    const clockText = pos.remaining === null ? fmt(pos.phaseElapsed) : fmt(pos.remaining)
    const warming = preroll !== null
    // The full session length the member is settling into (item #5). Shown below the timer through
    // the warm-up countdown and KEPT once the run begins. Open-ended Play has no fixed target.
    const planTotalSec = totalSeconds(plan)
    const targetLabel =
      planTotalSec !== null && planTotalSec > 0
        ? `${Math.max(1, Math.round(planTotalSec / 60))} min session`
        : plan.openEnded
          ? 'Open session'
          : null

    return (
      <Overlay flash={flash}>
        {/* The clock block centers vertically; the action bar docks at the bottom and
            stays visible (LAYOUT directive). Bottom padding keeps the last line clear of
            the docked bar so nothing (e.g. "Next: ...") ever sits under the button. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 pt-[max(3rem,env(safe-area-inset-top))] pb-6">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-move [animation-duration:3s]">
            <MovementArt className="block h-5" /> Get Moving
          </p>

          {/* ONE countdown (ADR-566): during the shared warm-up the RING itself shows the
              pre-roll count, with a "Warm up" label above it — the plan's phase/clock is
              suppressed so there is never a second competing number. Once the run begins the
              same ring runs the session (the phase chip + Next line return below). */}
          {warming ? (
            <>
              <p
                className="text-xs font-bold uppercase tracking-[0.3em] text-move"
                aria-live="polite"
              >
                Warm up
              </p>
              {/* The target the member is settling into, shown below the label through warm-up. */}
              {targetLabel && (
                <p className="text-sm tabular-nums text-subtle">
                  Settling into {targetLabel.replace(' session', '')}
                </p>
              )}
              <div className="flex h-56 w-56 items-center justify-center rounded-full ring-4 ring-move/40">
                <p className="text-7xl font-semibold tabular-nums text-move">{preroll}</p>
              </div>
              {/* The warm-up message (ADR-592): a Journey step's override (P5) wins over the
                  practice's own message; shown as the timer counts in. */}
              {(warmupMessageOverride ?? practice?.warmupMessage) ? (
                <p className="mt-1 max-w-sm text-balance text-base font-medium text-text/80">{warmupMessageOverride ?? practice?.warmupMessage}</p>
              ) : (
                // A fixed-height spacer matches the running screen's phase chip + Next lines so
                // the ring does not jump when the run begins.
                <div className="h-5" aria-hidden />
              )}
            </>
          ) : (
            <>
              {/* The full session length, kept below the header once the run begins. */}
              {targetLabel && (
                <p className="text-sm tabular-nums text-subtle">{targetLabel}</p>
              )}

              {/* The phase chip — color-coded, with the round counter for Strength. */}
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${tone.bg} ${tone.text}`}
              >
                {pos.phase.label}
                {plan.rounds > 1 && pos.phase.kind !== 'prepare' && (
                  <span className="ml-2 tabular-nums opacity-80">
                    Round {pos.round} of {plan.rounds}
                  </span>
                )}
              </span>

              {/* The big clock. A timed phase rings its ringed wash; the final 3s flips
                  the ring to danger. Play counts up with no ring. */}
              <div
                className={`flex h-56 w-56 items-center justify-center rounded-full ring-4 transition-colors ${
                  closing ? 'ring-danger/60' : tone.ring
                } ${ended ? 'opacity-60' : ''}`}
              >
                <p className={`text-7xl font-semibold tabular-nums ${closing ? 'text-danger' : tone.text}`}>
                  {clockText}
                </p>
              </div>

              {/* Next up — the line that lets the member anticipate the change. */}
              <p className="h-5 text-sm text-subtle">
                {ended ? 'Done' : pos.nextLabel ? `Next: ${pos.nextLabel}` : plan.openEnded ? 'Stop when you are done' : ' '}
              </p>
              {resumeOffset > 0 && (
                <p className="text-2xs text-subtle">Picking up where you left off.</p>
              )}
            </>
          )}
          {/* After an automatic resume, a small non-blocking chip to re-arm sound (item #4). */}
          {needRestore && (
            <button
              type="button"
              onClick={restoreCues}
              className="rounded-full border border-move/50 bg-move-bg/40 px-3 py-1.5 text-xs font-medium text-move transition-colors hover:bg-move-bg/60"
            >
              Tap to restore sound
            </button>
          )}
        </div>

        {/* Run-over confirmation gate: once a run passes 150% of its target, a gentle, non-blocking
            chip asks the member to confirm they are still moving. The clock keeps running; confirming
            banks the time to now and keeps logging. Left unanswered for a whole interval, the run
            auto-finalizes at the last confirmed point so an unattended run never inflates airtime.
            Voice: plain, no narrated feelings, no em dashes. */}
        {!warming && runOverPrompt && (
          <div className="mx-auto mb-2 w-full max-w-sm rounded-2xl border border-move/50 bg-move-bg/30 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-text">Still moving?</p>
            <p className="mt-0.5 text-xs text-muted">Confirm to keep logging.</p>
            <button
              type="button"
              onClick={confirmRunOver}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-move px-3.5 py-1.5 text-sm font-bold text-on-move transition-colors hover:bg-move-hover"
            >
              Still here
            </button>
          </div>
        )}
        {/* Docked action bar — always visible, even as the screen scrolls. Opaque canvas so
            the content above never shows through / overlaps it. */}
        <div className="sticky bottom-0 -mx-6 flex flex-col items-center gap-3 bg-canvas px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={() => {
              if (warming) { begin(); return } // skip the warm-up, begin now
              if (ended) {
                void finish()
                return
              }
              togglePause()
            }}
            className="min-w-44 rounded-full bg-primary px-10 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {warming ? 'Begin now' : ended ? 'Finish' : paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            className="rounded-full px-4 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
          >
            Stop &amp; Log
          </button>
          {/* Cancel: leave the run WITHOUT logging (item #3) — drops it, banks nothing. Subordinate
              to Stop & Log so the default stays "log it". */}
          <button
            type="button"
            onClick={leave}
            className="rounded-full px-4 py-1 text-2xs font-medium text-subtle transition-colors hover:text-danger"
          >
            Cancel · don&rsquo;t log
          </button>
        </div>
      </Overlay>
    )
  }

  // setup — pick the mode, then its preset, then Start.
  return (
    <Overlay>
      <div className={`flex flex-1 flex-col px-2 ${onModeChange ? '' : 'pt-10'}`}>
        {onModeChange ? (
          // The unified door: ONE masthead ("Mindless" + the locked tagline) and the Be Still | Get
          // Moving toggle directly under it. Get Moving is the active segment here (this is movement).
          <MindlessMasthead mode={doorMode ?? 'move'} onModeChange={onModeChange} onClose={leave} />
        ) : (
          // Standalone fallback (no door): the engine's own masthead, unchanged.
          <>
            <div className="relative flex items-center justify-center pb-2">
              <p className="flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] text-move">
                <MovementArt className="block h-6" /> Get Moving
              </p>
              <button
                type="button"
                onClick={leave}
                aria-label="Close"
                className="absolute -right-2 -top-1 rounded-full p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="pb-6 text-center text-xs text-subtle">Move on a timer. Walk, run, flow, train, stretch, or play.</p>
          </>
        )}

        {/* The setup body centers vertically in the viewport and scrolls when it
            overflows; the Start bar below stays docked and visible (LAYOUT directive). */}
        <div className="flex flex-1 flex-col justify-center gap-5 py-2">
        {/* Mode — the SAME display as the six Mindless modes (C.1): a 3-up grid of
            icon-over-label tiles. The chosen mode's blurb sits as a one-line subline
            below the grid (no narrated feelings, no em or en dashes). */}
        <div>
          <Label>Mode</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MOVEMENT_MODES.map((m) => (
              <ModeButton
                key={m.mode}
                active={m.mode === mode}
                onClick={() => setMode(m.mode)}
                icon={MODE_ICON[m.mode]}
                label={m.label}
              />
            ))}
          </div>
          <p className="mt-2 text-2xs text-subtle">
            {MOVEMENT_MODES.find((m) => m.mode === mode)?.blurb}
          </p>
        </div>

        {/* Per-mode preset / tuning */}
        {mode === 'walk' && (
          <div className="space-y-5">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {WALK_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === walkMinutes} onClick={() => setWalkMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${walkMinutes}m`}
                onLess={() => setWalkMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setWalkMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Reminders</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {WALK_INTERVAL_PRESETS.map((iv) => (
                  <Chip key={iv.value} active={iv.value === walkIntervalMin} onClick={() => setWalkIntervalMin(iv.value)}>
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A gentle chime on the minute, if you want a nudge.</p>
            </div>
          </div>
        )}

        {mode === 'run' && (
          <div className="space-y-5">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {RUN_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === runMinutes} onClick={() => setRunMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${runMinutes}m`}
                onLess={() => setRunMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setRunMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Split cues</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {RUN_INTERVAL_PRESETS.map((iv) => (
                  <Chip key={iv.value} active={iv.value === runIntervalMin} onClick={() => setRunIntervalMin(iv.value)}>
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A chime on the minute to mark your splits, if you want them.</p>
            </div>
          </div>
        )}

        {mode === 'yoga' && (
          <div>
            <Label>Flow</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {YOGA_PRESETS.map((y) => (
                <Chip key={y.kind} active={y.kind === yogaKind} onClick={() => setYogaKind(y.kind)} title={y.blurb}>
                  {y.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-subtle">
              {YOGA_PRESETS.find((y) => y.kind === yogaKind)?.blurb}
            </p>
          </div>
        )}

        {mode === 'stretch' && (
          <div className="space-y-5">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {STRETCH_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === stretchMinutes} onClick={() => setStretchMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${stretchMinutes}m`}
                onLess={() => setStretchMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setStretchMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Switch sides</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STRETCH_INTERVAL_PRESETS.map((iv) => (
                  <Chip
                    key={iv.value}
                    active={iv.value === stretchIntervalMin}
                    onClick={() => setStretchIntervalMin(iv.value)}
                  >
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A soft chime to switch sides, if you want one.</p>
            </div>
          </div>
        )}

        {mode === 'play' && (
          <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted">
            An open count-up. Start, move, and Stop when you are done.
          </div>
        )}

        {mode === 'strength' && (
          <div className="space-y-5">
            <div>
              <Label>Shape</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {STRENGTH_PRESETS.map((w) => (
                  <Chip key={w.kind} active={w.kind === strengthKind} onClick={() => pickStrength(w.kind)} title={w.blurb}>
                    {w.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">
                {STRENGTH_PRESETS.find((w) => w.kind === strengthKind)?.blurb}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Tune label="Work" value={`${workSec}s`} onLess={() => setWorkSec((s) => clampSeconds(s - 5))} onMore={() => setWorkSec((s) => clampSeconds(s + 5))} />
              <Tune label="Rest" value={restSec === 0 ? 'none' : `${restSec}s`} onLess={() => setRestSec((s) => Math.max(0, s - 5))} onMore={() => setRestSec((s) => Math.min(600, s + 5))} />
              <Tune label="Rounds" value={String(rounds)} onLess={() => setRounds((r) => clampRounds(r - 1))} onMore={() => setRounds((r) => clampRounds(r + 1))} />
            </div>
          </div>
        )}

        {/* The plan read-out + total. */}
        <p className="text-center text-xs text-subtle">
          {plan.label}
          {totalSeconds(plan) !== null && <span className="tabular-nums"> · {fmt(totalSeconds(plan)!)}</span>}
        </p>

        {/* Resume cue: when the resolved practice has a partial today this session picks up where it
            stopped. The plan is seeded to the target, so it ends at the target and runs only the
            remaining time. Surfaced so the setup makes the resume clear (it is no longer the full walk). */}
        {activeResume && remainingMin > 0 && (
          <p className="text-center text-xs font-semibold text-move">
            Continue Practice, {remainingMin} min left.
          </p>
        )}

        {/* Practice read-out (which log this banks). No picker: the door already resolved what to
            run. NEVER shown for the Free Practice fallback (a `logsAs` chip that maps to the Be
            Still meditation sit) — a Get Moving run must not advertise "Logs as One Small Reach"
            (item #1). Mirrors the Be Still guard in session.tsx. */}
        {practice && !practice.logsAs && (
          <p className="flex min-w-0 items-center justify-center gap-1.5 text-sm text-text">
            <span className="shrink-0 text-subtle">Logs as</span>
            <span className="truncate font-semibold">{practice.title}</span>
            {practice.loggedToday && <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
          </p>
        )}

        </div>

        {/* Docked Start bar — always visible, even as the setup body scrolls. The door already
            resolved the practice (no picker), so the button AUTO-STARTS it: "Continue Practice"
            when it has a partial today (resumes the remaining time), else "Start Practice". */}
        <div className="sticky bottom-0 -mx-6 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
          {practicedToday >= 3 && (
            <p className="pb-1.5 text-center text-2xs text-subtle">{practicedToday} members practiced today.</p>
          )}
          {/* The primary action (teal `move` accent, Get Moving's color). It AUTO-STARTS the
              resolved practice — pressing it arms the single warm-up countdown, then runs. */}
          <button
            type="button"
            onClick={() => void start()}
            disabled={!practiceId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-move px-4 py-3.5 text-sm font-bold text-on-move transition-colors hover:bg-move-hover disabled:opacity-50 lg:mx-auto lg:max-w-sm"
          >
            <OnAirIcon className="h-4 w-4" />{' '}
            {activeResume ? 'Continue Practice' : 'Start Practice'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// --- small setup atoms ------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</p>
}

/** A mode tile, matching the Mindless ModeButton (C.1): an icon over a label in a
 *  bordered, rounded chip that fills its grid cell. Move-toned (teal/blue) when active so
 *  Get Moving reads in its own accent that complements Be Still's amber (item #5). */
function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors ${
        active
          ? 'border-move/60 bg-move-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-xl border px-2 py-1.5 text-sm tabular-nums transition-colors ${
        active
          ? 'border-move/60 bg-move-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      {children}
    </button>
  )
}

function Stepper({
  label,
  onLess,
  onMore,
  className = '',
}: {
  label: string
  onLess: () => void
  onMore: () => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border border-border px-1.5 ${className}`}>
      <button
        type="button"
        onClick={onLess}
        aria-label="Less"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="text-sm font-semibold tabular-nums text-text">{label}</span>
      <button
        type="button"
        onClick={onMore}
        aria-label="More"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Tune({
  label,
  value,
  onLess,
  onMore,
}: {
  label: string
  value: string
  onLess: () => void
  onMore: () => void
}) {
  return (
    <div>
      <p className="mb-1 text-center text-2xs font-medium uppercase tracking-wider text-subtle">{label}</p>
      <Stepper label={value} onLess={onLess} onMore={onMore} />
    </div>
  )
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">{children}</div>
}

