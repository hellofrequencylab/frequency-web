'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { fqToast } from '../shared/toast'
import { FqAvatar, phStyle } from '../shared/avatar'
import { distanceLabel, friendsLine, type HomeIntent, type HomeSlot, type RankedHomeEvent } from '@/lib/feed/home-rank'
import type { HomePlan } from '@/lib/feed/frequency-home'

// UP NEXT, NEAR YOU and YOUR PEOPLE'S PLANS: one island because one piece of state drives all three
// (the design's `going` map). Every Going / Maybe / Can't go is the real RSVP action
// (setRsvpStatus), and a refusal rolls the button back and says so: a paid or closed event answers
// on its own page, so the toast points there instead of lighting a Going nobody holds.

const INTENTS: [HomeIntent | 'all', string][] = [
  ['all', 'Anything'],
  ['move', 'Move'],
  ['sit', 'Sit'],
  ['social', 'Social'],
  ['learn', 'Learn'],
  ['give', 'Give back'],
]
const SLOTS: [HomeSlot, string][] = [
  ['now', 'Now'],
  ['tonight', 'Tonight'],
  ['tomorrow', 'Tomorrow'],
  ['week', 'This week'],
]
const RADII = [1, 5, 15] as const

/** The Caught up card's "Find something for tonight" reaches in here through this event. */
export const NEAR_EVENT = 'fq:near-tonight'

type Status = 'going' | 'maybe' | 'not_going' | null

export function FeedPlanner({
  events,
  plans,
  doorZaps,
  hasHome,
}: {
  events: RankedHomeEvent[]
  plans: HomePlan[]
  doorZaps: number
  hasHome: boolean
}) {
  const [status, setStatus] = useState<Record<string, Status>>(() => Object.fromEntries(events.map((e) => [e.id, e.myStatus])))
  const [pick, setPick] = useState(0)
  const [heroDone, setHeroDone] = useState(false)
  const [intent, setIntent] = useState<HomeIntent | 'all'>('all')
  const [slot, setSlot] = useState<HomeSlot>('now')
  const [radius, setRadius] = useState<number>(5)
  const [, startTransition] = useTransition()
  const nearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = () => {
      setSlot('tonight')
      setIntent('all')
      const el = nearRef.current
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: still ? 'auto' : 'smooth' })
    }
    window.addEventListener(NEAR_EVENT, on)
    return () => window.removeEventListener(NEAR_EVENT, on)
  }, [])

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  // The hero carousel: the top three ranked picks the member has not answered yet. Fixed at mount
  // so answering one advances to the next instead of reshuffling under the finger.
  const [picks] = useState(() => events.filter((e) => e.myStatus == null || e.myStatus === 'maybe').slice(0, 3).map((e) => e.id))

  function rsvp(id: string, next: 'going' | 'maybe' | 'not_going', message: string | null) {
    const e = byId.get(id)
    if (!e) return
    const prev = status[id] ?? null
    setStatus((s) => ({ ...s, [id]: next }))
    startTransition(async () => {
      const res = await setRsvpStatus(id, next, { slug: e.slug })
      if (!res || 'error' in res) {
        setStatus((s) => ({ ...s, [id]: prev }))
        fqToast(next === 'going' ? `${e.title} takes its RSVP on the event page.` : 'That did not save. Try again.')
        if (next === 'going') setHeroDone(false)
        return
      }
      if (message) fqToast(message)
    })
  }

  const toggle = (id: string) => {
    const e = byId.get(id)
    if (!e) return
    if (status[id] === 'going') rsvp(id, 'not_going', `Removed ${e.title} from your week.`)
    else rsvp(id, 'going', `You’re going to ${e.title}.`)
  }

  const heroId = picks.length > 0 ? picks[pick % picks.length] : null
  const hero = heroId ? byId.get(heroId) ?? null : null
  const nextPick = () => {
    setPick((p) => p + 1)
    setHeroDone(false)
  }

  const fits = (e: RankedHomeEvent) => e.distanceMi == null ? !!e.myCircleName || !hasHome : e.distanceMi <= radius
  const near = events.filter((e) => e.slot === slot && (intent === 'all' || e.intent === intent) && fits(e) && status[e.id] !== 'not_going')
  const withFriends = near.filter((e) => e.friends.length > 0).length
  // The live count; an empty result says so in the body ("Nothing that fits within N mi."), not twice.
  const resultLine = `${near.length} ${near.length === 1 ? 'thing' : 'things'}${withFriends ? ` · ${withFriends} with friends` : ''}`

  return (
    <>
      {hero ? (
        <section className="fa-hero" aria-label="Up next for you">
          <Link href={`/events/${hero.slug}`} className="fa-hero-ph ph" style={phStyle(hero.coverUrl)} aria-label={hero.title}>
            {hero.badge && <span className="fa-badge">{hero.badge}</span>}
          </Link>
          <div className="fa-hero-body">
            <div className="fa-between">
              <span className="k">Up next for you</span>
              {picks.length > 1 && <span className="fa-f13">{`${(pick % picks.length) + 1} of ${picks.length}`}</span>}
            </div>
            <Link href={`/events/${hero.slug}`} className="fa-hero-title">{hero.title}</Link>
            <span className="fa-hero-where">{whereLine(hero)}</span>
            <span className="fa-who">
              {hero.friends.length > 0 && (
                <span className="faces">
                  {hero.friends.slice(0, 3).map((f) => <FqAvatar key={f.id} url={f.avatarUrl} name={f.name} />)}
                </span>
              )}
              <span className="fa-m13">
                {friendsLine(hero.friends, hero.goingCount, hero.live)}
                {doorZaps > 0 ? ` · ⚡ ${doorZaps} at the door` : ''}
              </span>
            </span>
            {/* The where line already carries the distance; a why that only restates it is dropped. */}
            {!(distanceLabel(hero.distanceMi) && /^(Close to home\.|[\d.]+ mi from home\.)$/.test(hero.why)) && <span className="why">{hero.why}</span>}
            {!heroDone ? (
              <div className="fa-actions">
                <button
                  type="button"
                  className="btn pa lg"
                  onClick={() => {
                    setHeroDone(true)
                    rsvp(hero.id, 'going', null)
                  }}
                >
                  Going
                </button>
                <button
                  type="button"
                  className="btn lg"
                  onClick={() => {
                    rsvp(hero.id, 'maybe', `Marked maybe for ${hero.title}. Next idea.`)
                    nextPick()
                  }}
                >
                  Maybe
                </button>
                <button
                  type="button"
                  className="btn txt lg"
                  onClick={() => {
                    rsvp(hero.id, 'not_going', null)
                    nextPick()
                  }}
                >
                  Can’t go
                </button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 12, marginTop: 4 }}>
                <span className="fa-done">
                  <FqIcon name="checkin" />
                  You’re going. It’s on your week.
                </span>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Link href={`/events/${hero.slug}`} className="btn sm">
                    See the event
                  </Link>
                  {picks.length > 1 && (
                    <button type="button" className="btn txt sm" onClick={nextPick}>
                      Next idea →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="fa-hero" aria-label="Up next for you">
          <div className="fa-hero-body">
            <span className="k">Up next for you</span>
            <span className="fa-serif18">Nothing ranked for you this week yet.</span>
            <div className="fa-actions">
              <Link href="/events" className="btn">
                Browse events
              </Link>
            </div>
          </div>
        </section>
      )}

      <div ref={nearRef} className="fa-sh near">
        <span className="fa-h18">
          <span className="fa-livedot fq-breathe" aria-hidden />
          Near you
        </span>
        {near.length > 0 && <span className="fa-f13">{resultLine}</span>}
      </div>
      <div className="chips fa-intents" role="group" aria-label="What you’re up for">
        {INTENTS.map(([k, label]) => (
          <button key={k} type="button" className={intent === k ? 'chip on' : 'chip'} aria-pressed={intent === k} onClick={() => setIntent(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="fa-filters">
        <div className="tabs" role="group" aria-label="When">
          {SLOTS.map(([k, label]) => (
            <button key={k} type="button" className={slot === k ? 'on' : undefined} aria-pressed={slot === k} onClick={() => setSlot(k)}>
              {label}
            </button>
          ))}
        </div>
        {hasHome && (
          <div className="fa-radius" role="group" aria-label="How far">
            <FqIcon name="pin" />
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)}>
                {r} mi
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="list fa-near">
        {near.map((e) => {
          const going = status[e.id] === 'going'
          return (
            <div key={e.id}>
              <Link href={`/events/${e.slug}`} className="fa-thumb ph" style={phStyle(e.coverUrl)} aria-label={e.title} />
              <span className="fa-rowtxt">
                <span className="t1">
                  {e.live && <span className="dot fq-breathe" aria-hidden />}
                  <Link href={`/events/${e.slug}`}>{e.title}</Link>
                </span>
                <span className="t2">{whereLine(e)}</span>
                <span className="row" style={{ gap: 8 }}>
                  {e.friends.length > 0 && (
                    <span className="faces">
                      {e.friends.slice(0, 3).map((f) => <FqAvatar key={f.id} url={f.avatarUrl} name={f.name} />)}
                    </span>
                  )}
                  <span className="fa-whytag">{friendsLine(e.friends, e.goingCount, e.live)}</span>
                </span>
              </span>
              <button type="button" className={going ? 'btn pa' : 'btn'} aria-pressed={going} onClick={() => toggle(e.id)}>
                {going && <FqIcon name="checkin" />}
                {going ? 'Going' : 'Go'}
              </button>
            </div>
          )
        })}
      </div>
      {near.length === 0 && (
        <div className="fa-empty">
          <span className="fa-serif18">{hasHome ? `Nothing that fits within ${radius} mi.` : 'Nothing on for that yet.'}</span>
          {hasHome && radius < 15 ? (
            <button type="button" className="btn sm" onClick={() => setRadius(15)}>
              Widen to 15 mi
            </button>
          ) : !hasHome ? (
            <Link href="/settings/profile" className="btn sm">
              Set your home base
            </Link>
          ) : null}
        </div>
      )}

      {plans.length > 0 && (
        <>
          <div className="fa-sh">
            <span className="fa-h18">Your people’s plans</span>
            <span className="fa-f13">This week</span>
          </div>
          <div className="fa-plans">
            {plans.map((p) => {
              const going = status[p.eventId] === 'going'
              return (
                <div key={`${p.who}-${p.eventId}`} className="fa-plan">
                  <FqAvatar url={p.avatarUrl} name={p.who} />
                  <span className="stack" style={{ gap: 5 }}>
                    <span className="t1">{p.who}</span>
                    <Link href={`/events/${p.eventSlug}`} className="t2">
                      {p.what}
                    </Link>
                  </span>
                  <span className="grow" />
                  {going ? (
                    <span className="fa-in">You’re in</span>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => toggle(p.eventId)}>
                      Join
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function whereLine(e: RankedHomeEvent): string {
  // A non-breaking space keeps "4.7 mi" on one line when the where line wraps.
  const dist = distanceLabel(e.distanceMi)?.replace(' ', '\u00a0')
  return [e.when, e.location, dist ?? (e.myCircleName ? e.myCircleName : null)].filter(Boolean).join(' · ')
}
