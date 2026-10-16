import Link from 'next/link'
import { suggestConnectorsForEvents } from '@/lib/events/connectors'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { AddToggle } from '@/components/frequency/members/shared/toggles'

// PEOPLE TO MEET ON EVENTS, IN THE KIT (templates/members/app/events.js, the band under the picks). Its
// read is the DAWN page's EventConnectors function, unchanged. It is slow on purpose (a connector query),
// so the body mounts it behind its own <Suspense> and it never holds up the list. It fails safe: no shared
// Channel, no band. The For you lane that sat above it is now Around you (around-you.tsx, SCAN-975).

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
