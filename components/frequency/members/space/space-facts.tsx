import Link from 'next/link'
import { formatEventWhen } from '@/lib/time/zone'
import { eventDateBadge } from '@/lib/utils'
import type { PublicSpaceFacts } from '@/lib/spaces/public-facts'

// THE SIDE COLUMN OF THE SIGNED-OUT SPACE PAGE, FREQUENCY (SCAN-883). The DAWN page kept a right column
// beside the Space; the Frequency rebuild dropped it, so a visitor had to scroll every block to learn
// where the Space is or when it opens. This puts the key facts back, as kit cards: the primary action and
// the way to follow, where and when, how to reach it, and what is coming up. Every card renders only when
// its facts exist, so a virtual Space with nothing but a name shows the join card alone.
//
// Server component, no JS, no reads: lib/spaces/public-facts.ts gathers everything without a viewer, and
// this file only places it. It sits OUTSIDE `data-space-page`, so it wears Frequency's own type, never the
// Space's font set (that set dresses the Space's blocks, app/themes/frequency/space-page.css).

export function FqSpaceFacts({
  facts,
  brandName,
  joinHref,
  joinLabel,
  calendarHref,
}: {
  facts: PublicSpaceFacts
  brandName: string
  /** Where "follow" goes for a visitor with no account. */
  joinHref: string
  joinLabel: string
  /** The Space's Calendar tab, when its menu has one. */
  calendarHref?: string | null
}) {
  const { address, hours, phone, email, website, socials, cta, events } = facts
  const reach = phone || email || website || socials.length > 0
  return (
    <>
      <section className="fqs-card fqs-join" aria-label={`Follow ${brandName}`}>
        <span className="fqs-card-k">Stay close</span>
        <p className="fqs-card-t">Follow {brandName}</p>
        <p className="fqs-card-p">Join free to follow this Space, hear what is next, and be a face the host recognizes.</p>
        <div className="fqs-card-acts">
          {cta && (
            <Link
              href={cta.href}
              className="btn pa"
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {cta.label}
            </Link>
          )}
          <Link href={joinHref} className={cta ? 'btn' : 'btn pa'}>
            {joinLabel}
          </Link>
        </div>
      </section>

      {(address.length > 0 || hours) && (
        <section className="fqs-card" aria-label="Visit">
          <span className="fqs-card-k">Visit</span>
          {address.length > 0 && (
            <address className="fqs-card-p fqs-addr">
              {address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          )}
          {hours && (
            <div className="fqs-hours">
              <span className="fqs-card-l">Hours</span>
              <p className="fqs-card-p fqs-pre">{hours}</p>
            </div>
          )}
        </section>
      )}

      {reach && (
        <section className="fqs-card" aria-label="Contact">
          <span className="fqs-card-k">Contact</span>
          <ul className="fqs-list">
            {phone && (
              <li>
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`}>{email}</a>
              </li>
            )}
            {website && (
              <li>
                <a href={website.href} target="_blank" rel="noopener noreferrer">
                  {website.label}
                </a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <div className="fqs-socials">
              {socials.map((s) => (
                <a key={s.href} className="tag" href={s.href} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="fqs-card" aria-label="Coming up">
          <span className="fqs-card-k">Coming up</span>
          <ul className="fqs-events">
            {events.map((e) => {
              const chip = eventDateBadge(e.startsAt)
              return (
                <li key={e.slug}>
                  <Link href={`/events/${e.slug}`} className="fqs-event">
                    <span className="fqs-date" aria-hidden>
                      <span>{chip.month}</span>
                      <b>{chip.day}</b>
                    </span>
                    <span className="fqs-event-tx">
                      <span className="fqs-event-t">{e.title}</span>
                      <span className="fqs-card-l">
                        {[formatEventWhen(e.startsAt, e.timeZone, { style: 'dayTime' }), e.place].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {calendarHref && (
            <Link href={calendarHref} className="meta fqs-more">
              See the calendar →
            </Link>
          )}
        </section>
      )}
    </>
  )
}
