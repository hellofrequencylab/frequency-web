'use client'

import { useEffect, useState, useTransition } from 'react'
import { checkInEvent, type CheckInResult } from '@/app/(main)/events/actions'
import { FqIcon } from '@/components/frequency/icon'
import { showZapToast } from '@/components/zap-toast'
import { checkInWindowOpenAt } from '@/lib/events/checkin-window'
import { SPECIAL_INSTRUCTIONS_LABEL } from '@/lib/events/special-instructions'
import { checkInSurfaceState, countdownParts, type CheckInSurfaceInput } from '@/lib/events/checkin-surface'

/**
 * THE CHECK-IN SURFACE, FREQUENCY (SCAN-903). Owner, 2026-10-14: "the countdown timers don't seem
 * like they are a part of the theme." Same behaviour as components/events/event-checkin-surface.tsx
 * (the DAWN one, unchanged): the same state machine (`checkInSurfaceState`), the same ticker, the same
 * check-in action and Zap toast, the same door note. Only the look is the kit's: no card at all (the
 * owner's follow-up, 2026-10-14: it sits straight on the page), a supporting clock in the display face
 * with tabular figures and the iridescent sweep, clear unit labels, and the live dot
 * once the doors are open.
 *
 * The server supplies its render instant so the first frame already shows a meaningful clock.
 * The client starts from that same value and ticks after mount, avoiding a blank or zero clock.
 * Resolved start/end instants follow the canonical door window as time passes; authorization
 * remains in checkInEvent. `startsAtMs` always arrives through eventInstant (ADR-1150).
 */
export function FqEventCountdown({
  eventId,
  doorNote,
  endsAtMs,
  renderedAtMs,
  ...gates
}: Omit<CheckInSurfaceInput, 'nowMs'> & {
  readonly renderedAtMs?: number
  readonly endsAtMs?: number | null
  readonly eventId: string
  readonly doorNote?: string | null
}) {
  const { startsAtMs } = gates
  const [now, setNow] = useState<number | null>(renderedAtMs ?? null)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const nowMs = now ?? (startsAtMs ?? 0)
  const state = checkInSurfaceState({ ...gates, windowOpen: now === null ? gates.windowOpen : checkInWindowOpenAt(startsAtMs, endsAtMs ?? null, nowMs), nowMs })
  const checkedIn = result?.ok === true || state.kind === 'done'

  if (state.kind === 'hidden') return null

  const zaps = state.zaps
  const earned = result?.zapsAwarded ?? zaps

  return (
    <div className="fqm-evh-cd">
      {state.kind === 'countdown' && (
        <>
          <span className="k">Starts in</span>
          {/* One accessible reading for the whole clock; the units are for the eye. */}
          <span className="fqm-evh-cd-n" role="timer" aria-label={countdownParts(state.startsAtMs - nowMs).map((p) => `${Number(p.value)} ${p.label}`).join(' ')}>
            {countdownParts(state.startsAtMs - nowMs).map((p) => (
              <span key={p.label} className="fqm-evh-cd-u" aria-hidden>
                <b className="fq-iri-text on-light">{p.value}</b>
                <i>{p.label}</i>
              </span>
            ))}
          </span>
        </>
      )}

      {state.kind === 'open' && !checkedIn && (
        <>
          <span className="fqm-evh-cd-live">
            <span className="dot live" aria-hidden />
            Doors are open
          </span>
          <button
            type="button"
            className="btn pa sm"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() =>
              start(async () => {
                const res = await checkInEvent(eventId)
                setResult(res)
                if (res.ok && !res.alreadyCheckedIn && res.zapsAwarded) {
                  showZapToast({ amount: res.zapsAwarded, label: 'Checked in' })
                }
              })
            }
          >
            <FqIcon name="checkin" />
            Check in
          </button>
        </>
      )}

      {checkedIn && (
        <span className="fqm-evh-cd-live is-done">
          <FqIcon name="check" />
          {earned > 0 ? `Checked in · +${earned} Zaps` : 'Checked in'}
        </span>
      )}

      {state.kind === 'waiting' && (
        <span className="fqm-evh-cd-live">
          <span className="dot live" aria-hidden />
          Check-in is open
        </span>
      )}

      {!checkedIn && zaps > 0 && (
        <span className="fqm-evh-cd-facts">
          <span className="t2">
            <FqIcon name="qr" /> Check in at the door
          </span>
          <span className="t2">
            <FqIcon name="zap" /> Earn {zaps} Zaps
          </span>
        </span>
      )}

      {doorNote && state.kind !== 'countdown' && (
        <span className="fqm-evh-cd-note">
          <span className="k">{SPECIAL_INSTRUCTIONS_LABEL}</span>
          <span className="t2">{doorNote}</span>
        </span>
      )}
    </div>
  )
}
