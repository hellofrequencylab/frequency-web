'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { isError } from '@/lib/action-result'
import { goingLine } from '@/lib/circles/going-line'
import type { MeetupPick } from '@/lib/circles/page-facts'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { FqCopyLink } from '@/components/frequency/members/shared/copy-link'
import { fqToast } from '@/components/frequency/members/shell/toast'

// THE MEETUPS PANEL (templates/circles/Circles.dc.html, "do something different"): the next dates as
// cards in a scrolling row, the chosen date below them with the circle's one primary action. The
// answer is the viewer's real RSVP: `setRsvpStatus` runs every server gate (booking window,
// capacity, approval), the card settles at once and rolls back when the write is refused.

type Answer = 'going' | 'no' | null
export type MeetupView = 'member' | 'new' | 'visitor' | 'host'

function first(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

export function FqMeetups({
  picks,
  view,
  signedIn,
  hostFirstName,
  attendance,
}: {
  picks: MeetupPick[]
  view: MeetupView
  signedIn: boolean
  hostFirstName: string | null
  /** "You've made 9 of the last 10": the viewer's own history, when there is enough of it. */
  attendance: { made: number; of: number } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sel, setSel] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(picks.map((p) => [p.id, p.mine === 'going' ? 'going' : p.mine === 'not_going' ? 'no' : null])),
  )
  if (picks.length === 0) return null

  const pick = picks[Math.min(sel, picks.length - 1)]
  // The server count includes the viewer when their row says going; take them out, then add the live answer.
  const others = (p: MeetupPick) => Math.max(0, p.going - (p.mine === 'going' ? 1 : 0))
  const goingNow = (p: MeetupPick) => others(p) + (answers[p.id] === 'going' ? 1 : 0)
  const status = (p: MeetupPick) =>
    answers[p.id] === 'going'
      ? others(p) > 0 ? `✓ You + ${others(p)}` : '✓ You'
      : answers[p.id] === 'no'
        ? 'Not this time'
        : goingNow(p) > 0 ? `${goingNow(p)} going` : 'Be first'

  function answer(p: MeetupPick, next: Answer, message: string) {
    const before = answers[p.id] ?? null
    setAnswers((a) => ({ ...a, [p.id]: next }))
    start(async () => {
      const res = await setRsvpStatus(p.id, next === 'going' ? 'going' : 'not_going', { slug: p.slug })
      if (res && isError(res)) {
        setAnswers((a) => ({ ...a, [p.id]: before }))
        fqToast('We could not save that. Try again.')
        return
      }
      fqToast(message)
      router.refresh()
    })
  }

  const mine = answers[pick.id] ?? null
  const names = pick.faces.map((f) => first(f.name))
  const line = goingLine({ names, total: others(pick), you: mine === 'going' })
  const rhythm =
    view === 'new'
      ? hostFirstName ? `Your first one. ${hostFirstName} will say hello.` : 'Your first one. Someone will say hello.'
      : view === 'visitor'
        ? 'You can come once before you join. Most people do.'
        : attendance
          ? `You've made ${attendance.made} of the last ${attendance.of} gatherings.`
          : null
  const note = [pick.location, pick.note].filter(Boolean).join(' · ')

  return (
    <section className="panel fqc-meet" aria-label="Meetups">
      <div className="fqc-meet-head">
        <div>
          <span className="k">Meetups</span>
          <p className="fqc-meet-sub">Pick a morning. Come when you can.</p>
        </div>
        <Link className="fqc-meet-all" href="/events">
          All events
        </Link>
      </div>

      <div className="fqc-picker" role="listbox" aria-label="Pick a date">
        {picks.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={i === sel}
            className={i === sel ? 'fqc-date on' : 'fqc-date'}
            onClick={() => setSel(i)}
          >
            <span className="fqc-date-wd">{p.weekday}</span>
            <span className="fqc-date-n">{p.day}</span>
            <span className="fqc-date-t">{p.time}</span>
            <span className="fqc-date-s">{status(p)}</span>
          </button>
        ))}
      </div>

      <div className="fqc-detail">
        <div className="fqc-detail-main">
          <span className="fqc-when">{pick.when}</span>
          <Link className="fqc-detail-title" href={`/events/${pick.slug}`}>
            {pick.title}
          </Link>
          {note && <p className="fqc-detail-note">{note}</p>}
          {line && (
            <div className="fqc-going">
              {pick.faces.length > 0 && (
                <span className="faces">
                  {pick.faces.map((f) => (
                    <FqAvatar key={f.name} url={f.avatarUrl} name={f.name} size="s" />
                  ))}
                </span>
              )}
              <span>{line}</span>
            </div>
          )}
          {rhythm && <p className="fqc-rhythm">{rhythm}</p>}
        </div>

        <div className="fqc-detail-act">
          {!signedIn ? (
            <Link className="btn pa lg fqc-go" href={`/events/${pick.slug}`}>
              See the meetup
            </Link>
          ) : mine === 'going' ? (
            <>
              <div className="fqc-is-going">
                <span className="fqc-is-going-l">
                  <FqIcon name="check" /> You&apos;re going
                </span>
                <button type="button" className="btn txt" disabled={pending} onClick={() => answer(pick, null, 'You are off the list.')}>
                  Change
                </button>
              </div>
              <div className="fqc-soft-row">
                <FqCopyLink
                  label="Bring someone"
                  className="btn sm fqc-soft"
                  path={`/events/${pick.slug}`}
                  done="Invite link copied. Friends can RSVP without an account."
                />
                <a className="btn sm fqc-soft fqc-soft-ic" href={`/events/${pick.slug}/event.ics`} aria-label="Add to calendar">
                  <FqIcon name="event" />
                </a>
              </div>
            </>
          ) : mine === 'no' ? (
            <>
              <div className="fqc-skipped">
                <span>Not this time</span>
                <button type="button" className="btn txt" disabled={pending} onClick={() => answer(pick, 'going', "You're going. Your circle can see it.")}>
                  Undo
                </button>
              </div>
              {hostFirstName && <p className="fqc-skip-note">{hostFirstName} sees you can&apos;t make it. No one is counting.</p>}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn pa lg fqc-go"
                disabled={pending}
                onClick={() => answer(pick, 'going', "You're going. Your circle can see it.")}
              >
                <FqIcon name="check" /> I&apos;m going
              </button>
              <button type="button" className="btn txt" disabled={pending} onClick={() => answer(pick, 'no', 'Noted. Come when you can.')}>
                Can&apos;t make this one
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
