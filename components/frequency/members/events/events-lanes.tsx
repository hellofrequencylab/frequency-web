import Link from 'next/link'
import type { EventsIndexData } from '@/app/(main)/events/index-data'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { suggestConnectorsForEvents } from '@/lib/events/connectors'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { AddToggle } from '@/components/frequency/members/shared/toggles'
import { FqEventCard } from './event-card'

// THE TWO PERSONAL LANES ON EVENTS, IN THE KIT (templates/members/app/events.js drawForYou: the For
// you card lane and the People to meet band under it). Their reads are the DAWN page's
// EventsForYou and EventConnectors functions, unchanged. Both are slow on purpose (embedding scores,
// an AI blurb, a connector query), so the body mounts each behind its own <Suspense> and neither
// holds up the list. Both fail safe: no scores, no lane; no shared Channel, no band.

const LANE_SIZE = 4

/** "For you": the ranked picks as cards, each with its plain why line when the blurb resolves. */
export async function FqEventsForYou({ data }: { data: EventsIndexData }) {
  const { myProfileId, sortedEvents, myRsvps } = data
  if (!myProfileId) return null
  const byId = new Map(sortedEvents.map((e) => [e.id, e]))
  let ranked
  try {
    ranked = await scoreEventsForViewer(myProfileId, [...byId.keys()])
  } catch {
    return null
  }
  // Already going is already on your week, so the lane suggests what you have not picked.
  const top = ranked.filter((r) => byId.has(r.eventId) && !myRsvps.has(r.eventId)).slice(0, LANE_SIZE)
  // One ranked event is just the next event. Two is the floor for a recommendation.
  if (top.length < 2) return null
  const blurbs = await Promise.all(top.map((r) => eventBlurb(myProfileId, r.eventId).catch(() => null)))

  return (
    <section className="ev-foryou" aria-labelledby="fq-for-you">
      <div className="sec-h">
        <div className="stack fqm-gap-sm">
          <h2 id="fq-for-you" className="h2">
            <span className="orb ev-orb" aria-hidden="true" />
            For you
          </h2>
          <span className="t2">Picked from what is coming up, by what you are into and who is going.</span>
        </div>
      </div>
      <div className="ev-lane">
        {top.map((r, i) => (
          <FqEventCard key={r.eventId} e={byId.get(r.eventId)!} data={data} blurb={blurbs[i]} />
        ))}
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

/** "People to meet": members going to the same events who share a Channel. */
export async function FqPeopleToMeet({ viewerProfileId, eventIds }: { viewerProfileId: string; eventIds: string[] }) {
  const suggestions = await suggestConnectorsForEvents(viewerProfileId, eventIds, 6).catch(() => [])
  if (suggestions.length === 0) return null
  return (
    <section className="ev-meet" aria-labelledby="fq-people-to-meet">
      <div className="stack fqm-gap-sm">
        <h2 id="fq-people-to-meet" className="h3">
          <FqIcon name="contacts" />
          People to meet
        </h2>
        <span className="t2">Going to the same things you are, into the same Channels. Say hi before the room does.</span>
      </div>
      <div className="ev-meet-row">
        {suggestions.map((s) => (
          <div key={s.profileId} className="ev-person">
            <FqAvatar url={s.avatarUrl} name={s.displayName} size="m" />
            <span className="grow">
              <Link href={`/people/${s.handle}`}>
                <b>{s.displayName}</b>
              </Link>
              <span className="t2">{sharedLine(s.sharedChannels)}</span>
            </span>
            <AddToggle profileId={s.profileId} name={s.displayName} initial="none" />
          </div>
        ))}
      </div>
    </section>
  )
}
