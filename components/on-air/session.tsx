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
import { Check, Minus, Plus } from 'lucide-react'
import { LotusIcon, BreatheIcon, DialIcon, BoltIcon, BellCueIcon, VibrationIcon, OnAirIcon } from './icons'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import {
  BELL_TONES,
  BREATH_PATTERNS,
  CUSTOM_PHASE_MAX,
  CUSTOM_PHASE_MIN,
  DURATION_PRESETS,
  bellToneBySlug,
  breathPositionAt,
  buildCustomPattern,
  clampMinutes,
  patternBySlug,
  type BellTone,
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
}

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// --- interval bell (Web Audio, no asset files) -------------------------------
// One soft sine ding: quick attack, exponential decay. Gain stays well under
// earbud-hostile levels; every call is wrapped so a flaky context never throws.

function ding(ctx: AudioContext, at: number, freq: number, durationSec: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.12, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

/** One strike of the chosen voice (the bowl layers two oscillators). */
function chime(ctx: AudioContext | null, tone: BellTone) {
  if (!ctx) return
  try {
    for (const f of tone.freqs) ding(ctx, ctx.currentTime, f, tone.decay)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** Slightly longer double strike for the end of the session. */
function endChime(ctx: AudioContext | null, tone: BellTone) {
  if (!ctx) return
  try {
    for (const f of tone.freqs) {
      ding(ctx, ctx.currentTime, f, tone.decay + 0.2)
      ding(ctx, ctx.currentTime + 0.35, f, tone.decay + 0.4)
    }
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
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at ≥3). */
  practicedToday?: number
}) {
  const [stage, setStage] = useState<Stage>('setup')
  const [practiceId, setPracticeId] = useState(
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? '',
  )
  const [mode, setMode] = useState<SessionMode>(prefs.mode)
  const [minutes, setMinutes] = useState(prefs.minutes)
  const [patternSlug, setPatternSlug] = useState(prefs.pattern)
  const [customIn, setCustomIn] = useState(prefs.customIn ?? 4)
  const [customHold, setCustomHold] = useState(prefs.customHold ?? 4)
  const [customOut, setCustomOut] = useState(prefs.customOut ?? 6)
  const [bell, setBell] = useState(prefs.bell ?? false)
  const [bellToneSlug, setBellToneSlug] = useState(prefs.bellTone ?? 'soft')
  const [haptics, setHaptics] = useState(prefs.haptics ?? false)
  const router = useRouter()
  const [startedAt, setStartedAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const lastPhase = useRef<BreathPhase | null>(null)
  const lastMinute = useRef(0)

  const pattern = useMemo(
    () =>
      patternSlug === 'custom'
        ? buildCustomPattern(customIn, customHold, customOut)
        : patternBySlug(patternSlug),
    [patternSlug, customIn, customHold, customOut],
  )
  const practice = practices.find((p) => p.id === practiceId)

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
      const elapsed = (Date.now() - startedAt) / 1000
      const left = Math.max(0, total - elapsed)
      setRemaining(left)
      // Cues: a phase-change ding/tap in breath mode, a minute ding on the
      // timer. The end gets its own double-ding in finish(), so skip at zero.
      if (left > 0) {
        if (mode === 'breath') {
          const { phase } = breathPositionAt(pattern, elapsed)
          if (lastPhase.current && phase !== lastPhase.current) {
            if (bell) chime(audio.current, bellToneBySlug(bellToneSlug))
            if (haptics) buzz(15)
          }
          lastPhase.current = phase
        } else {
          const minute = Math.floor(elapsed / 60)
          if (minute > lastMinute.current) {
            lastMinute.current = minute
            if (bell) chime(audio.current, bellToneBySlug(bellToneSlug))
          }
        }
      }
      if (left <= 0) void finish(false)
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, startedAt, minutes])

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
    setStartedAt(Date.now())
    setRemaining(minutes * 60)
    setStage('live')
    void acquireQuiet()
  }

  async function finish(early: boolean) {
    if (finishing.current) return
    finishing.current = true
    const seconds = early ? Math.round((Date.now() - startedAt) / 1000) : minutes * 60
    if (bell) endChime(audio.current, bellToneBySlug(bellToneSlug))
    if (haptics) buzz(early ? 10 : [30, 80, 30])
    await finishWith(seconds, new Date(startedAt).toISOString())
  }

  async function finishWith(seconds: number, startedIso: string | null) {
    setStage('saving')
    await releaseQuiet()
    const result = await completeSession({
      practiceId,
      mode,
      pattern: patternSlug,
      seconds,
      startedAt: startedIso,
      customIn,
      customHold,
      customOut,
      bell,
      bellTone: bellToneSlug,
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

  // Done or swiped off the last card: drop the takeover and return to the
  // screen the member came FROM (the page where they hit the Zap button or
  // the board's radio). Direct entries (PWA shortcut, typed URL) have no app
  // history, so they land on home instead of exiting the app.
  function closeReveal() {
    setPayload(null)
    setStage('setup')
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.replace('/feed')
    }
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
        <p className="text-sm font-medium text-muted">Off air. Counting it up…</p>
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
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-between pb-10 pt-12">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-primary-strong [animation-duration:3s]">
            <LotusIcon className="h-[18px] w-[18px]" /> Mindless
          </p>

          <div className="flex flex-col items-center gap-5">
            {mode === 'breath' ? (
              <BreathVisualizer pattern={pattern} startedAt={startedAt} />
            ) : (
              <p className="text-8xl font-bold tabular-nums text-text">
                {mm}:{String(ss).padStart(2, '0')}
              </p>
            )}
            {mode === 'breath' && (
              <p className="text-base tabular-nums text-subtle">
                {mm}:{String(ss).padStart(2, '0')} left
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void finish(true)}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            End
          </button>
        </div>
      </Overlay>
    )
  }

  // setup
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div>
        <Label>Practice</Label>
        <div className="mt-2 space-y-1.5">
          {practices.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPracticeId(p.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                p.id === practiceId
                  ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                  : 'border-border text-muted hover:bg-surface-elevated'
              }`}
            >
              <span className="truncate">{p.title}</span>
              {p.loggedToday && (
                <span className="ml-2 flex shrink-0 items-center gap-1 text-2xs font-semibold text-success">
                  <Check className="h-3 w-3" /> logged
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Mode</Label>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <ModeButton active={mode === 'breath'} onClick={() => setMode('breath')} icon={BreatheIcon} label="Breathe" />
          <ModeButton active={mode === 'timer'} onClick={() => setMode('timer')} icon={DialIcon} label="Timer" />
          <ModeButton active={mode === 'log'} onClick={() => setMode('log')} icon={BoltIcon} label="Just log" />
        </div>
      </div>

      {mode === 'breath' && (
        <div>
          <Label>Pattern</Label>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {BREATH_PATTERNS.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setPatternSlug(p.slug)}
                title={p.blurb}
                className={`rounded-xl border px-2 py-2 text-sm transition-colors ${
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
              className={`rounded-xl border px-2 py-2 text-sm transition-colors ${
                patternSlug === 'custom'
                  ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                  : 'border-border text-muted hover:bg-surface-elevated'
              }`}
            >
              Custom
            </button>
          </div>
          <p className="mt-1.5 text-xs text-subtle">{pattern.blurb}</p>
          {patternSlug === 'custom' && (
            <div className="mt-3 space-y-3 rounded-xl border border-border px-3.5 py-3">
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
          <div className="mt-2 flex gap-1.5">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`flex-1 rounded-xl border px-2 py-2 text-sm tabular-nums transition-colors ${
                  m === minutes
                    ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                {m}
              </button>
            ))}
            {/* The stepper: any length, one minute at a time (1–120). */}
            <div className="flex flex-[1.6] items-center justify-between rounded-xl border border-border px-1.5">
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

      {mode !== 'log' && (
        <div>
          <Label>Cues</Label>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <ToggleChip
              active={bell}
              onClick={() => setBell(!bell)}
              icon={BellCueIcon}
              label="Sound"
              title={
                mode === 'breath'
                  ? 'A soft bell at each phase change.'
                  : 'A soft bell at each minute.'
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
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
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
                      chime(audio.current, t)
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
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void start()}
        disabled={!practiceId}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        <OnAirIcon className="h-4 w-4" /> {mode === 'log' ? 'Log it' : 'Go on air'}
      </button>
      {practicedToday >= 3 && (
        <p className="text-center text-xs text-subtle">
          {practicedToday} members practiced today.
        </p>
      )}
      {practice?.loggedToday && mode !== 'log' && (
        <p className="text-center text-xs text-subtle">
          {practice.title} is already counted today. The sit still banks airtime.
        </p>
      )}
      <p className="text-center">
        <a href="/on-air/dispatches" className="text-xs font-medium text-subtle hover:text-text">
          Past Dispatches from Vera
        </a>
      </p>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</p>
  )
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
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition-colors ${
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
      className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-xs transition-colors ${
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
