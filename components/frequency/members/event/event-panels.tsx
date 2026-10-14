import Link from 'next/link'
import { getEventContext } from '@/lib/events/active-event'
import { showsOrganizerCredit } from '@/lib/events/platform-credit'
import { normalizeHttpUrl, safeHttpUrl } from '@/lib/safe-url'
import { createClient } from '@/lib/supabase/server'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { FqIcon } from '@/components/frequency/icon'
import { FqEventMap } from './event-map'
import { FqMessageHost } from './message-host'

// THE EVENT PAGE'S SECTIONS, IN THE KIT (templates/members/Event.html: About, Plan, Where down the
// main column; Host down the side). Each reads the request-scoped event context the page stamped
// (setEventContext), exactly the data the DAWN modules render (the poster harvest's schedule,
// features and links; the facts' address and map; the host, the hosting Space, the collaborator
// Spaces and the co hosts), so nothing is re-derived and nothing is invented. Each renders nothing
// when it has nothing to say, as its DAWN module does.

/** Plan, Good to know and Links: the poster harvest the host confirmed. */
export function FqEventPlan() {
  const ctx = getEventContext()
  if (!ctx) return null
  const { schedule, features } = ctx.posterDetails
  const links = (ctx.posterDetails.links ?? [])
    .map((l) => ({ label: l.label, href: normalizeHttpUrl(l.url) }))
    .filter((l): l is { label: string; href: string } => !!l.href)
  const sponsors = ctx.posterDetails.sponsors ?? []
  return (
    <>
      {schedule && schedule.length > 0 && (
        <div className="stack">
          <h2 className="h2">Plan</h2>
          <div className="list">
            {schedule.map((item, i) => (
              <div key={`${item.title}-${i}`}>
                <span className="t2 fqm-time">{item.time ?? ''}</span>
                <span className="grow">
                  <span className="t1">{item.title}</span>
                  {item.note && <span className="t2 fqm-block">{item.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {features && features.length > 0 && (
        <div className="stack">
          <h2 className="h2">Good to know</h2>
          <div className="chips">
            {features.map((f) => (
              <span key={f} className="tag">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
      {links.length > 0 && (
        <div className="stack">
          <h2 className="h2">Links</h2>
          <div className="row wrap">
            {links.map((l, i) => (
              <a key={`${l.href}-${i}`} className="btn sm" href={l.href} target="_blank" rel="noreferrer">
                <FqIcon name="link" />
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
      {sponsors.length > 0 && <p className="t2">With support from {sponsors.join(', ')}.</p>}
    </>
  )
}

/** Where: the map in the reference's rounded pane, the address under it (a Maps deep link). */
export function FqEventWhere() {
  const ctx = getEventContext()
  if (!ctx) return null
  const { facts } = ctx
  if (facts.isOnline) {
    const join = safeHttpUrl(facts.onlineUrl)
    return (
      <div className="stack">
        <h2 className="h2">Where</h2>
        {join ? (
          <a className="btn sm fqm-tag-start" href={join} target="_blank" rel="noopener noreferrer">
            <FqIcon name="globe" />
            Join link
          </a>
        ) : (
          <span className="t2">Online. Link shows once you RSVP.</span>
        )}
      </div>
    )
  }
  if (!facts.location && !facts.venuePoint && !facts.mapPin) return null
  return (
    <div className="stack">
      <h2 className="h2">Where</h2>
      <FqEventMap mapPin={facts.mapPin} venuePoint={facts.venuePoint} />
      {facts.location &&
        (facts.mapsHref ? (
          <a className="t2" href={facts.mapsHref} target="_blank" rel="noopener noreferrer">
            {facts.location}
          </a>
        ) : (
          <span className="t2">{facts.location}</span>
        ))}
    </div>
  )
}

/** How many past, uncancelled, published gatherings this person has hosted: the reference's "Hosted 38
 *  times". Read under the viewer's session (RLS), so the count is made only of gatherings this viewer
 *  could open; it never counts a draft or a private event to someone outside it. */
async function hostedCount(hostId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('host_id', hostId)
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .lt('starts_at', new Date().toISOString())
  return count ?? 0
}

/** Host (and Co Hosts): the side panel. A hosting Space leads; otherwise the person, with Message. */
export async function FqEventHost() {
  const ctx = getEventContext()
  if (!ctx) return null
  const { host, spaceHost, collaboratorSpaces, cohosts } = ctx
  if (!host && !spaceHost && collaboratorSpaces.length === 0 && cohosts.length === 0) return null
  const times = host && !spaceHost ? await hostedCount(host.id).catch(() => 0) : 0
  const canMessage = !!ctx.myProfileId && !ctx.isHost
  const coCount = collaboratorSpaces.length + cohosts.length
  return (
    <div className="panel stack">
      <span className="k">{host || spaceHost ? (coCount > 0 ? 'Host and Co Hosts' : 'Host') : 'Co Hosts'}</span>
      {spaceHost ? (
        <>
          <Link className="row" href={`/spaces/${spaceHost.slug}`}>
            <FqAvatar url={spaceHost.logoUrl} name={spaceHost.name} size="m" className="fqm-sq" />
            <span className="grow">
              <span className="t1 fqm-block">{spaceHost.name}</span>
              <span className="t2">Hosting this event</span>
            </span>
          </Link>
          {showsOrganizerCredit(host) && <span className="t2">Organized by {host!.display_name}</span>}
        </>
      ) : host ? (
        <>
          <Link className="row" href={`/people/${host.handle}`}>
            <FqAvatar url={host.avatar_url} name={host.display_name} size="m" />
            <span className="grow">
              <span className="t1 fqm-block">{host.display_name}</span>
              <span className="t2">{times > 1 ? `Hosted ${times} times` : `@${host.handle}`}</span>
            </span>
          </Link>
          {canMessage ? (
            <FqMessageHost eventId={ctx.event.id} hostName={host.display_name} />
          ) : !ctx.myProfileId ? (
            <Link className="btn sm fqm-tag-start" href={ctx.facts.signInHref}>
              Sign in to message
            </Link>
          ) : null}
        </>
      ) : null}
      {coCount > 0 && (
        <div className="list">
          {collaboratorSpaces.map((s) => (
            <Link key={s.id} href={`/spaces/${s.slug}`}>
              <FqAvatar url={s.logoUrl} name={s.name} size="s" className="fqm-sq" />
              <span className="t1 grow">{s.name}</span>
              <span className="t2">Co host</span>
            </Link>
          ))}
          {cohosts.map((c) => (
            <Link key={c.id} href={`/people/${c.handle}`}>
              <FqAvatar url={c.avatarUrl} name={c.displayName} size="s" />
              <span className="t1 grow">{c.displayName}</span>
              <span className="t2">Co host</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** Add to calendar: the Event Details card's calendar links (Google, and the .ics for every other
 *  calendar app), the same URLs the page built once for the DAWN card. */
export function FqEventCalendar() {
  const ctx = getEventContext()
  if (!ctx || ctx.event.is_cancelled || ctx.hasEnded) return null
  const { schedule } = ctx
  return (
    <div className="panel stack">
      <span className="k">Add to calendar</span>
      <div className="row wrap">
        <a className="btn sm" href={schedule.googleUrl} target="_blank" rel="noopener noreferrer">
          Google
        </a>
        <a className="btn sm" href={schedule.icsHref}>
          Apple and others
        </a>
      </div>
    </div>
  )
}
