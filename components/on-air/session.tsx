'use client'

// On Air — the session machine (ADR-229, docs/ON-AIR.md): setup → live → reveal.
//
// The live screen is the takeover: wake lock keeps the screen lit for the whole
// sit, fullscreen is requested best-effort on mobile, and the only control is a
// quiet End. Ending early carries zero shame copy — the log still counts; the
// practice is the unit, not the duration. "Just log" skips the timer entirely
// so On Air is never a tax on logging.

import { useEffect, useRef, useState } from 'react'
import { Zap, Radio, Wind, Timer as TimerIcon, Check } from 'lucide-react'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import {
  BREATH_PATTERNS,
  DURATION_PRESETS,
  patternBySlug,
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

export function OnAirSession({
  practices,
  defaultPracticeId,
  prefs,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
}) {
  const [stage, setStage] = useState<Stage>('setup')
  const [practiceId, setPracticeId] = useState(
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? '',
  )
  const [mode, setMode] = useState<SessionMode>(prefs.mode)
  const [minutes, setMinutes] = useState(prefs.minutes)
  const [patternSlug, setPatternSlug] = useState(prefs.pattern)
  const [startedAt, setStartedAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)

  const pattern = patternBySlug(patternSlug)
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
      if (left <= 0) void finish(false)
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, startedAt, minutes])

  // --- transitions -------------------------------------------------------------

  async function start() {
    if (!practiceId) return
    if (mode === 'log') {
      void finishWith(0, null)
      return
    }
    setStartedAt(Date.now())
    setRemaining(minutes * 60)
    setStage('live')
    void acquireQuiet()
  }

  async function finish(early: boolean) {
    if (finishing.current) return
    finishing.current = true
    const seconds = early ? Math.round((Date.now() - startedAt) / 1000) : minutes * 60
    try {
      navigator.vibrate?.(early ? 10 : [30, 80, 30])
    } catch {
      /* iOS web has no vibration */
    }
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

  if (stage === 'reveal' && payload) return <Reveal payload={payload} />

  if (stage === 'saving') {
    return (
      <CenterScreen>
        <Radio className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm font-medium text-muted">Off air. Counting it up…</p>
      </CenterScreen>
    )
  }

  if (stage === 'error') {
    return (
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
    )
  }

  if (stage === 'live') {
    const mm = Math.floor(remaining / 60)
    const ss = Math.floor(remaining % 60)
    return (
      <div className="flex min-h-[78vh] flex-col items-center justify-between py-6">
        <p className="flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.2em] text-primary-strong">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> On Air
        </p>

        <div className="flex flex-col items-center gap-6">
          {mode === 'breath' ? (
            <BreathVisualizer pattern={pattern} startedAt={startedAt} />
          ) : (
            <p className="text-7xl font-bold tabular-nums text-text">
              {mm}:{String(ss).padStart(2, '0')}
            </p>
          )}
          {mode === 'breath' && (
            <p className="text-sm tabular-nums text-subtle">
              {mm}:{String(ss).padStart(2, '0')} left
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void finish(true)}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          End
        </button>
      </div>
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
          <ModeButton active={mode === 'breath'} onClick={() => setMode('breath')} icon={Wind} label="Breathe" />
          <ModeButton active={mode === 'timer'} onClick={() => setMode('timer')} icon={TimerIcon} label="Timer" />
          <ModeButton active={mode === 'log'} onClick={() => setMode('log')} icon={Zap} label="Just log" />
        </div>
      </div>

      {mode === 'breath' && (
        <div>
          <Label>Pattern</Label>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
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
          </div>
          <p className="mt-1.5 text-xs text-subtle">{pattern.blurb}</p>
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
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void start()}
        disabled={!practiceId}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        <Radio className="h-4 w-4" /> {mode === 'log' ? 'Log it' : 'Go on air'}
      </button>
      {practice?.loggedToday && mode !== 'log' && (
        <p className="text-center text-xs text-subtle">
          {practice.title} is already counted today. The sit still banks airtime.
        </p>
      )}
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

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">{children}</div>
  )
}
