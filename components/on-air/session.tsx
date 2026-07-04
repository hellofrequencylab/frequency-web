'use client'

// On Air — the session machine (ADR-229, docs/ON-AIR.md): setup → live → reveal.
//
// The live screen is the takeover: wake lock keeps the screen lit for the whole
// sit, fullscreen is requested best-effort on mobile, and the only control is a
// quiet End. Ending early carries zero shame copy — the log still counts; the
// practice is the unit, not the duration. "Just log" skips the timer entirely
// so On Air is never a tax on logging.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  Minus,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  BookOpen,
  Sparkles,
  Moon,
  Library,
} from 'lucide-react'
import { LotusIcon, BreatheIcon, BoltIcon, BellCueIcon, VibrationIcon, OnAirIcon } from './icons'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { chime, endChime, countBeep } from '@/lib/timer-audio'
import {
  AMBIENT_TRACKS,
  BELL_INTERVALS,
  BELL_TONES,
  BREATH_DURATION_PRESETS,
  BREATH_PATTERNS,
  CUSTOM_PHASE_MAX,
  CUSTOM_PHASE_MIN,
  DURATION_PRESETS,
  SESSION_MODE_META,
  SESSION_MODE_ORDER,
  WARMUP_PRESETS,
  ambientTrackBySlug,
  bellToneBySlug,
  bellVolumeScale,
  breathPositionAt,
  buildCustomPattern,
  clampMinutes,
  clampWarmupSec,
  engineForMode,
  isBreathMode,
  modeForMindless,
  modeHasNote,
  patternBySlug,
  type BellVolume,
  type BreathPattern,
  type BreathPhase,
  type OnAirPrefs,
  type RevealPayload,
  type SessionMode,
} from '@/lib/on-air'
import { createAmbient, type AmbientHandle } from '@/lib/on-air-ambient'
import { achievedTier, TIER_ORDER, TIER_LABELS, TIER_FLOOR_MIN } from '@/lib/practices/tiers'
import { BreathVisualizer } from './visualizer'
import { Reveal } from './reveal'
import { MindlessMasthead } from './mode-toggle'
import type { TimerMode } from './mindless'
import type { TimerKind, MindlessMode } from '@/lib/practices'
import type { MovementConfig } from '@/lib/movement'
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
import { FREE_SIT_ID } from '@/lib/on-air/session-data'

// What a saved Mindless run carries beyond the shared record fields: the mode + cue settings the
// live clock is rebuilt from. startedAt/pausedAt/practiceId/banked are on the record itself.
interface MindlessSetup {
  mode: SessionMode
  minutes: number
  patternSlug: string
  customIn: number
  customHold: number
  customOut: number
  bell: boolean
  bellToneSlug: string
  bellVolume: BellVolume
  endBell: boolean
  bellEveryMin: number
  haptics: boolean
  ambientTrack: string | null
  /** The chosen warm-up length (seconds), so a recovered run keeps its warm-up. Optional
   *  for back-compat with records written before warm-up was selectable. */
  warmupSec?: number
}

export interface OnAirPractice {
  id: string
  title: string
  loggedToday: boolean
  /** The partial-today resume point (the completion economy's partial): a banked-but-unfinished
   *  sit for THIS practice today. Non-null = the timer auto-resumes — it runs only the REMAINING
   *  time (target - banked) and reports the TOTAL so the server tops the log up. Null = a fresh sit.
   *  Set by lib/on-air/session-data; the engines recompute their resume from the SELECTED practice's
   *  value so a Zap-menu / chooser pick resumes just like the "Continue Practice" button does. */
  partialToday?: { bankedSec: number; targetSec: number } | null
  /** Typical length in minutes (the practice's duration_min). The timer defaults to it on select;
   *  null/undefined = open length (a free-length sit). */
  durationMin?: number | null
  /** When set, completing a session with this chip selected logs THIS practice id instead of the
   *  chip's own id — the "Free sit" chip maps to the default sit practice (lib/on-air/session-data). */
  logsAs?: string
  /** Which timer this practice routes to (lib/practices `timer_kind`): 'mindless' | 'movement' | 'none'.
   *  Drives `chooseAndStart`: mindless → the sit at `mindlessMode`; none → Just Log; movement → hand off
   *  to the Movement timer; a Free sit (open length) → an open timer. */
  timerKind?: TimerKind
  /** The Mindless sub-mode to open to when timerKind='mindless'
   *  (meditate | breathe | journal | stillness | ritual | log). Null → fall back to the prefs/default. */
  mindlessMode?: MindlessMode | null
  /** The Movement config (mode + tuning) when timerKind='movement'. */
  movementConfig?: MovementConfig | null
  /** Author locked the duration: members cannot change the minutes for this practice. */
  durationLocked?: boolean
}

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// --- saved setup (localStorage) ----------------------------------------------
// Remembers the member's last Mindless choices so re-opening the launcher picks
// up where they left off, even without finishing a sit. A best-effort nicety:
// any read/parse failure falls back to the prefs prop, never throws.
const SAVED_SETUP_KEY = 'fq_mindless_setup'

interface SavedSetup {
  mode: SessionMode
  patternSlug: string
  minutes: number
  customIn: number
  customHold: number
  customOut: number
}

/** Read the member's last-saved setup once. Returns null when absent, on the
 *  server, or when the stored value can't be parsed. */
function readSavedSetup(): Partial<SavedSetup> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SAVED_SETUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Partial<SavedSetup>
    return null
  } catch {
    return null
  }
}

// The interval bell + closing double-strike (chime / endChime) are the shared
// Web Audio cue engine in lib/timer-audio.ts — a soft bell/bowl voice with a
// gentle attack and a long ring-out, reused by the Movement timer. Imported above.

/** The takeover shell: while a session is live (and through the reveal) On Air
 *  owns the WHOLE viewport — above the app header and the bottom tab bar —
 *  until the member finishes or ends (P5). Sized in `dvh` (dynamic viewport
 *  height), not `inset-0`/`vh`: on mobile the address/tool bars shrink the
 *  *visible* area, so `dvh` fills exactly what the member can see and never
 *  hides the End controls behind the browser toolbar. (The browser's own chrome
 *  can't be removed by a web page on iOS Safari — that needs the installed PWA,
 *  manifest `display: standalone`.) */
function Overlay({ children, flash = false }: { children: React.ReactNode; flash?: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-5">{children}</div>
      {/* The warm-up "one" flash: a full-screen wash as the sit begins. Semantic tokens
          only (no hex); hidden entirely under prefers-reduced-motion (motion-reduce). */}
      {flash && (
        <div
          aria-hidden
          className="animate-warmup-flash pointer-events-none fixed inset-0 z-[70] bg-primary/40 motion-reduce:hidden"
        />
      )}
    </div>
  )
}

/** Vibration where supported (Android). iOS web has no vibration; never throw. */
function buzz(pulse: number | number[] = 15) {
  try {
    navigator.vibrate?.(pulse)
  } catch {
    // no vibration on this device
  }
}

// The live "go deeper" cue (ADR-443): once the target is reached the clock keeps
// counting (auto-continue), and this names the tier the time has EARNED so far plus
// the minutes that would reach the next one. Same achievedTier the economy pays on,
// so the in-session line never disagrees with the reveal. Voice: plain, specific, no
// narrated feelings, no em dashes. Returns null below the Light floor (nothing yet).
function liveDepthCue(engagedSec: number): { reached: string; toNext: string } | null {
  const tier = achievedTier(engagedSec)
  if (tier === 'partial') return null
  const rank = TIER_ORDER.indexOf(tier)
  const next = TIER_ORDER[rank + 1]
  if (!next) {
    return { reached: `You're at ${TIER_LABELS[tier]}.`, toNext: 'The deepest tier. Stay as long as you like.' }
  }
  const more = Math.max(1, Math.ceil(TIER_FLOOR_MIN[next] - engagedSec / 60))
  const unit = more === 1 ? 'minute' : 'minutes'
  return { reached: `You're at ${TIER_LABELS[tier]}.`, toNext: `${more} more ${unit} reaches ${TIER_LABELS[next]}.` }
}

/** The mode-button icons: the On Air kit marks for the sit modes, lucide for the rest. */
const MODE_ICON: Record<SessionMode, React.ElementType> = {
  timer: LotusIcon,
  breath: BreatheIcon,
  journal: BookOpen,
  stillness: Moon,
  ritual: Sparkles,
  log: BoltIcon,
}

export function OnAirSession({
  practices,
  defaultPracticeId,
  prefs,
  practicedToday = 0,
  resumeFromSec,
  secondsTarget,
  autoStart = false,
  resumeRecord,
  onExit,
  mode: doorMode,
  onModeChange,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at ≥3). */
  practicedToday?: number
  /** "Finish Practice" resume: seconds already banked on today's partial log. With
   *  `secondsTarget`, the timer runs only the REMAINING time and reports the TOTAL on
   *  completion so the server tops the log up to complete. */
  resumeFromSec?: number
  /** "Finish Practice" resume: the full target length in seconds (the practice's duration). */
  secondsTarget?: number
  /** A practice-SELECT launch: skip the setup screen and arm the countdown immediately, using the
   *  initial practice's routed mode + length. Off (the default) for the manual On Air entry points,
   *  which still open to setup. A 'log' (Just Log) practice or an empty list never auto-starts. */
  autoStart?: boolean
  /** The server-authoritative active session (ADR-521), fetched by MindlessProvider on load.
   *  When present and no localStorage record exists, the engine resumes it as RUNNING on mount
   *  (cross-device), never as a prompt. */
  resumeRecord?: LiveSessionRecord | null
  /** Overlay mode (the global Mindless launcher): when set, leaving the session
   *  CLOSES the overlay via this callback instead of navigating the router. The
   *  route page (/on-air) omits it, keeping its back/replace exit unchanged. */
  onExit?: () => void
  /** The unified-door mode this session is showing ('still'). Only meaningful with onModeChange. */
  mode?: TimerMode
  /** When provided (the unified Mindless door), the setup masthead renders the Be Still | Get
   *  Moving toggle wired to this. The standalone /on-air route omits it, so no toggle shows there
   *  and the sit behaves exactly as before. */
  onModeChange?: (mode: TimerMode) => void
}) {
  const [stage, setStage] = useState<Stage>('setup')
  const initialId =
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? ''
  // The resume point for a sit, in { bankedSec, targetSec }. The SELECTED practice's
  // `partialToday` is now the PRIMARY source (so a Zap-menu / chooser / auto-select all resume,
  // not just the "Continue Practice" button), recomputed whenever the selected practice changes.
  // The explicit resumeFromSec/secondsTarget open-args remain a fallback for the initial practice
  // (a /on-air?practice link, the streak box) when the loader hasn't attached a partial. Returns
  // null unless there's real remaining time, so anything malformed is a normal sit.
  function resolveResume(
    id: string,
  ): { bankedSec: number; targetSec: number } | null {
    const partial = practices.find((p) => p.id === id)?.partialToday
    if (partial && partial.targetSec > 0 && partial.targetSec - partial.bankedSec > 0) {
      return { bankedSec: Math.round(partial.bankedSec), targetSec: Math.round(partial.targetSec) }
    }
    // Fallback: the explicit resume args only apply to the practice the door opened on.
    if (
      id === initialId &&
      typeof resumeFromSec === 'number' &&
      typeof secondsTarget === 'number' &&
      secondsTarget > 0 &&
      resumeFromSec >= 0 &&
      secondsTarget - resumeFromSec > 0
    ) {
      return { bankedSec: Math.round(resumeFromSec), targetSec: Math.round(secondsTarget) }
    }
    return null
  }
  const initialResume = resolveResume(initialId)
  const resuming = initialResume !== null
  const resumeBankedSec = initialResume?.bankedSec ?? 0
  const resumeRemainingMin = initialResume
    ? clampMinutes(Math.ceil((initialResume.targetSec - initialResume.bankedSec) / 60))
    : 0
  // A practice's own length seeds the timer; no duration (or Free sit) falls back to the remembered
  // minutes (an open-length sit the member can still adjust).
  const durationFor = (id: string): number => {
    const d = practices.find((p) => p.id === id)?.durationMin
    return d && d > 0 ? clampMinutes(d) : prefs.minutes
  }
  // The mode a practice OPENS to, routed by its timer_kind (not by whether it has a length):
  //   none     → Just Log (no countdown)
  //   movement → handed off to the Movement timer (handled in chooseAndStart; here it falls
  //              back to the saved/prefs mode for the rare in-place select)
  //   mindless → the sit at the practice's mindless_mode (or the saved/prefs mode, then Meditate)
  // A Free sit (mindless + open length) opens the plain timer, never Just Log.
  const modeForPractice = (id: string): SessionMode => {
    const p = practices.find((x) => x.id === id)
    if (!p) return saved?.mode ?? prefs.mode
    if (p.timerKind === 'none') return 'log'
    // The practice's authored flavour wins; null falls back to the member's saved/prefs mode,
    // then Meditate. A Free sit (mindlessMode null, no length) lands on the plain timer.
    const fallback = (saved?.mode ?? prefs.mode) as SessionMode
    const resolved = modeForMindless(p.mindlessMode, fallback)
    // Just Log is only the opening mode for a 'none' practice; a mindless practice that stored
    // 'log' as its flavour still gets a real timer here (the sit is the point).
    return resolved === 'log' ? 'timer' : resolved
  }
  const [practiceId, setPracticeId] = useState(initialId)
  // Last-saved setup (localStorage) seeds the initial choices, falling back to the prefs prop.
  // Read once on mount (lazy initializer); the WRITE happens in an effect below.
  const [saved] = useState(readSavedSetup)
  // The opening mode is routed by the initial practice's timer_kind (item #2). A resume always
  // opens the silent timer to run the remaining time.
  const [mode, setMode] = useState<SessionMode>(
    resuming ? 'timer' : modeForPractice(initialId),
  )
  // A resume runs the REMAINING time; otherwise a practice's own length wins, then the saved
  // minutes, then the remembered open length. A locked practice always uses its length.
  const [minutes, setMinutes] = useState(() => {
    if (resuming) return resumeRemainingMin
    const d = practices.find((p) => p.id === initialId)?.durationMin
    if (d && d > 0) return clampMinutes(d)
    return saved?.minutes != null ? clampMinutes(saved.minutes) : prefs.minutes
  })
  // The optional free-text note: Journal shows it on the live screen (write while you sit), Just
  // Log on the setup screen (capture the interaction before logging). Captured client-side and
  // kept across the session; persistence rides a later completeSession field (the action is owned
  // elsewhere). Never required.
  const [note, setNote] = useState('')
  const [patternSlug, setPatternSlug] = useState(saved?.patternSlug ?? prefs.pattern)
  const [customIn, setCustomIn] = useState(saved?.customIn ?? prefs.customIn ?? 4)
  const [customHold, setCustomHold] = useState(saved?.customHold ?? prefs.customHold ?? 4)
  const [customOut, setCustomOut] = useState(saved?.customOut ?? prefs.customOut ?? 6)
  const [bell, setBell] = useState(prefs.bell ?? false)
  const [bellToneSlug, setBellToneSlug] = useState(prefs.bellTone ?? 'soft')
  const [bellVolume, setBellVolume] = useState<BellVolume>(prefs.bellVolume ?? 'medium')
  const [endBell, setEndBell] = useState(prefs.endBell ?? true)
  const [bellEveryMin, setBellEveryMin] = useState(prefs.bellEveryMin ?? 1)
  const [haptics, setHaptics] = useState(prefs.haptics ?? false)
  const [ambientSlug, setAmbientSlug] = useState<string | null>(prefs.ambientTrack ?? null)
  // The warm-up countdown length (3 / 5 / 10s), selectable on setup. Seeds from prefs.
  const [warmupSec, setWarmupSec] = useState(() => clampWarmupSec(prefs.warmupSec))
  // Mobile-only: the cue settings collapse so the primary controls (mode, minutes, Tune out) stay
  // above the fold on a phone. Always expanded on desktop (the two-column layout has the room).
  const [cuesOpen, setCuesOpen] = useState(false)
  // The pattern how-to popup (setup + live): the full instructions for the current pattern.
  const [showInstructions, setShowInstructions] = useState(false)
  // Whether the member has ANY real adopted practice (anything beyond the synthetic Free Practice
  // chip). Only then is there something to choose, so only then does a generic open prompt them to
  // "Select Practice" rather than auto-committing to Free Practice.
  const hasRealPractices = practices.some((p) => p.id !== FREE_SIT_ID)
  // Distinguish an AUTO-DEFAULT (a generic open landed on Free Practice) from an EXPLICIT selection
  // (opened pre-set to a specific practice, the chooser pick, the "Change" re-pick). On a generic
  // open the engine sits on the Free Practice default, so the primary button reads "Select Practice"
  // (and opens the chooser) until the member explicitly picks one. Initialized true when the door
  // opened on a real practice id (Continue Practice, a practice page, a Journey step).
  const [explicitlySelected, setExplicitlySelected] = useState(
    !!defaultPracticeId && defaultPracticeId !== FREE_SIT_ID,
  )
  // The practice chooser sheet (C.5): with more than one adopted practice the primary
  // button reads "Select a practice" and opens this; picking one seeds its preset and
  // begins the sit. With one/zero practices there's nothing to choose, so it never shows.
  const [showChooser, setShowChooser] = useState(false)
  const router = useRouter()
  const [startedAt, setStartedAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  // Auto-continue (ADR-443): once the countdown hits zero the clock keeps running and
  // this tracks the seconds banked PAST the target, so the live screen can count up and
  // the deeper time earns its tier. 0 until the target is reached.
  const [overtime, setOvertime] = useState(0)
  // Paused = the wall-clock moment the member tapped Pause; resuming shifts
  // startedAt forward by the pause length, so every elapsed-based read (clock,
  // cues, visualizer) continues seamlessly and pauses never count as airtime.
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  // The 5s auto-start countdown shown before a sit begins (P14). null = not counting; the Start
  // button overrides it (begin() now).
  const [preroll, setPreroll] = useState<number | null>(null)
  // The full-screen warm-up flash as the "one" count lands (item #8). Auto-clears.
  const [flash, setFlash] = useState(false)
  // After an AUTOMATIC (no-gesture) resume, audio + wake lock can't re-acquire without a tap.
  // The clock resumes immediately; this shows a small non-blocking "Tap to restore sound" chip
  // when sound was configured, so the member can re-arm it. Cleared on the tap (item #4).
  const [needRestore, setNeedRestore] = useState(false)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const ambient = useRef<AmbientHandle | null>(null)
  const lastPhase = useRef<BreathPhase | null>(null)
  const lastMinute = useRef(0)
  const endCued = useRef(false)
  // Seconds already banked on a resumed partial sit. The clock runs the remaining time, then
  // finishWith reports resumeBanked + this session's elapsed so the server tops the log up to full.
  const resumeBanked = useRef(resumeBankedSec)
  // The full target of the resumed partial (its authored duration in seconds). Drives the
  // crash-recovery record's secondsTarget so a recovered top-up still tops up to full. 0 = not a
  // resume. Re-seeded whenever the selected practice changes (selectPractice / finishTheRest).
  const resumeTarget = useRef(initialResume?.targetSec ?? 0)

  const pattern = useMemo(
    () =>
      patternSlug === 'custom'
        ? buildCustomPattern(customIn, customHold, customOut)
        : patternBySlug(patternSlug),
    [patternSlug, customIn, customHold, customOut],
  )
  const practice = practices.find((p) => p.id === practiceId)
  // Which timer the selected practice routes to. A 'none' practice is log-only; everything else
  // ('mindless', including the Free sit's open length) can run the timed modes. This is the
  // timer_kind gate (item #2), NOT "does it have a duration_min" — a Free sit has no length but
  // still opens a real timer.
  const practiceKind = practice?.timerKind ?? 'mindless'
  const practiceCanTime = practiceKind !== 'none'
  // The author pinned the length: the minutes editor is hidden + locked to the practice's length.
  const durationLocked = !!practice?.durationLocked && (practice?.durationMin ?? 0) > 0
  // The SELECTED practice's resume point (its partial today, or the open-arg fallback). Drives the
  // "Continue Practice" label + the remaining-time read-out, recomputed as the pick changes. Only a
  // timed practice resumes — a 'none' (log-only) practice has no countdown to continue.
  const activeResume = practiceCanTime ? resolveResume(practiceId) : null
  const activeResumeRemainingMin = activeResume
    ? clampMinutes(Math.ceil((activeResume.targetSec - activeResume.bankedSec) / 60))
    : 0
  // "Select Practice" state: the member has a real practice to choose AND hasn't explicitly picked
  // one yet (a generic open auto-defaulted to Free Practice). The primary button then opens the
  // chooser instead of starting. With only Free Practice (nothing to choose) it never triggers.
  // Just Log keeps its own "Log it" label/behavior, so it overrides this in the label below.
  const needsSelect = hasRealPractices && !explicitlySelected

  // Pick a practice + seed its opening mode + length, routed by timer_kind (item #2). A 'none'
  // practice opens Just Log; a mindless practice (Free sit included) opens its sit mode. Movement
  // is handed off in chooseAndStart before this runs, so it never lands here.
  //
  // When the picked practice has a partial today, this is a RESUME: open the silent timer, seed
  // the minutes to the REMAINING time, and arm the banked/target refs so finish() reports the
  // total. So a Zap-menu / chooser pick of a partial resumes the same as the Continue button.
  function selectPractice(id: string) {
    setPracticeId(id)
    const resume = resolveResume(id)
    if (resume) {
      const remainingMin = clampMinutes(Math.ceil((resume.targetSec - resume.bankedSec) / 60))
      setMinutes(remainingMin)
      setMode('timer')
      resumeBanked.current = resume.bankedSec
      resumeTarget.current = resume.targetSec
      return
    }
    setMinutes(durationFor(id))
    setMode(modeForPractice(id))
    // Switching to a NON-partial practice abandons any in-flight resume top-up so it can never
    // apply to the wrong practice (a fresh sit reports only its own seconds).
    resumeBanked.current = 0
    resumeTarget.current = 0
  }

  // --- takeover plumbing ----------------------------------------------------

  async function acquireQuiet() {
    try {
      wakeLock.current = await (navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
      }).wakeLock?.request('screen') ?? null
    } catch {
      // wake lock is progressive enhancement
    }
    // True fullscreen on every device now, not just mobile (C.1-3): the live sit
    // owns the whole screen. Best-effort — iOS Safari no-ops and the dvh takeover
    // is the fallback. Gesture-gated, so this only lands when acquireQuiet runs
    // from the Start tap; the visibility re-acquire path just no-ops if denied.
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

  // Fullscreen is requested from the click that OPENS this surface — the launcher's
  // open gesture (Mindless overlay / Capture) and, once a sit goes live, acquireQuiet
  // from the Start tap (C.1-3). It is gesture-gated, so a passive setup-stage effect
  // could never enter it reliably; the dvh takeover above covers any device that
  // denies (iOS Safari). On leave, exitAppFullscreen drops it.

  // Remember the member's setup choices for next time (localStorage). Best-effort:
  // a write is the only side effect here, so it never trips set-state-in-effect.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const setup: SavedSetup = { mode, patternSlug, minutes, customIn, customHold, customOut }
      window.localStorage.setItem(SAVED_SETUP_KEY, JSON.stringify(setup))
    } catch {
      // saving setup is a nicety, never a blocker
    }
  }, [mode, patternSlug, minutes, customIn, customHold, customOut])

  // --- the clock --------------------------------------------------------------

  useEffect(() => {
    if (stage !== 'live') return
    const total = minutes * 60
    const id = setInterval(() => {
      if (pausedAt !== null) return
      const elapsed = (Date.now() - startedAt) / 1000
      const left = Math.max(0, total - elapsed)
      setRemaining(left)
      // Past the target the clock keeps counting (auto-continue): bank the overtime so the
      // live screen counts up and the deeper time earns its tier.
      setOvertime(elapsed > total ? Math.floor(elapsed - total) : 0)
      // Cues: a phase-change ding/tap in breath mode, an interval ding on the
      // timer (Meditate). At zero the end bell rings ONCE and the screen waits —
      // the member collects with Finish in their own time (P10), no auto-advance.
      const vol = bellVolumeScale(bellVolume)
      if (left > 0) {
        if (mode === 'breath') {
          const { phase } = breathPositionAt(pattern, elapsed)
          if (lastPhase.current && phase !== lastPhase.current) {
            if (bell) chime(audio.current, bellToneBySlug(bellToneSlug), vol)
            if (haptics) buzz(15)
          }
          lastPhase.current = phase
        } else {
          const minute = Math.floor(elapsed / 60)
          if (minute > lastMinute.current) {
            lastMinute.current = minute
            // The interval bell: only when enabled and this minute lands on a
            // multiple of the chosen interval (bellEveryMin 0 = off).
            if (bell && bellEveryMin > 0 && minute % bellEveryMin === 0) {
              chime(audio.current, bellToneBySlug(bellToneSlug), vol)
            }
          }
        }
      } else if (!endCued.current) {
        endCued.current = true
        if (bell && endBell) endChime(audio.current, bellToneBySlug(bellToneSlug), vol)
        if (haptics) buzz([30, 80, 30])
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, startedAt, minutes, pausedAt])

  // Let the audio context go when the surface unmounts.
  useEffect(() => {
    const ctx = audio
    const amb = ambient
    return () => {
      try {
        amb.current?.stop()
      } catch {
        // ambience is a nicety
      }
      amb.current = null
      try {
        void ctx.current?.close()
      } catch {
        // already closed
      }
      ctx.current = null
    }
  }, [])

  // --- ambient loop (lib/on-air-ambient) ------------------------------------
  // An optional soft background that loops seamlessly for the whole sit, sharing
  // the bell's gesture-unlocked AudioContext. Every call is wrapped; like the
  // bell, the ambience is a nicety, never a blocker.

  /** The shared bell/ambient context, created + unlocked lazily inside a gesture. */
  function ensureCtx(): AudioContext | null {
    try {
      audio.current = audio.current ?? new AudioContext()
      void audio.current.resume()
      return audio.current
    } catch {
      return null
    }
  }

  function stopAmbient() {
    try {
      ambient.current?.stop()
    } catch {
      // ambience is a nicety
    }
    ambient.current = null
  }

  function playAmbient(slug: string | null, fadeInSec: number, autoStopAfterSec?: number) {
    stopAmbient()
    if (!slug) return
    const track = ambientTrackBySlug(slug)
    const ctx = ensureCtx()
    if (!track || !ctx) return
    ambient.current = createAmbient(ctx, track.src, { fadeInSec, autoStopAfterSec })
  }

  /** Setup chip tap: select + a short audition that fades out on its own, so the
   *  sit always opens from silence (the opening fade-in starts fresh in start()). */
  function selectAmbient(slug: string | null) {
    setAmbientSlug(slug)
    if (slug) playAmbient(slug, 1, 4.5)
    else stopAmbient()
  }

  // The warm-up pre-roll (item #7-9): tick down once a second, then begin() automatically. Each
  // second buzzes (a tick pulse, a stronger pulse on "one") and optionally beeps; the "one" count
  // fires the full-screen flash as the sit begins. Re-runs each tick with a fresh closure, so
  // begin() reads the current armed pausedAt. The Start button calls begin() directly to skip ahead.
  useEffect(() => {
    if (stage !== 'live' || preroll === null) return
    if (preroll <= 0) {
      begin()
      return
    }
    // This warm-up second's cue: a stronger pulse + flash on the final "one", a tick otherwise.
    const isOne = preroll === 1
    if (haptics) buzz(isOne ? [30, 80, 30] : 15)
    if (bell) countBeep(audio.current, 1, isOne)
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

  // --- transitions -------------------------------------------------------------

  // The mode the running sit was started with — kept in a ref so finishWith reports the right
  // mode + pattern even when start() ran from an override (the chooser's same-tick pick), before
  // the mode state write has landed.
  const activeModeRef = useRef<SessionMode>(mode)

  // The MindlessSetup payload the crash-recovery record + the server active session are rebuilt
  // from. Takes the running minutes (start() passes its override before the state write lands).
  function buildMindlessSetup(runMinutes: number): MindlessSetup {
    return {
      mode: activeModeRef.current,
      minutes: runMinutes,
      patternSlug,
      customIn,
      customHold,
      customOut,
      bell,
      bellToneSlug,
      bellVolume,
      endBell,
      bellEveryMin,
      haptics,
      ambientTrack: ambientSlug,
      warmupSec,
    }
  }

  // --- persistence + global resume (lib/on-air/live-session + active-session) ------
  // On mount, if a sit is already running, RESUME IT AS RUNNING (ADR-521) — never a prompt. The
  // localStorage record is the fast same-browser cache; the server-authoritative `resumeRecord`
  // (fetched by MindlessProvider) carries the run CROSS-DEVICE. Either one re-opens the engine and
  // computes elapsed from the wall-clock startedAt. The auto path re-acquires audio/screen only
  // best-effort (no gesture), surfacing a small "Tap to restore sound" chip if needed.
  useEffect(() => {
    const rec =
      loadLiveSession<MindlessSetup>('mindless') ??
      (resumeRecord as LiveSessionRecord<MindlessSetup> | null) ??
      null
    if (rec) resumeFromRecord(rec, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AUTO-START (a practice-select launch): skip the setup screen and arm the countdown immediately,
  // on the initial practice's routed mode + minutes (both already seeded in state above). Fires ONCE
  // on mount, and only when there's a real practice to run, the routed mode is a real timer (never
  // Just Log), and no crash-recovered sit is waiting (that surfaces its own Resume prompt and must
  // win). Manual On Air entry points pass autoStart=false, so they still open to setup unchanged.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    // A recovered / server-active sit owns the screen (it auto-resumes running above).
    if (loadLiveSession<MindlessSetup>('mindless') || resumeRecord) return
    if (!initialId) return
    if (mode === 'log') return // a Just Log practice has no countdown to auto-run
    void start({ practiceId: initialId, mode, minutes })
    // Run once on mount; the initial mode/minutes are the seeded state for the launched practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While a sit is live (INCLUDING warm-up, so a reset during the pre-roll still recovers — item
  // #5), persist the localStorage cache on every state change + a 30s heartbeat. The wall-clock
  // startedAt is what lets a reload recover the exact elapsed. The SERVER active session is written
  // from the lifecycle transitions (start / begin / pause / resume), not this heartbeat. Cleared on
  // finish / leave.
  useEffect(() => {
    if (stage !== 'live') return
    const write = () =>
      saveLiveSession<MindlessSetup>({
        kind: 'mindless',
        startedAt,
        pausedAt,
        practiceId: practice?.logsAs ?? practiceId,
        resumeFromSec: resumeBanked.current,
        // The live resume target tracks the SELECTED practice (selectPractice / finishTheRest /
        // the open-arg fallback), not just the open-arg, so a chooser-picked partial recovers right.
        secondsTarget: resumeTarget.current > 0 ? resumeTarget.current : null,
        setup: buildMindlessSetup(minutes),
      })
    write()
    const id = setInterval(write, 30_000)
    return () => clearInterval(id)
    // buildMindlessSetup closes over exactly the primitive cue/mode deps already listed here, so
    // listing it (a per-render function) would only thrash the effect. Deps are complete otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stage,
    startedAt,
    pausedAt,
    practiceId,
    practice,
    minutes,
    patternSlug,
    customIn,
    customHold,
    customOut,
    bell,
    bellToneSlug,
    bellVolume,
    endBell,
    bellEveryMin,
    haptics,
    ambientSlug,
    warmupSec,
  ])

  // Resume a recovered sit: rebuild the mode + cue settings, restore the exact wall clock, and seed
  // the cue trackers to the current position so nothing already passed re-fires. Audio + wake lock
  // are re-acquired on this tap (a gesture), so the screen re-locks like a fresh start.
  //
  // `viaGesture` = the resume rides a user tap (audio + wake lock can re-acquire). The global
  // auto-resume on load passes false: the clock resumes immediately, but audio/screen can only
  // re-acquire best-effort, so a "Tap to restore sound" chip is offered when sound was configured.
  function resumeFromRecord(rec: LiveSessionRecord<MindlessSetup>, viaGesture = true) {
    const s = rec.setup
    if (viaGesture && s.bell) {
      try {
        audio.current = audio.current ?? new AudioContext()
        void audio.current.resume()
      } catch {
        // cues are a nicety
      }
    }
    setPracticeId(rec.practiceId)
    setMode(s.mode)
    activeModeRef.current = s.mode
    setMinutes(s.minutes)
    setPatternSlug(s.patternSlug)
    setCustomIn(s.customIn)
    setCustomHold(s.customHold)
    setCustomOut(s.customOut)
    setBell(s.bell)
    setBellToneSlug(s.bellToneSlug)
    setBellVolume(s.bellVolume)
    setEndBell(s.endBell)
    setBellEveryMin(s.bellEveryMin)
    setHaptics(s.haptics)
    setAmbientSlug(s.ambientTrack)
    setWarmupSec(clampWarmupSec(s.warmupSec))
    // Re-arm ambience only on a gesture (audio needs a tap to unlock). On an auto-resume the
    // chip below restores it. A quick fade-in since the sit is already mid-flight.
    if (viaGesture) playAmbient(s.ambientTrack, 1.5)
    resumeBanked.current = rec.resumeFromSec
    resumeTarget.current = rec.secondsTarget ?? 0
    const total = s.minutes * 60
    const elapsed = liveElapsedSeconds(rec)
    setStartedAt(rec.startedAt)
    setPausedAt(rec.pausedAt)
    setPreroll(null)
    setRemaining(Math.max(0, total - elapsed))
    lastPhase.current = null
    lastMinute.current = Math.floor(elapsed / 60)
    endCued.current = total - elapsed <= 0
    // Offer the sound-restore chip only when audio was configured AND we couldn't take a gesture.
    setNeedRestore(!viaGesture && (s.bell || !!s.ambientTrack) && rec.pausedAt === null)
    setStage('live')
    // Re-write the server row so a localStorage-only recovery becomes cross-device too (idempotent).
    pushActiveSession({
      kind: 'mindless',
      practiceId: rec.practiceId,
      startedAt: rec.startedAt,
      pausedAt: rec.pausedAt,
      resumeFromSec: rec.resumeFromSec,
      secondsTarget: rec.secondsTarget,
      setup: s,
    })
    void acquireQuiet()
  }

  // Restore audio + screen on the next tap after an automatic resume (the gesture the auto path
  // couldn't take). Best-effort; clears the chip regardless.
  function restoreCues() {
    ensureCtx()
    playAmbient(ambientSlug, 1.2)
    void acquireQuiet()
    setNeedRestore(false)
  }

  // Begin a sit. The chooser (C.5) passes an override so a freshly picked practice
  // starts on ITS preset (mode + duration_min) the same tick it's selected, without
  // waiting for selectPractice's state writes to land. No override = the current
  // setup state (the footer button's path).
  async function start(override?: { practiceId: string; mode: SessionMode; minutes: number }) {
    const activeId = override?.practiceId ?? practiceId
    const activeMode = override?.mode ?? mode
    const activeMinutes = override?.minutes ?? minutes
    if (!activeId) return
    activeModeRef.current = activeMode
    if (activeMode === 'log') {
      void finishWith(0, null, override?.practiceId, activeMode)
      return
    }
    if (bell) {
      // Lazily, on the tap: autoplay policy only unlocks audio in a gesture.
      try {
        audio.current = audio.current ?? new AudioContext()
        void audio.current.resume()
      } catch {
        // the bell is a nicety, never a blocker
      }
    }
    // Ambience fades in as the takeover opens — it sets the room through the
    // pre-roll while the member settles, then carries through the whole sit.
    playAmbient(ambientSlug, 3)
    lastPhase.current = null
    lastMinute.current = 0
    endCued.current = false
    // The live screen opens ARMED with a 5s auto-start countdown (P14): the clock sits paused at
    // zero, a "Starting in N" pre-roll ticks down, then begin() unpauses automatically. The Start
    // button overrides the countdown to begin now. Arming is a pause from the first millisecond, so
    // the existing Start <-> Pause machinery (and the airtime math) needs nothing new.
    const now = Date.now()
    setStartedAt(now)
    setPausedAt(now)
    setRemaining(activeMinutes * 60)
    setOvertime(0)
    setFlash(false)
    setNeedRestore(false)
    setPreroll(warmupSec)
    setStage('live')
    // Open the server-authoritative active session immediately (armed/paused through warm-up), so a
    // reset even during warm-up recovers, cross-device (ADR-521). resumeTarget mirrors a top-up.
    pushActiveSession({
      kind: 'mindless',
      practiceId: practice?.logsAs ?? activeId,
      startedAt: now,
      pausedAt: now,
      resumeFromSec: resumeBanked.current,
      secondsTarget: resumeTarget.current > 0 ? resumeTarget.current : null,
      setup: buildMindlessSetup(activeMinutes),
    })
    void acquireQuiet()
  }

  // Hand a Movement practice off to the Get Moving engine. The sit + the movement engine now share
  // ONE door (the unified Mindless overlay), so picking a movement practice here just SWITCHES the
  // door's mode to 'move' (the data is already loaded, so the swap is instant and no second overlay
  // opens). The standalone /on-air route has no door (onModeChange absent); there a movement pick is
  // a no-op handled by the chooser only offering sit practices in practice, so we simply close it.
  function handOffToMovement(id: string) {
    void id
    setShowChooser(false)
    if (onModeChange) {
      onModeChange('move')
      return
    }
    // No unified door (the standalone route): nothing to hand off to. Close the chooser and stay.
  }

  // The chooser pick (C.5) + the THE BUG fix (item #2): route by the practice's timer_kind, not
  // by whether it has a duration_min.
  //   movement → close Mindless + hand off to the Movement timer (the only kind that still leaves
  //              this engine, so it acts on the pick immediately)
  //   none / mindless → SELECT the practice + close the sheet, then RETURN to the setup. The
  //              member taps the primary button (now "Start Practice", or "Continue Practice" for a
  //              partial) to actually begin. The chooser no longer auto-starts (owner UX directive).
  function chooseAndStart(id: string) {
    const picked = practices.find((p) => p.id === id)
    const kind = picked?.timerKind ?? 'mindless'
    if (kind === 'movement') {
      handOffToMovement(id)
      return
    }
    // selectPractice seeds the mode + minutes (and the resume, for a partial) so the setup is
    // ready for the primary button. modeForPractice never returns 'log' for a mindless practice,
    // so a Free sit lands on the timer; a 'none' practice opens to Just Log.
    selectPractice(id)
    // The pick is an explicit selection: from here the primary button STARTS (or continues) it,
    // never "Select Practice". Stays explicit through any later "Change" re-pick.
    setExplicitlySelected(true)
    setShowChooser(false)
  }

  // Begin the sit now: end the pre-roll and unpause from the armed state (shift startedAt by the
  // armed span so elapsed starts at zero). Called by the 5s countdown reaching 0 or the Start button.
  function begin() {
    setPreroll(null)
    if (pausedAt !== null) {
      const shifted = startedAt + (Date.now() - pausedAt)
      setStartedAt(shifted)
      // The warm-up ends: unpause the server active session at the shifted wall clock (ADR-521).
      resumeActiveSession(shifted)
    }
    setPausedAt(null)
  }

  function togglePause() {
    if (pausedAt === null) {
      const now = Date.now()
      setPausedAt(now)
      ambient.current?.pause()
      pauseActiveSession(now)
    } else {
      const shifted = startedAt + (Date.now() - pausedAt)
      setStartedAt(shifted)
      setPausedAt(null)
      ambient.current?.resume()
      resumeActiveSession(shifted)
    }
  }

  async function finish(early: boolean) {
    if (finishing.current) return
    finishing.current = true
    // The end bell already rang when the clock hit zero; an early Close Session
    // gets a small ack tap only. Paused time never counts as airtime.
    const elapsedMs = (pausedAt ?? Date.now()) - startedAt
    const actual = Math.max(0, Math.round(elapsedMs / 1000))
    // Auto-continue (ADR-443): a full Finish banks the ACTUAL time, so a sit that ran past
    // its target earns the deeper tier. Floored at the target so a finish a beat early never
    // reads as a partial. An early Close banks exactly what was sat (may be a partial).
    const thisSession = early ? actual : Math.max(minutes * 60, actual)
    // A resume runs the REMAINING time; report the TOTAL (banked + this session) so the server
    // tops the partial log up to its full target. A fresh sit has resumeBanked = 0.
    const seconds = resumeBanked.current + thisSession
    if (haptics && early) buzz(10)
    await finishWith(seconds, new Date(startedAt).toISOString(), undefined, activeModeRef.current)
  }

  async function finishWith(
    seconds: number,
    startedIso: string | null,
    practiceIdOverride?: string,
    modeOverride?: SessionMode,
  ) {
    // The sit is ending: drop the crash-recovery cache + the server active session (completeSession
    // also clears the row server-side as the authoritative end).
    clearLiveSession('mindless')
    clearActiveSession()
    stopAmbient()
    setStage('saving')
    await releaseQuiet()
    // The chooser can finish a freshly picked log-only practice the same tick it's
    // selected, before practiceId state lands — resolve the override against the list
    // so its Free-sit mapping (logsAs) still holds.
    const resolved = practiceIdOverride
      ? practices.find((p) => p.id === practiceIdOverride) ?? practice
      : practice
    // The mode the sit actually ran (override wins over possibly-stale state). The server gates
    // the economy on mode !== 'log' and only stamps pattern for breath, so reporting the real
    // mode keeps the timed/breath/log paths correct.
    const sentMode = modeOverride ?? mode
    const result = await completeSession({
      // A Free sit logs the default sit practice (chip.logsAs); every real practice logs itself.
      practiceId: resolved?.logsAs ?? practiceIdOverride ?? practiceId,
      mode: sentMode,
      pattern: patternSlug,
      seconds,
      resumeFromSec: resumeBanked.current,
      startedAt: startedIso,
      customIn,
      customHold,
      customOut,
      bell,
      bellTone: bellToneSlug,
      bellVolume,
      endBell,
      bellEveryMin,
      haptics,
      ambientTrack: ambientSlug,
      warmupSec,
    })
    finishing.current = false
    if (isError(result)) {
      setStage('error')
      return
    }
    setPayload(result.data)
    setStage('reveal')
  }

  // --- screens -------------------------------------------------------------------

  // Drop the takeover. In overlay mode (the global Mindless launcher) that means
  // closing the overlay in place — no navigation. On the /on-air route (no
  // onExit) it returns to the screen the member came FROM (where they hit the
  // Zap button or the board's radio); direct entries (PWA shortcut, typed URL)
  // have no app history, so they land on the feed instead of exiting the app.
  function leave() {
    // Leaving is an explicit exit: drop the crash-recovery cache + the server active session.
    clearLiveSession('mindless')
    clearActiveSession()
    stopAmbient()
    // Drop true fullscreen if the launcher's open gesture entered it (C.1-3); the
    // dvh takeover that remains is torn down by the unmount below.
    void exitAppFullscreen()
    if (onExit) {
      onExit()
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.replace('/feed')
    }
  }

  // Leaving FROM the reveal's Dispatch card (the explicit "Back to feed" button
  // or swiping the last card off): land the member on the feed (task #4). In
  // overlay mode, closing the overlay over the page they opened Mindless from
  // (typically the feed) is the agreed behavior — no extra navigation. On the
  // /on-air route, push the feed so the sit ends where the member expects.
  function leaveToFeed() {
    if (onExit) {
      onExit()
      return
    }
    router.replace('/feed')
  }

  // The reveal closes ONLY from the Dispatch card (its last card), so closing the
  // reveal and "back to feed" are the same exit.
  function closeReveal() {
    setPayload(null)
    void exitAppFullscreen()
    setStage('setup')
    leaveToFeed()
  }

  // From the reveal of a PARTIAL sit, "Finish the sit" re-arms the timer in place to run the
  // remaining time. The just-done seconds (payload.stats.sessionSeconds) become the banked total
  // and the target is the practice's authored length; on completion finishWith reports the TOTAL
  // so the server tops the log up to complete. Same component, no second overlay open.
  function finishTheRest() {
    if (!payload) return
    const banked = Math.max(0, Math.round(payload.stats.sessionSeconds))
    const targetSec = Math.max(0, Math.round((practice?.durationMin ?? 0) * 60))
    const remainingSec = targetSec - banked
    if (remainingSec <= 0) {
      // Nothing left to run — just close out.
      closeReveal()
      return
    }
    const remainingMin = clampMinutes(Math.ceil(remainingSec / 60))
    resumeBanked.current = banked
    resumeTarget.current = targetSec
    setPayload(null)
    setNote('')
    activeModeRef.current = 'timer'
    setMode('timer')
    // Seed the clock STATE too: the live clock + finish() both read `minutes`, not the start
    // override, so the resumed sit must run the remaining minutes, not the original target.
    setMinutes(remainingMin)
    void start({ practiceId, mode: 'timer', minutes: remainingMin })
  }

  if (stage === 'reveal' && payload) {
    return (
      <Overlay>
        {/* Completion economy messaging (item #4), above the reveal cards. PARTIAL: paid 1 Zap,
            no shame, a gentle "finish for the rest". FINISHED: celebrate the top-up. Plain copy,
            no em or en dashes. */}
        {payload.partial && (
          <div className="mx-auto mb-4 w-full max-w-sm rounded-2xl border border-primary/50 bg-primary-bg/30 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-text">You banked the day and earned 1 Zap.</p>
            <p className="mt-1 text-xs text-muted">
              Finish the sit any time today and the rest of the Zaps are yours.
            </p>
            {(practice?.durationMin ?? 0) > 0 && (
              <button
                type="button"
                onClick={finishTheRest}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Finish the sit <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
        {payload.finished && (
          <div className="mx-auto mb-4 w-full max-w-sm rounded-2xl border border-success/50 bg-success-bg/40 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-text">You finished it. The rest of the Zaps are in.</p>
            <p className="mt-1 text-xs text-muted">Full sit, full reward. Nice work.</p>
          </div>
        )}
        <Reveal payload={payload} onClose={closeReveal} onAction={onExit} />
      </Overlay>
    )
  }

  if (stage === 'saving') {
    return (
      <Overlay>
      <CenterScreen>
        <OnAirIcon className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm font-medium text-muted">Tuning back in. Counting it up…</p>
      </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'error') {
    return (
      <Overlay>
      <CenterScreen>
        <p className="text-sm font-medium text-text">That didn’t save. Your sit still happened.</p>
        <button
          type="button"
          onClick={() => void finishWith(Math.round((Date.now() - startedAt) / 1000), null)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          Try again
        </button>
      </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'live') {
    const mm = Math.floor(remaining / 60)
    const ss = Math.floor(remaining % 60)
    const ended = remaining <= 0
    const paused = pausedAt !== null
    const liveMode = activeModeRef.current
    const showBreath = isBreathMode(liveMode)
    // Auto-continue read-outs (ADR-443): the overtime clock and the live tier cue. Engaged time
    // is the banked resume + the full target + whatever overtime has run, the same total finish()
    // banks, so the cue's tier matches the Zaps that will pay.
    const om = Math.floor(overtime / 60)
    const os = overtime % 60
    const overLabel = `+${om}:${String(os).padStart(2, '0')}`
    const cue = ended ? liveDepthCue(resumeBanked.current + minutes * 60 + overtime) : null
    return (
      <Overlay flash={flash}>
        {/* The content scrolls if it has to; the controls below DOCK to the bottom and stay
            tappable on a short screen (owner layout directive, item #5). */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 pt-[max(3rem,env(safe-area-inset-top))] pb-6">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-primary-strong [animation-duration:3s]">
            <LotusIcon className="h-[18px] w-[18px]" /> Mindless
          </p>

          <div className="flex flex-col items-center gap-5">
            {showBreath ? (
              // The visualizer keeps breathing past the target (auto-continue) so the deeper
              // time still has its rhythm; only a real pause stops it.
              <BreathVisualizer pattern={pattern} startedAt={startedAt} paused={paused} />
            ) : (
              <p
                className={`text-8xl font-semibold tabular-nums ${ended ? 'text-primary-strong' : 'text-text/60'}`}
              >
                {ended ? overLabel : `${mm}:${String(ss).padStart(2, '0')}`}
              </p>
            )}
            {showBreath && (
              <p className="text-base tabular-nums text-subtle">
                {ended ? `Going deeper ${overLabel}` : `${mm}:${String(ss).padStart(2, '0')} left`}
              </p>
            )}
            {showBreath && (
              <div className="flex max-w-xs flex-col items-center gap-1.5 text-center">
                <p className="text-xs text-subtle">{pattern.blurb}</p>
                <button
                  type="button"
                  onClick={() => setShowInstructions(true)}
                  aria-label={`How to do ${pattern.name}`}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium text-muted transition-colors hover:text-text"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden /> Details
                </button>
              </div>
            )}
            {/* The live "go deeper" cue: once past the target, name the tier earned so far and the
                minutes to the next one. The quiet pull deeper each day (ADR-443). */}
            {cue && (
              <div className="flex max-w-xs flex-col items-center gap-0.5 text-center">
                <p className="text-sm font-semibold text-primary-strong">{cue.reached}</p>
                <p className="text-xs text-muted">{cue.toNext}</p>
              </div>
            )}
            {/* Journal: the note field lives here so the member writes while they sit. Optional. */}
            {modeHasNote(liveMode) && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Jot a line or two. Or do not. Up to you."
                aria-label="Session note"
                className="w-full max-w-xs resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
              />
            )}
            {preroll !== null && (
              <div className="flex flex-col items-center gap-1" aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary-strong">Warm up</p>
                <p className="text-7xl font-semibold tabular-nums text-primary-strong">{preroll}</p>
              </div>
            )}
            {/* After an automatic resume, a small non-blocking chip to re-arm sound (item #4). The
                clock is already running; this is optional. */}
            {needRestore && (
              <button
                type="button"
                onClick={restoreCues}
                className="rounded-full border border-primary/50 bg-primary-bg/40 px-3 py-1.5 text-xs font-medium text-primary-strong transition-colors hover:bg-primary-bg/60"
              >
                Tap to restore sound
              </button>
            )}
          </div>
        </div>

        {/* Docked controls (P10 + item #5): Pause ⇄ Resume while running, Finish once the
            clock lands. Finish and Close BOTH log and move on — ending early is never punished.
            Pinned to the bottom and always visible even when the content above scrolls. */}
        <div className="sticky bottom-0 -mx-6 flex flex-col items-center gap-3 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={() => {
              if (preroll !== null) { begin(); return } // override the countdown, begin now
              if (ended) { void finish(false); return }
              togglePause()
            }}
            className="min-w-44 rounded-full bg-primary px-10 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {preroll !== null ? 'Begin now' : ended ? 'Finish' : paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void finish(!ended)}
            className="rounded-full px-4 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
          >
            Close &amp; Log Session
          </button>
        </div>
        {showInstructions && (
          <InstructionsPopup pattern={pattern} onClose={() => setShowInstructions(false)} />
        )}
      </Overlay>
    )
  }

  // setup — the same full-page takeover as the sit (P8): entering Mindless means
  // the world steps back BEFORE the timer starts. No app chrome, the wordmark on
  // top (same mark as the live screen, still rather than pulsing) and Tune out
  // pinned above the fold in a sticky footer.
  //
  // The shell here is the setup's OWN wrapper, not the shared Overlay: on a wide
  // browser it widens to a calm two-column panel (lg:max-w-3xl), while the live /
  // saving / reveal stages keep the narrow centered Overlay untouched. Below lg
  // the grid collapses to the original single column, so mobile is unchanged.
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-5 lg:max-w-3xl lg:px-10 lg:py-8">
      {/* The masthead (logo + subtitle) sits at the TOP OF THE CONTENT container, not
          pushed down from the viewport top (B.1): no extra top padding above it. */}
      <div className="flex flex-1 flex-col px-2 lg:px-0">
      {onModeChange ? (
        // The unified door: one masthead ("Mindless" + the locked tagline) and the Be Still | Get
        // Moving toggle directly under it. Be Still is the active segment here (this is the sit).
        <MindlessMasthead mode={doorMode ?? 'still'} onModeChange={onModeChange} onClose={leave} />
      ) : (
        // Standalone /on-air route: no toggle, the sit's own masthead (unchanged).
        <>
          <div className="relative flex items-center justify-center pb-2">
            <p className="flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] text-primary-strong lg:text-lg">
              <LotusIcon className="h-6 w-6 lg:h-7 lg:w-7" /> Mindless
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
          <p className="pb-6 text-center text-xs text-subtle lg:pb-7">The world can wait a few minutes.</p>
        </>
      )}

      {/* The settings content CENTERS vertically in the leftover space (item #5): on a tall
          screen it sits in the middle; on a short one it scrolls. The primary action below is a
          docked sticky bar that stays visible either way. */}
      <div className="flex flex-1 flex-col justify-center">
      {/* Two columns on desktop: chooser (practice, mode, pattern, minutes) on
          the left; cues + the Dispatches link on the right. One column on mobile. */}
      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
        <div className="space-y-5 lg:space-y-6">
        <div>
          <Label>Mode</Label>
          {/* Six modes (item #1). Meditate / Stillness / Ritual / Journal all run the same silent
              countdown, differing by label, icon, default length, and subline; Breathe is the
              guided rings; Just Log is the instant log. A log-only practice (timer_kind 'none')
              can only Just Log; everything else (Free sit included) can run the timed modes. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SESSION_MODE_ORDER.map((m) => {
              const meta = SESSION_MODE_META[m]
              // The timed modes need a practice that routes to the sit; Just Log is always offered.
              const disabled = m !== 'log' && !practiceCanTime
              return (
                <ModeButton
                  key={m}
                  active={mode === m}
                  disabled={disabled}
                  onClick={() => {
                    setMode(m)
                    // Seed a sensible default length when the practice has no fixed length and we
                    // are not on Just Log. A locked or duration-set practice keeps its own minutes.
                    if (m !== 'log' && !durationLocked && (practice?.durationMin ?? 0) <= 0) {
                      setMinutes(meta.defaultMin)
                    }
                  }}
                  icon={MODE_ICON[m]}
                  label={meta.label}
                />
              )
            })}
          </div>
          {/* A plain one-line subline for the chosen mode (no narrated feelings, no em dashes). */}
          <p className="mt-2 text-2xs text-subtle">{SESSION_MODE_META[mode].subline}</p>
          {!practiceCanTime && (
            <p className="mt-1 text-2xs text-subtle">This practice is log-only.</p>
          )}
        </div>

        {/* Just Log: an optional note captured before logging (the One Small Reach entry point).
            Journal's note lives on the live screen instead, so it isn't shown here. */}
        {mode === 'log' && (
          <div>
            <Label>Note</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What happened? A line is plenty. Optional."
              aria-label="Note"
              className="mt-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {mode === 'breath' && (
          <div>
            <Label>Pattern</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {BREATH_PATTERNS.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setPatternSlug(p.slug)}
                  title={p.blurb}
                  className={`rounded-xl border px-2 py-1.5 text-sm transition-colors ${
                    p.slug === patternSlug
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPatternSlug('custom')}
                title="Your counts. Set each phase to what fits."
                className={`rounded-xl border px-2 py-1.5 text-sm transition-colors ${
                  patternSlug === 'custom'
                    ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                Custom
              </button>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <p className="flex-1 text-xs text-subtle">{pattern.blurb}</p>
              <button
                type="button"
                onClick={() => setShowInstructions(true)}
                aria-label={`How to do ${pattern.name}`}
                className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium text-muted transition-colors hover:text-text"
              >
                <Info className="h-3.5 w-3.5" aria-hidden /> Details
              </button>
            </div>
            {patternSlug === 'custom' && (
              <div className="mt-2.5 space-y-2.5 rounded-xl border border-border px-3.5 py-2.5">
                <PhaseSlider label="Breathe in" min={CUSTOM_PHASE_MIN} value={customIn} onChange={setCustomIn} />
                <PhaseSlider label="Hold" min={0} value={customHold} onChange={setCustomHold} />
                <PhaseSlider label="Let go" min={CUSTOM_PHASE_MIN} value={customOut} onChange={setCustomOut} />
              </div>
            )}
          </div>
        )}

        {mode !== 'log' && durationLocked && (
          // The author pinned the length: lock the minutes to the practice's duration; no editor.
          <div>
            <Label>Minutes</Label>
            <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-surface-elevated/40 px-3.5 py-2.5">
              <span className="text-sm font-semibold tabular-nums text-text">{minutes}m</span>
              <span className="text-2xs text-subtle">Set by the practice</span>
            </div>
          </div>
        )}

        {mode !== 'log' && !durationLocked && (
          <div>
            <Label>Minutes</Label>
            {/* The silent-timer sit modes (Meditate / Journal / Stillness / Ritual) use the SAME
                single-row layout as Get Moving's Walk (items #2, #3): five preset chips in one
                row, the +/- stepper on its own row beneath. Breathe keeps its own shorter,
                calmer preset set on a 3-up row. */}
            <div className={`mt-2 grid gap-2 ${mode === 'breath' ? 'grid-cols-3' : 'grid-cols-5'}`}>
              {(mode === 'breath' ? BREATH_DURATION_PRESETS : DURATION_PRESETS).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`rounded-xl border px-2 py-1.5 text-sm tabular-nums transition-colors ${
                    m === minutes
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {/* The stepper: any length, one minute at a time (1–120). Its own row, like Walk. */}
            <div className="mt-2 flex items-center justify-between rounded-xl border border-border px-1.5">
              <button
                type="button"
                onClick={() => setMinutes((m) => clampMinutes(m - 1))}
                aria-label="One minute less"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-semibold tabular-nums text-text">{minutes}m</span>
              <button
                type="button"
                onClick={() => setMinutes((m) => clampMinutes(m + 1))}
                aria-label="One minute more"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        </div>

        <div className="space-y-5 lg:space-y-6">
        {mode !== 'log' && (
          <div>
            {/* Mobile: a tap-to-expand header keeps the cue settings from pushing Tune out below
                the fold. Desktop: a plain label, always expanded. */}
            <button
              type="button"
              onClick={() => setCuesOpen((v) => !v)}
              aria-expanded={cuesOpen}
              className="flex w-full items-center justify-between lg:hidden"
            >
              <Label>Sound &amp; cues</Label>
              <ChevronDown className={`h-4 w-4 text-subtle transition-transform ${cuesOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            <div className="hidden lg:block">
              <Label>Cues</Label>
            </div>
            <div className={`${cuesOpen ? 'block' : 'hidden'} lg:block`}>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ToggleChip
                active={bell}
                onClick={() => setBell(!bell)}
                icon={BellCueIcon}
                label="Sound"
                title={
                  mode === 'breath'
                    ? 'A soft bell at each phase change.'
                    : 'A soft bell at each interval.'
                }
              />
              <ToggleChip
                active={haptics}
                onClick={() => setHaptics(!haptics)}
                icon={VibrationIcon}
                label="Vibration"
                title="A small tap at each phase change. Not every phone supports it."
              />
            </div>
            {/* Warm up: the countdown before the sit begins (item #6). 3 / 5 / 10 seconds. */}
            <div className="mt-3">
              <SubLabel>Warm up</SubLabel>
              <div className="mt-1.5 grid grid-cols-3 gap-2" role="group" aria-label="Warm up length">
                {WARMUP_PRESETS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={w === warmupSec}
                    onClick={() => setWarmupSec(w)}
                    className={`rounded-xl border px-2 py-1.5 text-xs tabular-nums transition-colors ${
                      w === warmupSec
                        ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                        : 'border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    {w}s
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A short countdown to settle before the clock starts.</p>
            </div>
            {bell && (
              <div className="mt-3 space-y-3 rounded-xl border border-border px-3.5 py-3">
                {/* Voice */}
                <div>
                  <SubLabel>Voice</SubLabel>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {BELL_TONES.map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => {
                          setBellToneSlug(t.slug)
                          // A one-strike preview on the tap (the gesture unlocks audio).
                          try {
                            audio.current = audio.current ?? new AudioContext()
                            void audio.current.resume()
                            chime(audio.current, t, bellVolumeScale(bellVolume))
                          } catch {
                            // preview is a nicety
                          }
                        }}
                        className={`rounded-xl border px-2 py-1.5 text-xs transition-colors ${
                          t.slug === bellToneSlug
                            ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                            : 'border-border text-muted hover:bg-surface-elevated'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume — scales the synth peak; previews the current voice. */}
                <div>
                  <SubLabel>Volume</SubLabel>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {(['quiet', 'medium', 'loud'] as BellVolume[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setBellVolume(v)
                          try {
                            audio.current = audio.current ?? new AudioContext()
                            void audio.current.resume()
                            chime(audio.current, bellToneBySlug(bellToneSlug), bellVolumeScale(v))
                          } catch {
                            // preview is a nicety
                          }
                        }}
                        className={`rounded-xl border px-2 py-1.5 text-xs capitalize transition-colors ${
                          v === bellVolume
                            ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                            : 'border-border text-muted hover:bg-surface-elevated'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interval bell — the silent-timer modes (Meditate / Stillness / Ritual /
                    Journal). Breath uses phase-change cues, so it's hidden there. */}
                {engineForMode(mode) === 'timer' && (
                  <div>
                    <SubLabel>Interval bell</SubLabel>
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      {BELL_INTERVALS.map((iv) => (
                        <button
                          key={iv.value}
                          type="button"
                          onClick={() => setBellEveryMin(iv.value)}
                          className={`rounded-xl border px-2 py-1.5 text-xs tabular-nums transition-colors ${
                            iv.value === bellEveryMin
                              ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                              : 'border-border text-muted hover:bg-surface-elevated'
                          }`}
                        >
                          {iv.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End bell — the closing double-strike, default on. */}
                <button
                  type="button"
                  aria-pressed={endBell}
                  onClick={() => setEndBell(!endBell)}
                  title="A double strike when the sit ends."
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors ${
                    endBell
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  <span>End bell</span>
                  <span className={endBell ? 'text-primary-strong' : 'text-subtle'}>
                    {endBell ? 'on' : 'off'}
                  </span>
                </button>
              </div>
            )}
            {/* Ambient: a soft background loop, independent of the bell. A tap
                auditions it; the choice plays, seamlessly looped, for the sit. */}
            <div className="mt-3">
              <SubLabel>Ambient</SubLabel>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => selectAmbient(null)}
                  className={`rounded-xl border px-2 py-1.5 text-xs transition-colors ${
                    ambientSlug === null
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  Off
                </button>
                {AMBIENT_TRACKS.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => selectAmbient(t.slug)}
                    className={`rounded-xl border px-2 py-1.5 text-xs transition-colors ${
                      ambientSlug === t.slug
                        ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                        : 'border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Practice read-out (which log this banks), on ONE line with an inline "Change" link. Shown
          only once a practice is explicitly selected (it pairs with the Start/Continue button); in
          the "Select Practice" state nothing renders here. With more than one practice "Change"
          re-opens the chooser. */}
      {practices.length > 1 && practice && explicitlySelected && (
        <div className="mt-5 lg:mt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-text">
              <span className="shrink-0 text-subtle">Logs as</span>
              <span className="truncate font-semibold">{practice.title}</span>
              {practice.loggedToday && <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
            </p>
            <button
              type="button"
              onClick={() => setShowChooser(true)}
              className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-primary-strong transition-colors hover:bg-primary-bg/40"
            >
              Change
            </button>
          </div>
          {/* A partial today resumes: surface the remaining time so "Continue Practice" reads true. */}
          {activeResume && (
            <p className="mt-1 text-2xs text-primary-strong">
              {activeResumeRemainingMin} min left. Continue Practice picks up where you stopped.
            </p>
          )}
        </div>
      )}
      </div>

      {/* Docked: the primary action is pinned to the bottom and ALWAYS visible, even when the
          centered content above scrolls on a short screen (item #5). */}
      <div className="sticky bottom-0 -mx-8 mt-auto bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6 lg:-mx-10 lg:px-10">
        {practice?.loggedToday && mode !== 'log' && (
          <p className="pb-1.5 text-center text-2xs text-subtle">
            {practice.title} is already counted today. The sit still banks airtime.
          </p>
        )}
        {practicedToday >= 3 && (
          <p className="pb-1.5 text-center text-2xs text-subtle">
            {practicedToday} members practiced today.
          </p>
        )}
        {/* The primary action. When the member has a real practice to choose AND hasn't explicitly
            selected one (a generic open landed on the Free Practice default), the button reads
            "Select Practice" and OPENS the chooser rather than starting, so they pick one of their
            adopted practices first. Just Log keeps "Log it" (an instant log) even in that state.
            Once a practice is explicitly selected (or the member only has Free Practice, nothing to
            choose), it STARTS the sit: "Continue Practice" when the selected practice has a partial
            today (it resumes the remaining time), else "Start Practice". Re-pick via "Change" above. */}
        <button
          type="button"
          onClick={() => {
            if (!practiceId) return
            // Prompt a pick first on a generic open (Just Log goes straight through to its log).
            if (needsSelect && mode !== 'log') { setShowChooser(true); return }
            // A lone Movement practice still hands off to the Movement timer (item #2); every
            // other kind runs the sit on the member's chosen mode + minutes (resuming if partial).
            if (practiceKind === 'movement') { handOffToMovement(practiceId); return }
            void start({ practiceId, mode, minutes })
          }}
          disabled={!practiceId}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 lg:mx-auto lg:max-w-sm"
        >
          <OnAirIcon className="h-4 w-4" />{' '}
          {mode === 'log'
            ? 'Log it'
            : needsSelect
              ? 'Select Practice'
              : activeResume
                ? 'Continue Practice'
                : 'Start Practice'}
        </button>
      </div>
      </div>
      </div>
      {showInstructions && (
        <InstructionsPopup pattern={pattern} onClose={() => setShowInstructions(false)} />
      )}
      {showChooser && (
        <PracticeChooser
          practices={practices}
          selectedId={practiceId}
          onPick={chooseAndStart}
          onClose={() => setShowChooser(false)}
          onBrowse={() => { setShowChooser(false); leave() }}
        />
      )}
    </div>
  )
}

/** The practice chooser sheet (C.5): the promoted chip row. Picking a practice opens
 *  its timer preset and begins the sit (chooseAndStart). A calm centered overlay above
 *  the setup takeover (z-[60] > z-50), dismissible by the Close button, the scrim, or Esc. */
function PracticeChooser({
  practices,
  selectedId,
  onPick,
  onClose,
  onBrowse,
}: {
  practices: OnAirPractice[]
  selectedId: string
  onPick: (id: string) => void
  onClose: () => void
  /** Tapping "Browse the library" navigates to /practices; this drops the takeover first. */
  onBrowse: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select a practice"
      className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 sm:items-center sm:px-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface px-5 py-5 shadow-lg">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-semibold text-text">Select a practice</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Adopted (and current-leg) practices + the Free sit come FIRST (item #6); each routes
            per its timer_kind on pick. */}
        <div className="-mx-1 max-h-[60vh] space-y-1.5 overflow-y-auto px-1">
          {practices.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors ${
                p.id === selectedId
                  ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                  : 'border-border text-muted hover:bg-surface-elevated'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              {/* An unfinished session today shows a "N min left" pill to resume (it is NOT complete,
                  so it does not get the done check); a finished one keeps the check. */}
              {p.partialToday ? (
                <span className="shrink-0 rounded-full bg-primary-bg/60 px-2 py-0.5 text-2xs font-semibold text-primary-strong">
                  {Math.max(1, Math.ceil((p.partialToday.targetSec - p.partialToday.bankedSec) / 60))} min left
                </span>
              ) : p.loggedToday ? (
                <Check className="h-4 w-4 shrink-0 text-success" aria-label="Logged today" />
              ) : null}
            </button>
          ))}
        </div>
        {/* A quiet door to the full library for anything not on the member's list yet
            ("adopted first, browse for more"). Closes the takeover on the way out. */}
        <Link
          href="/practices"
          onClick={onBrowse}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <Library className="h-3.5 w-3.5" aria-hidden /> Browse the library
        </Link>
      </div>
    </div>
  )
}

/** The pattern how-to popup: a calm centered overlay above the session takeover
 *  (z-[60] > Overlay's z-50). Dismissible by the Close button, the scrim, or Esc. */
function InstructionsPopup({
  pattern,
  onClose,
}: {
  pattern: BreathPattern
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`How to do ${pattern.name}`}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface px-6 py-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-6 text-lg font-semibold text-text">{pattern.name}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{pattern.instructions}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</p>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs font-medium uppercase tracking-wider text-subtle">{children}</p>
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-primary bg-primary-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated disabled:hover:bg-transparent'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function ToggleChip({
  active,
  onClick,
  icon: Icon,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs transition-colors ${
        active
          ? 'border-primary bg-primary-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className={active ? 'text-primary-strong' : 'text-subtle'}>{active ? 'on' : 'off'}</span>
    </button>
  )
}

function PhaseSlider({
  label,
  min,
  value,
  onChange,
}: {
  label: string
  min: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 flex items-baseline justify-between">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-text">
          {value === 0 ? 'off' : `${value}s`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={CUSTOM_PHASE_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">{children}</div>
  )
}
