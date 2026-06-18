'use client'

// On Air — the session machine (ADR-229, docs/ON-AIR.md): setup → live → reveal.
//
// The live screen is the takeover: wake lock keeps the screen lit for the whole
// sit, fullscreen is requested best-effort on mobile, and the only control is a
// quiet End. Ending early carries zero shame copy — the log still counts; the
// practice is the unit, not the duration. "Just log" skips the timer entirely
// so On Air is never a tax on logging.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus, X, ChevronDown } from 'lucide-react'
import { LotusIcon, BreatheIcon, BoltIcon, BellCueIcon, VibrationIcon, OnAirIcon } from './icons'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import {
  BELL_INTERVALS,
  BELL_TONES,
  BREATH_PATTERNS,
  CUSTOM_PHASE_MAX,
  CUSTOM_PHASE_MIN,
  DURATION_PRESETS,
  bellToneBySlug,
  bellVolumeScale,
  breathPositionAt,
  buildCustomPattern,
  clampMinutes,
  patternBySlug,
  type BellTone,
  type BellVolume,
  type BreathPhase,
  type OnAirPrefs,
  type RevealPayload,
  type SessionMode,
} from '@/lib/on-air'
import { BreathVisualizer } from './visualizer'
import { Reveal } from './reveal'

export interface OnAirPractice {
  id: string
  title: string
  loggedToday: boolean
  /** Typical length in minutes (the practice's duration_min). The timer defaults to it on select;
   *  null/undefined = open length (a free-length sit). */
  durationMin?: number | null
  /** When set, completing a session with this chip selected logs THIS practice id instead of the
   *  chip's own id — the "Free sit" chip maps to the default sit practice (lib/on-air/session-data). */
  logsAs?: string
}

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// --- interval bell (Web Audio, no asset files) -------------------------------
// A soft bell/bowl strike: a SOFT ATTACK (a short fade-in, so there's no click —
// the click is what makes a synth ding feel harsh), a low peak well under
// earbud-hostile levels, and a long exponential ring-out. A strike layers the
// voice's partials with each higher overtone faded down, so the fundamental
// carries and the overtones just add bell body. Every call is wrapped so a flaky
// context never throws.

// One sine partial: fade in over ~25ms, ring out exponentially.
function ding(ctx: AudioContext, at: number, freq: number, durationSec: number, peak: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.025) // soft attack — no onset click
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

// One strike of a voice at `at`: fundamental loudest, overtones progressively
// quieter + a touch shorter, for a warm bell/bowl body. `vol` scales the peak
// (the member's bell-volume choice; 1 = the tuned default).
function strike(ctx: AudioContext, tone: BellTone, at: number, vol = 1) {
  tone.freqs.forEach((f, i) => {
    const peak = 0.08 * Math.pow(0.55, i) * vol
    const dur = tone.decay * (i === 0 ? 1 : 0.8)
    ding(ctx, at, f, dur, peak)
  })
}

/** One strike of the chosen voice, at the given loudness. */
function chime(ctx: AudioContext | null, tone: BellTone, vol = 1) {
  if (!ctx) return
  try {
    strike(ctx, tone, ctx.currentTime, vol)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A gentle double strike to close the session, the second a touch softer. */
function endChime(ctx: AudioContext | null, tone: BellTone, vol = 1) {
  if (!ctx) return
  try {
    strike(ctx, tone, ctx.currentTime, vol)
    strike(ctx, tone, ctx.currentTime + 0.55, vol)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** The takeover shell: while a session is live (and through the reveal) On Air
 *  owns the WHOLE viewport — above the app header and the bottom tab bar —
 *  until the member finishes or ends (P5). */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 py-5">{children}</div>
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

export function OnAirSession({
  practices,
  defaultPracticeId,
  prefs,
  practicedToday = 0,
  onExit,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at ≥3). */
  practicedToday?: number
  /** Overlay mode (the global Mindless launcher): when set, leaving the session
   *  CLOSES the overlay via this callback instead of navigating the router. The
   *  route page (/on-air) omits it, keeping its back/replace exit unchanged. */
  onExit?: () => void
}) {
  const [stage, setStage] = useState<Stage>('setup')
  const initialId =
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? ''
  // A practice's own length seeds the timer; no duration (or Free sit) falls back to the remembered
  // minutes (an open-length sit the member can still adjust).
  const durationFor = (id: string): number => {
    const d = practices.find((p) => p.id === id)?.durationMin
    return d && d > 0 ? clampMinutes(d) : prefs.minutes
  }
  const [practiceId, setPracticeId] = useState(initialId)
  const [mode, setMode] = useState<SessionMode>(prefs.mode)
  const [minutes, setMinutes] = useState(() => durationFor(initialId))
  const [patternSlug, setPatternSlug] = useState(prefs.pattern)
  const [customIn, setCustomIn] = useState(prefs.customIn ?? 4)
  const [customHold, setCustomHold] = useState(prefs.customHold ?? 4)
  const [customOut, setCustomOut] = useState(prefs.customOut ?? 6)
  const [bell, setBell] = useState(prefs.bell ?? false)
  const [bellToneSlug, setBellToneSlug] = useState(prefs.bellTone ?? 'soft')
  const [bellVolume, setBellVolume] = useState<BellVolume>(prefs.bellVolume ?? 'medium')
  const [endBell, setEndBell] = useState(prefs.endBell ?? true)
  const [bellEveryMin, setBellEveryMin] = useState(prefs.bellEveryMin ?? 1)
  const [haptics, setHaptics] = useState(prefs.haptics ?? false)
  // Mobile-only: the cue settings collapse so the primary controls (mode, minutes, Tune out) stay
  // above the fold on a phone. Always expanded on desktop (the two-column layout has the room).
  const [cuesOpen, setCuesOpen] = useState(false)
  const router = useRouter()
  const [startedAt, setStartedAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  // Paused = the wall-clock moment the member tapped Pause; resuming shifts
  // startedAt forward by the pause length, so every elapsed-based read (clock,
  // cues, visualizer) continues seamlessly and pauses never count as airtime.
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  // The 5s auto-start countdown shown before a sit begins (P14). null = not counting; the Start
  // button overrides it (begin() now).
  const [preroll, setPreroll] = useState<number | null>(null)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const lastPhase = useRef<BreathPhase | null>(null)
  const lastMinute = useRef(0)
  const endCued = useRef(false)

  const pattern = useMemo(
    () =>
      patternSlug === 'custom'
        ? buildCustomPattern(customIn, customHold, customOut)
        : patternBySlug(patternSlug),
    [patternSlug, customIn, customHold, customOut],
  )
  const practice = practices.find((p) => p.id === practiceId)

  // Pick a practice + seed the timer to its length (no duration → the remembered open length).
  function selectPractice(id: string) {
    setPracticeId(id)
    setMinutes(durationFor(id))
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
    try {
      if (window.matchMedia('(max-width: 768px)').matches) {
        await document.documentElement.requestFullscreen?.()
      }
    } catch {
      // fullscreen is progressive enhancement
    }
  }

  async function releaseQuiet() {
    try {
      await wakeLock.current?.release()
    } catch {
      /* released already */
    }
    wakeLock.current = null
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* fine */
    }
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

  // --- the clock --------------------------------------------------------------

  useEffect(() => {
    if (stage !== 'live') return
    const total = minutes * 60
    const id = setInterval(() => {
      if (pausedAt !== null) return
      const elapsed = (Date.now() - startedAt) / 1000
      const left = Math.max(0, total - elapsed)
      setRemaining(left)
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
    return () => {
      try {
        void ctx.current?.close()
      } catch {
        // already closed
      }
      ctx.current = null
    }
  }, [])

  // The 5s auto-start pre-roll: tick down once a second, then begin() automatically. Re-runs each
  // tick with a fresh closure, so begin() reads the current armed pausedAt. The Start button calls
  // begin() directly to skip ahead.
  useEffect(() => {
    if (stage !== 'live' || preroll === null) return
    if (preroll <= 0) {
      begin()
      return
    }
    const id = setTimeout(() => setPreroll((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, preroll])

  // --- transitions -------------------------------------------------------------

  async function start() {
    if (!practiceId) return
    if (mode === 'log') {
      void finishWith(0, null)
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
    setRemaining(minutes * 60)
    setPreroll(5)
    setStage('live')
    void acquireQuiet()
  }

  // Begin the sit now: end the pre-roll and unpause from the armed state (shift startedAt by the
  // armed span so elapsed starts at zero). Called by the 5s countdown reaching 0 or the Start button.
  function begin() {
    setPreroll(null)
    if (pausedAt !== null) setStartedAt((s) => s + (Date.now() - pausedAt))
    setPausedAt(null)
  }

  function togglePause() {
    if (pausedAt === null) {
      setPausedAt(Date.now())
    } else {
      setStartedAt((s) => s + (Date.now() - pausedAt))
      setPausedAt(null)
    }
  }

  async function finish(early: boolean) {
    if (finishing.current) return
    finishing.current = true
    // The end bell already rang when the clock hit zero; an early Close Session
    // gets a small ack tap only. Paused time never counts as airtime.
    const elapsedMs = (pausedAt ?? Date.now()) - startedAt
    const seconds = early ? Math.max(0, Math.round(elapsedMs / 1000)) : minutes * 60
    if (haptics && early) buzz(10)
    await finishWith(seconds, new Date(startedAt).toISOString())
  }

  async function finishWith(seconds: number, startedIso: string | null) {
    setStage('saving')
    await releaseQuiet()
    const result = await completeSession({
      // A Free sit logs the default sit practice (chip.logsAs); every real practice logs itself.
      practiceId: practice?.logsAs ?? practiceId,
      mode,
      pattern: patternSlug,
      seconds,
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

  // Done or swiped off the last card: drop the takeover. In overlay mode (the
  // global Mindless launcher) that means closing the overlay in place — no
  // navigation. On the /on-air route (no onExit) it returns to the screen the
  // member came FROM (where they hit the Zap button or the board's radio);
  // direct entries (PWA shortcut, typed URL) have no app history, so they land
  // on home instead of exiting the app.
  function leave() {
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

  function closeReveal() {
    setPayload(null)
    setStage('setup')
    leave()
  }

  if (stage === 'reveal' && payload) {
    return (
      <Overlay>
        <Reveal payload={payload} onClose={closeReveal} />
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
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-between pt-12 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-primary-strong [animation-duration:3s]">
            <LotusIcon className="h-[18px] w-[18px]" /> Mindless
          </p>

          <div className="flex flex-col items-center gap-5">
            {mode === 'breath' ? (
              <BreathVisualizer pattern={pattern} startedAt={startedAt} paused={paused || ended} />
            ) : (
              <p className="text-8xl font-bold tabular-nums text-text">
                {mm}:{String(ss).padStart(2, '0')}
              </p>
            )}
            {mode === 'breath' && (
              <p className="text-base tabular-nums text-subtle">
                {ended ? 'Done' : `${mm}:${String(ss).padStart(2, '0')} left`}
              </p>
            )}
            {preroll !== null && (
              <p className="animate-pulse text-sm font-bold uppercase tracking-[0.3em] text-primary-strong">
                Starting in {preroll}
              </p>
            )}
          </div>

          {/* The dynamic control (P10): Pause ⇄ Start while running, Finish once
              the clock lands. Finish and Close Session BOTH log and move on —
              ending early is never punished. */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (preroll !== null) { begin(); return } // override the countdown, begin now
                if (ended) { void finish(false); return }
                togglePause()
              }}
              className="min-w-44 rounded-full bg-primary px-10 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {ended ? 'Finish' : paused ? 'Start' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={() => void finish(!ended)}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
            >
              Close Session
            </button>
          </div>
        </div>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 py-5 lg:max-w-3xl lg:px-10 lg:py-8">
      <div className="flex flex-1 flex-col px-2 pt-3 lg:px-0 lg:pt-2">
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

      {/* Two columns on desktop: chooser (practice, mode, pattern, minutes) on
          the left; cues + the Dispatches link on the right. One column on mobile. */}
      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
        <div className="space-y-5 lg:space-y-6">
        {practices.length > 1 && (
        <div>
          <Label>Practice</Label>
          {/* One scrollable chip row — stays compact however long the list grows.
              With a single adopted practice it's auto-selected and the section
              hides entirely (owner ask: no badge when there's nothing to pick). */}
          <div className="-mx-8 mt-2 flex gap-1.5 overflow-x-auto px-8 pb-0.5 lg:-mx-0 lg:flex-wrap lg:px-0">
            {practices.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPractice(p.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  p.id === practiceId
                    ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                <span className="max-w-[12rem] truncate">{p.title}</span>
                {p.loggedToday && <Check className="h-3 w-3 shrink-0 text-success" />}
              </button>
            ))}
          </div>
        </div>
        )}

        <div>
          <Label>Mode</Label>
          {/* Meditate = the plain silent countdown; Breathe = the guided rings. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ModeButton active={mode === 'timer'} onClick={() => setMode('timer')} icon={LotusIcon} label="Meditate" />
            <ModeButton active={mode === 'breath'} onClick={() => setMode('breath')} icon={BreatheIcon} label="Breathe" />
            <ModeButton active={mode === 'log'} onClick={() => setMode('log')} icon={BoltIcon} label="Just Log" />
          </div>
        </div>

        {mode === 'breath' && (
          <div>
            <Label>Pattern</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
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
            <p className="mt-2 text-xs text-subtle">{pattern.blurb}</p>
            {patternSlug === 'custom' && (
              <div className="mt-2.5 space-y-2.5 rounded-xl border border-border px-3.5 py-2.5">
                <PhaseSlider label="Breathe in" min={CUSTOM_PHASE_MIN} value={customIn} onChange={setCustomIn} />
                <PhaseSlider label="Hold" min={0} value={customHold} onChange={setCustomHold} />
                <PhaseSlider label="Let go" min={CUSTOM_PHASE_MIN} value={customOut} onChange={setCustomOut} />
              </div>
            )}
          </div>
        )}

        {mode !== 'log' && (
          <div>
            <Label>Minutes</Label>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {DURATION_PRESETS.map((m) => (
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
              {/* The stepper: any length, one minute at a time (1–120). */}
              <div className="col-span-3 flex items-center justify-between rounded-xl border border-border px-1.5 sm:col-span-4 lg:col-span-3">
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

                {/* Interval bell — Meditate only (breath cues on phase change). */}
                {mode === 'timer' && (
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
            </div>
          </div>
        )}

        <p className="text-center lg:text-left">
          <a href="/on-air/dispatches" className="text-2xs font-medium text-subtle hover:text-text">
            Past Dispatches from Vera
          </a>
        </p>
        </div>
      </div>

      {/* Pinned: Tune out never sinks below the fold, even with Custom open. */}
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
        <button
          type="button"
          onClick={() => void start()}
          disabled={!practiceId}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 lg:mx-auto lg:max-w-sm"
        >
          <OnAirIcon className="h-4 w-4" /> {mode === 'log' ? 'Log it' : 'Tune out'}
        </button>
      </div>
      </div>
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
          ? 'border-primary bg-primary-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
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
