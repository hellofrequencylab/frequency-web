// "KEEP GOING": the panel every template page ends on before the footer. Server component, no JS.
//
//   variant "band" (default)  the big closing band, `section.sec.kg > .wrap > .next2`, used by People,
//                             Spaces, Features, Pricing and Stories. Two actions, stacked.
//   variant "row"             the compact `.next` row Vision uses: one line and one action.
//
//   <KeepGoing title="Find your first Circle." body="The nearest one might meet this week."
//     primary={{ href: '/the-community', label: 'Find your Circle →' }}
//     secondary={{ href: '/spaces', label: 'Open your Space' }} />
//
// The kicker defaults to "Keep going" and the energy to "charge", as on every template page.

import Link from 'next/link'
import type { Energy } from '@/lib/frequency/site-pages'

export interface KeepGoingAction {
  href: string
  label: string
}

export interface KeepGoingProps {
  title: string
  body?: string
  primary: KeepGoingAction
  secondary?: KeepGoingAction
  kicker?: string
  energy?: Energy
  variant?: 'band' | 'row'
  /** Section id, for in-page links. */
  id?: string
}

export function KeepGoing({
  title,
  body,
  primary,
  secondary,
  kicker = 'Keep going',
  energy = 'charge',
  variant = 'band',
  id,
}: KeepGoingProps) {
  if (variant === 'row') {
    return (
      <div className="next fq-iri-rim" data-energy={energy} id={id}>
        <div className="fq-aura" style={{ '--fq-aura-opacity': '.35' } as React.CSSProperties} />
        <div>
          <span className="k">{kicker}</span>
          <h3>{title}</h3>
          {body && <p className="fq-kg-body">{body}</p>}
        </div>
        <Link className="btn fq-iri-btn" href={primary.href}>
          {primary.label}
        </Link>
      </div>
    )
  }
  return (
    <section className="sec kg" id={id}>
      <div className="wrap">
        <div className="next2" data-energy={energy}>
          <div className="fq-aura" style={{ '--fq-aura-opacity': '.55' } as React.CSSProperties} />
          <span className="rings" aria-hidden="true" />
          <div className="n2t">
            <span className="k">{kicker}</span>
            <h3>{title}</h3>
            {body && <p>{body}</p>}
          </div>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={primary.href}>
              {primary.label}
            </Link>
            {secondary && (
              <Link className="btn btn-ghost fq-iri-rim" href={secondary.href}>
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
