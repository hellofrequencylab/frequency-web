'use client'

import { useEffect, useState } from 'react'
import { siteMembershipLine, type SiteMembershipView } from '@/lib/sites/site-member'
import { templeStamp, templeWhen } from '@/lib/sites/temple-events'

// THE TEMPLE'S "YOUR HOUSE" PAGE. The website is cached and anonymous (lib/core/anonymous-render.ts), so this
// island asks Frequency after the page is up, with the reader's own session, for their plan in this Space
// (app/api/sites/[slug]/membership) and the upcoming gatherings they are going to (app/api/sites/[slug]/rsvps).
// READ ONLY: a signed-out reader gets a sign-in link, and an RSVP is made and changed on Frequency (a labeled
// button), never from a cached site. Drawn with the house classes the Temple skin already styles.

interface Rsvp {
  eventId: string
  slug: string | null
  title: string
  startsAt: string
  endsAt: string | null
  status: string
}

interface Props {
  membershipEndpoint: string
  rsvpsEndpoint: string
  signInHref: string
  plansHref: string
  eventsHref: string
  brandName: string
}

type View = { state: 'loading' } | { state: 'out' } | { state: 'in'; firstName: string | null; membership: SiteMembershipView | null; rsvps: Rsvp[] }

const get = (url: string, signal: AbortSignal) => fetch(url, { credentials: 'include', signal, headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null))

export function SiteAccount({ membershipEndpoint, rsvpsEndpoint, signInHref, plansHref, eventsHref, brandName }: Props) {
  const [view, setView] = useState<View>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([get(membershipEndpoint, controller.signal), get(rsvpsEndpoint, controller.signal)])
      .then(([m, r]: [{ membership?: SiteMembershipView | null; firstName?: string | null } | null, { rsvps?: Rsvp[] } | null]) => {
        const firstName = typeof m?.firstName === 'string' && m.firstName ? m.firstName : null
        if (!firstName && !m?.membership) return setView({ state: 'out' })
        const t = m?.membership
        const membership = t && typeof t.tierName === 'string' && (t.status === 'active' || t.status === 'waitlist') ? { tierName: t.tierName, status: t.status } : null
        setView({ state: 'in', firstName, membership, rsvps: Array.isArray(r?.rsvps) ? r.rsvps : [] })
      })
      .catch(() => {
        if (!controller.signal.aborted) setView({ state: 'out' })
      })
    return () => controller.abort()
  }, [membershipEndpoint, rsvpsEndpoint])

  return (
    <div className="hs-account" data-state={view.state}>
      <span className="hs-eyebrow">Your house</span>
      <h1 className="hs-h2">{view.state === 'in' && view.firstName ? `Welcome home, ${view.firstName}.` : `Your house at ${brandName}`}</h1>
      {view.state === 'loading' && <p className="hs-lead" aria-live="polite">One moment.</p>}
      {view.state === 'out' && (
        <div className="hs-stack">
          <p className="hs-lead">Sign in on Frequency to see your plan and the gatherings you are going to.</p>
          <a href={signInHref} className="hs-btn hs-btn-primary">Sign in</a>
        </div>
      )}
      {view.state === 'in' && (
        <div className="hs-account-grid">
          <section className="hs-card" aria-label="Your plan">
            <span className="hs-eyebrow">Your plan</span>
            <h3>{siteMembershipLine(view.membership) ?? 'Not a member yet'}</h3>
            <a href={plansHref} className="hs-btn hs-btn-soft">{view.membership ? 'Manage on Frequency' : 'See the plans'}</a>
          </section>
          <section aria-label="Your gatherings" className="hs-account-list">
            <span className="hs-eyebrow">Your gatherings</span>
            {view.rsvps.length === 0 && (
              <p className="hs-lead">Nothing on your calendar yet. <a href={eventsHref}>See what is happening</a>.</p>
            )}
            {view.rsvps.map((e) => {
              const stamp = templeStamp(e.startsAt)
              return (
                <div key={e.eventId} className="hs-card hs-account-row">
                  {stamp && (
                    <span className="hs-stamp" aria-hidden>
                      <b>{stamp.day}</b>
                      <span>{stamp.month}</span>
                    </span>
                  )}
                  <div>
                    <h3>{e.title}</h3>
                    <span className="hs-when">{templeWhen(e.startsAt, e.endsAt)}{e.status === 'waitlist' ? ' · Waitlist' : ''}</span>
                  </div>
                  {e.slug && <a href={`${eventsHref}/${e.slug}`} className="hs-btn hs-btn-soft">Open</a>}
                </div>
              )
            })}
          </section>
        </div>
      )}
    </div>
  )
}
