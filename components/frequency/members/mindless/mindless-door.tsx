'use client'

import { useState, useSyncExternalStore } from 'react'
import { OnAirSession, type OnAirPractice } from '@/components/on-air/session'
import { loadLiveSession } from '@/lib/on-air/live-session'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FqIcon } from '@/components/frequency/icon'
import { useMovement } from '@/components/on-air/movement'

// THE MINDLESS DOOR under Frequency (design_handoff/frequency/templates/members/Mindless.html): Tune
// out, the breathing orb, a length, Start. Start hands straight to the one timer (OnAirSession, the
// same engine /on-air has always run) with the chosen practice and length and autoStart, so the
// countdown, logging, Zaps, streak and reveal are untouched. Only the first screen is new.
//
// What the reference does not draw but the timer has always offered stays, in the kit's idiom:
//   - WHICH practice, when the member has more than one on their list (chips above the lengths);
//     the Journey leg driving today's list is named beside it.
//   - The full setup (mode, breath pattern, bells, ambient sound): "More options" opens the engine on
//     its own setup screen instead of auto-starting.
//   - The presence line (members who practised today, shown at three or more, as the engine does).
//   - Get Moving. The one timer has two modes (the header's Mindless door: "Be Still or Get Moving");
//     this door is Be Still, and Get Moving opens the movement timer through the same Mindless overlay
//     (useMovement), so the walk, run or stretch logs exactly as it does from anywhere else.
//
// A sit that is already running (crash-recovered from this device) skips the door: the engine owns the
// screen and resumes it, exactly as the route did before.

type SessionProps = Omit<React.ComponentProps<typeof OnAirSession>, 'autoStart' | 'minutesOverride'>

const LENGTHS = [3, 5, 10, 20]

function subscribeNever() {
  return () => {}
}

/** The practice's own length, when it has one. */
function ownLength(p: OnAirPractice | undefined): number | null {
  return p?.durationMin && p.durationMin > 0 ? p.durationMin : null
}

export function MindlessDoor({
  session,
  initialPracticeId,
  rememberedMinutes,
}: {
  session: SessionProps
  /** The practice the door opens on: the default, else the first not yet logged today. */
  initialPracticeId: string
  /** The member's remembered length, for a practice with no length of its own. */
  rememberedMinutes: number
}) {
  // A live sit on this device is read from localStorage, so it is known only on the client. The
  // server snapshot is "none", the door; the engine replaces it on hydration when a sit is waiting.
  const running = useSyncExternalStore(
    subscribeNever,
    () => loadLiveSession('mindless') !== null,
    () => false,
  )
  const { practices } = session
  const [practiceId, setPracticeId] = useState(initialPracticeId)
  const practice = practices.find((p) => p.id === practiceId)
  const own = ownLength(practice)
  const lockedMinutes = practice?.durationLocked && own ? own : null
  const [picked, setPicked] = useState<number | null>(null)
  const minutes = lockedMinutes ?? picked ?? own ?? rememberedMinutes
  const lengths = lockedMinutes
    ? [lockedMinutes]
    : Array.from(new Set([...LENGTHS, own ?? rememberedMinutes])).sort((a, b) => a - b)
  const [stage, setStage] = useState<'door' | 'start' | 'setup'>('door')
  const movement = useMovement()

  if (running) return <OnAirSession {...session} />
  const chosen = { ...session, defaultPracticeId: practiceId || session.defaultPracticeId, explicitPracticeId: practiceId || undefined }
  if (stage === 'start') return <OnAirSession {...chosen} autoStart minutesOverride={minutes} />
  if (stage === 'setup') return <OnAirSession {...chosen} />

  const legs = session.journeyLegs ?? []
  const practicedToday = session.practicedToday ?? 0

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

      {practices.length > 1 && (
        <div className="stack mc-gap-10 mc-center">
          {legs.length > 0 && (
            <span className="t2">
              {legs
                .map((l) => (l.week ? `${l.title} · Week ${l.week} of ${l.weeks}` : l.title))
                .join(' · ')}
            </span>
          )}
          <div className="chips mc-chips-center" role="radiogroup" aria-label="Which practice">
            {practices.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === practiceId}
                className={p.id === practiceId ? 'chip on' : 'chip'}
                onClick={() => {
                  setPracticeId(p.id)
                  setPicked(null)
                }}
              >
                {p.title}
                {p.loggedToday ? ' · done today' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chips mc-chips-center" role="radiogroup" aria-label="How long">
        {lengths.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === minutes}
            className={m === minutes ? 'chip on' : 'chip'}
            onClick={() => setPicked(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      <div className="stack mc-gap-10 mc-center">
        <button type="button" className="btn pa lg" onClick={() => setStage('start')}>
          <FqIcon name="breath" />
          Start
        </button>
        <span className="row mc-chips-center mc-gap-8">
          <button type="button" className="btn txt" onClick={() => setStage('setup')}>
            More options
          </button>
          <button type="button" className="btn txt" onClick={() => movement.open()}>
            Get Moving instead
          </button>
        </span>
        {practicedToday >= 3 && <span className="t2">{practicedToday.toLocaleString('en-US')} members practiced today.</span>}
      </div>
    </MembersBody>
  )
}
