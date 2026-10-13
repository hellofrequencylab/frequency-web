import Link from 'next/link'
import type { EventsIndexData } from '@/app/(main)/events/index-data'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { suggestConnectorsForEvents } from '@/lib/events/connectors'
import { GoButton } from '@/components/frequency/members/go-button'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { AddToggle } from '@/components/frequency/members/shared/toggles'

// THE TWO PERSONAL LANES ON EVENTS, IN THE KIT (the DAWN page's EventsForYou and EventConnectors,
// restyled; their reads are the same functions). Both are slow on purpose (embedding scores, an AI
// blurb, a connector query), so the body mounts each behind its own <Suspense> and neither holds up
// the list. Both fail safe: no scores, no lane; no shared Channel, no panel.

const LANE_SIZE = 4

function timeLabel(iso: string): string {
  // Stored as the event's wall clock in UTC parts.
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).replace(' ', '').toLowerCase()
  return `${day} · ${t}`
}

/** "Up next for you": the ranked picks, each with the plain why line when the blurb resolves. */
export async function FqEventsForYou({ data }: { data: EventsIndexData }) {
  const { myProfileId, sortedEvents, coverUrls, rsvpCounts, myRsvps } = data
  if (!myProfileId) return null
  const byId = new Map(sortedEvents.map((e) => [e.id, e]))
  let ranked
  try {
    ranked = await scoreEventsForViewer(myProfileId, [...byId.keys()])
  } catch {
    return null
  }
  const top = ranked.filter((r) => byId.has(r.eventId)).slice(0, LANE_SIZE)
  // One ranked event is just the next event. Two is the floor for a recommendation.
  if (top.length < 2) return null
  const blurbs = await Promise.all(top.map((r) => eventBlurb(myProfileId, r.eventId).catch(() => null)))

  return (
    <section className="fqm-lane" aria-labelledby="fq-for-you">
      <div className="sec-h">
        <h2 id="fq-for-you" className="h2">
          For <span className="serif">you.</span>
        </h2>
        <span className="meta">By what you are into and who is going</span>
      </div>
      <div className="list">
        {top.map((r, i) => {
          const e = byId.get(r.eventId)!
          const cover = coverUrls[e.id]
          const going = rsvpCounts[e.id] ?? 0
          return (
            <Link key={e.id} href={`/events/${e.slug}`}>
              <span className="ph fqm-thumb" style={cover ? { backgroundImage: `url('${cover}')` } : undefined} />
              <span className="grow stack fqm-row-stack">
                <span className="t1">{e.title}</span>
                <span className="t2">{[timeLabel(e.starts_at), e.location, going > 0 ? `${going} going` : null].filter(Boolean).join(' · ')}</span>
                {blurbs[i] && <span className="why">{blurbs[i]}</span>}
              </span>
              {!e.is_cancelled && <GoButton eventId={e.id} slug={e.slug} going={myRsvps.has(e.id)} />}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function sharedLine(channels: string[]): string {
  if (channels.length === 0) return 'Going to the same things'
  if (channels.length === 1) return `Both into ${channels[0]}`
  if (channels.length === 2) return `Both into ${channels[0]} and ${channels[1]}`
  return `Both into ${channels.slice(0, 2).join(', ')}, and more`
}

/** "People to meet": strangers going to the same events who share a Channel. Side panel. */
export async function FqPeopleToMeet({ viewerProfileId, eventIds }: { viewerProfileId: string; eventIds: string[] }) {
  const suggestions = await suggestConnectorsForEvents(viewerProfileId, eventIds, 5).catch(() => [])
  if (suggestions.length === 0) return null
  return (
    <div className="panel stack">
      <span className="k">People to know</span>
      <div className="list">
        {suggestions.map((s) => (
          <div key={s.profileId}>
            <FqAvatar url={s.avatarUrl} name={s.displayName} />
            <span className="grow">
              <Link className="t1 fqm-block" href={`/people/${s.handle}`}>
                {s.displayName}
              </Link>
              <span className="t2">{sharedLine(s.sharedChannels)}</span>
            </span>
            <AddToggle profileId={s.profileId} name={s.displayName} initial="none" />
          </div>
        ))}
      </div>
    </div>
  )
}
