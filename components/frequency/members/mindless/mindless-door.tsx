'use client'

import { useState, useSyncExternalStore } from 'react'
import { OnAirSession } from '@/components/on-air/session'
import { loadLiveSession } from '@/lib/on-air/live-session'
import { MembersBody } from '@/components/frequency/members/shared/members-body'

// THE MINDLESS DOOR under Frequency (design_handoff/frequency/templates/members/Mindless.html): Tune
// out, the breathing orb, a length, Start. Start hands straight to the one timer (OnAirSession, the
// same engine /on-air has always run) with the chosen length and autoStart, so the countdown, logging,
// Zaps, streak and reveal are untouched. Only the first screen is new.
//
// A sit that is already running (crash-recovered from this device) skips the door: the engine owns the
// screen and resumes it, exactly as the route did before.

type SessionProps = Omit<React.ComponentProps<typeof OnAirSession>, 'autoStart' | 'minutesOverride'>

const LENGTHS = [3, 5, 10, 20]

function subscribeNever() {
  return () => {}
}

export function MindlessDoor({
  session,
  initialMinutes,
  lockedMinutes,
}: {
  session: SessionProps
  /** The opening length: the default practice's own, else the remembered one. */
  initialMinutes: number
  /** The author pinned this practice's length: it is the only choice. */
  lockedMinutes: number | null
}) {
  // A live sit on this device is read from localStorage, so it is known only on the client. The
  // server snapshot is "none", the door; the engine replaces it on hydration when a sit is waiting.
  const running = useSyncExternalStore(
    subscribeNever,
    () => loadLiveSession('mindless') !== null,
    () => false,
  )
  const lengths = lockedMinutes
    ? [lockedMinutes]
    : Array.from(new Set([...LENGTHS, initialMinutes])).sort((a, b) => a - b)
  const [minutes, setMinutes] = useState(lockedMinutes ?? initialMinutes)
  const [started, setStarted] = useState(false)

  if (running) return <OnAirSession {...session} />
  if (started) return <OnAirSession {...session} autoStart minutesOverride={minutes} />

  return (
    <MembersBody className="mc-door">
      <div className="stack mc-gap-12 mc-center">
        <span className="k">The Quest · Mindless</span>
        <h1 className="h1">
          Tune <span className="serif">out.</span>
        </h1>
        <span className="meta">Put the phone face down. We&apos;ll keep your streak.</span>
      </div>
      <div className="mc-orb-wrap" aria-hidden>
        <span className="fq-breathe mc-orb-glow" />
        <span className="fq-breathe mc-orb-core" />
      </div>
      <span className="why mc-why-l">Breathe in for four. Out for six.</span>
      <div className="chips mc-chips-center" role="radiogroup" aria-label="How long">
        {lengths.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === minutes}
            className={m === minutes ? 'chip on' : 'chip'}
            onClick={() => setMinutes(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      <button type="button" className="btn pa lg" onClick={() => setStarted(true)}>
        Start
      </button>
    </MembersBody>
  )
}
