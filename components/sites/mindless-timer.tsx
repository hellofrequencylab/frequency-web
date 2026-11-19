'use client'

// THE MINDLESS SITE TIMER (LIVE-2392): the Mindless design system's SessionPlayer, running. On a Mindless website the player was a
// picture of a timer: a play button that linked away, a bar stuck at 0:00. Here the same markup (the design's own class names, drawn by
// lib/theme/mindless-kit-css.ts) keeps time: play, pause, a bar that fills, a soft double bell at the end. Nothing is saved and nothing
// is sent. It lives only inside a Mindless site render, so it never styles a member, console or admin surface (ADR-1906).

import { useEffect, useRef, useState } from 'react'
import { BELL_TONES } from '@/lib/on-air'
import { endChime } from '@/lib/timer-audio'
import { breathCue, clockOf, parseLength, progressOf } from '@/lib/sites/mindless-timer'

type Run = 'ready' | 'running' | 'paused' | 'done'

const PLAY = <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
const PAUSE = <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z" fill="currentColor" /></svg>
const AGAIN = <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M3.6 4.6l1.6 5.4 5.3-1.9z" fill="currentColor" /></svg>

export interface MindlessPlayerProps {
  label?: string
  title: string
  guide?: string
  /** The session length in seconds. */
  seconds: number
  tone?: 'yellow' | 'raised' | 'bone'
  /** Seconds per breath in and per breath out. 0 keeps the guide line still. */
  pace?: number
  /** The big face: a drip clock above the bar. */
  big?: boolean
}

export function MindlessPlayer({ label, title, guide, seconds, tone = 'raised', pace = 0, big = false }: MindlessPlayerProps) {
  const [run, setRun] = useState<Run>('ready')
  const [elapsed, setElapsed] = useState(0)
  const banked = useRef(0) // ms kept from before the last pause
  const since = useRef(0) // when this stretch started
  const audio = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (run !== 'running') return
    const id = setInterval(() => {
      const ms = banked.current + (Date.now() - since.current)
      if (ms >= seconds * 1000) {
        banked.current = seconds * 1000
        setElapsed(seconds)
        setRun('done')
        endChime(audio.current, BELL_TONES[0])
      } else {
        setElapsed(ms / 1000)
      }
    }, 200)
    return () => clearInterval(id)
  }, [run, seconds])

  useEffect(() => () => { void audio.current?.close().catch(() => {}) }, [])

  function press() {
    if (run === 'running') {
      banked.current += Date.now() - since.current
      setRun('paused')
      return
    }
    if (run !== 'paused') {
      banked.current = 0
      setElapsed(0)
    }
    // The tap is the gesture that lets the bell sound at the end (Safari will not start audio any other way).
    try {
      audio.current ??= new AudioContext()
      void audio.current.resume()
    } catch {
      // the bell is a nicety, never a blocker
    }
    since.current = Date.now()
    setRun('running')
  }

  const cue = breathCue(elapsed, pace)
  const left = clockOf(Math.ceil(seconds - elapsed))
  const line = run === 'done' ? 'Done. Take it with you.' : run === 'paused' ? 'Paused. Pick it back up.' : run === 'running' && cue ? cue : guide
  const action = run === 'running' ? `Pause ${title}` : run === 'paused' ? `Keep going with ${title}` : run === 'done' ? `Start ${title} again` : `Start ${title}`

  return (
    <section className={`ml-player ml-player--${tone}${big ? ' ml-player--timer' : ''} is-${run}`}>
      <div className="ml-player__top">
        <div>
          {label && <p className="ml-eyebrow">{label}</p>}
          <h3 className="ml-player__title">{title}</h3>
          {line && <p className="ml-player__guide" aria-live={run === 'running' ? 'off' : 'polite'}>{line}</p>}
        </div>
        <button type="button" className="ml-player__play" onClick={press} aria-label={action}>
          {run === 'running' ? PAUSE : run === 'done' ? AGAIN : PLAY}
        </button>
      </div>
      {big && (
        <p className="ml-player__clock" role="timer" aria-live="off" aria-label={`${left} left`}>
          {[...left].map((c, i) => <span key={i} className={c === ':' ? 'is-colon' : undefined} aria-hidden="true">{c}</span>)}
        </p>
      )}
      <div className="ml-player__bar" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={Math.floor(elapsed)}>
        <span style={{ width: `${progressOf(elapsed, seconds)}%` }} />
      </div>
      <div className="ml-player__times"><span>{clockOf(elapsed)}</span><span>{clockOf(seconds)}</span></div>
    </section>
  )
}

export interface MindlessTimerChoice {
  title: string
  meta?: string
  guide?: string
  length: string
}

/** The timer section's working half: pick a length, press play. The first length that reads as a length starts chosen. */
export function MindlessTimerPanel({ label, choices, pace = 5 }: { label?: string; choices: MindlessTimerChoice[]; pace?: number }) {
  const rows = choices.map((c) => ({ ...c, seconds: parseLength(c.length) })).filter((c): c is MindlessTimerChoice & { seconds: number } => c.seconds !== null && !!c.title)
  const [at, setAt] = useState(0)
  const on = rows[Math.min(at, rows.length - 1)]
  if (!on) return null
  return (
    <div className="ml-timer">
      {rows.length > 1 && (
        <div className="ml-choices ml-timer__lengths" role="group" aria-label="Pick a length">
          {rows.map((r, i) => (
            <button key={i} type="button" className={`ml-choice${r === on ? ' is-on' : ''}`} aria-pressed={r === on} onClick={() => setAt(i)}>
              <span className="ml-choice__label">{r.title}</span>
              {r.meta && <span className="ml-choice__meta">{r.meta}</span>}
              <span className="ml-choice__aside">{clockOf(r.seconds)}</span>
            </button>
          ))}
        </div>
      )}
      <MindlessPlayer key={`${at}:${on.seconds}`} big label={label} title={on.title} guide={on.guide || on.meta} seconds={on.seconds} pace={pace} />
    </div>
  )
}
