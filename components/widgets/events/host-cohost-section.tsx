import Image from 'next/image'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { SpaceCreditRow } from '@/components/widgets/events/space-credit-row'
import { HostPersonCredit } from '@/components/widgets/events/host-person-credit'
import type { CohostView } from '@/components/events/cohost-manager'
import type { HostLite, SpaceHostLite } from '@/lib/events/active-event'

// THE ONE "Host & Co Hosts" section on an event page (owner ruling, July 2026). It replaces the two
// stacked boxes that used to sit in the event rail — HOST and COLLABORATORS — with a single card:
// the Host always leads, everyone else co-hosting is named under it as a Co Host.
//
// A DISPLAY MERGE ONLY. The two relations underneath stay exactly as ADR-834/835 defined them, and
// nothing here touches a gate:
//   • Host row      — events.host_space_id / events.space_id (the Space) or events.host_id (the person).
//   • Space Co Host — an ACCEPTED event_space_shares row (internally a Collaborator). Featured credit
//                     plus calendar visibility, and NO management access, exactly as before.
//   • Person Co Host— an accepted event_cohosts row (internally a cohost). Management access via
//                     isEventCohost, unchanged; this section only credits them.
//
// WHY the people sit in their own inset panel ("the other window", owner's words): a Space and a
// person are different KINDS of co-host with different rights, and ADR-835 makes the person/Space
// line structural rather than name-based — an owner-named Business Space ("Daniel Tyack") must never
// read as the person of the same name. So the two groups are told apart three ways at a glance:
// Spaces sit on the card surface with rounded SQUARE logo tiles and link to /spaces; people sit in a
// recessed panel with ROUND avatars, an @handle, and links to /people. One heading ("Co Hosts")
// still covers both, because to a member they are all Co Hosts.
export function HostCohostSection({
  spaceHost,
  host,
  collaboratorSpaces,
  cohosts,
  eventId,
  canMessage,
  signInHref,
}: {
  /** The hosting Space when the event was posted from one; null for a person-hosted event. */
  spaceHost: SpaceHostLite | null
  /** The person in events.host_id. Leads the section when there is no hosting Space, and is the
   *  quiet "Organized by" credit when there is. */
  host: HostLite | null
  /** Spaces co-hosting through an accepted share (event_space_shares). */
  collaboratorSpaces: SpaceHostLite[]
  /** People co-hosting (accepted event_cohosts rows). */
  cohosts: CohostView[]
  eventId: string
  /** False when the viewer is signed out or is the host themselves. */
  canMessage: boolean
  signInHref: string
}) {
  const hasHost = !!spaceHost || !!host
  const hasSpaceCohosts = collaboratorSpaces.length > 0
  const hasPersonCohosts = cohosts.length > 0
  const hasCohosts = hasSpaceCohosts || hasPersonCohosts

  // Nothing to credit (an unclaimed import with no shares and no cohosts) — render nothing.
  if (!hasHost && !hasCohosts) return null

  const eyebrow = hasHost ? (hasCohosts ? 'Host & Co Hosts' : 'Host') : 'Co Hosts'

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">{eyebrow}</p>

      {/* 1. THE HOST. A hosting Space is the attribution and the person in host_id drops to the
          organizer credit below it; otherwise the person host leads with the Message Host CTA. */}
      {spaceHost ? (
        <>
          <SpaceCreditRow space={spaceHost} role="Hosting this event" lead />
          {host ? <p className="mt-3 text-xs text-subtle">Organized by {host.display_name}</p> : null}
        </>
      ) : host ? (
        <HostPersonCredit
          host={host}
          eventId={eventId}
          canMessage={canMessage}
          signInHref={signInHref}
        />
      ) : null}

      {/* 2. THE CO HOSTS. One heading over both kinds; the divider only appears when a Host row
          sits above it. */}
      {hasCohosts ? (
        <div className={hasHost ? 'mt-4 border-t border-border pt-4' : ''}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Co Hosts</p>

          {/* 2a. SPACES — same surface, same row shape as the Host above them. */}
          {hasSpaceCohosts ? (
            <ul className="space-y-1">
              {collaboratorSpaces.map((s) => (
                <li key={s.id}>
                  <SpaceCreditRow space={s} role="Co-hosting this event" />
                </li>
              ))}
            </ul>
          ) : null}

          {/* 2b. PEOPLE — the recessed panel, so a person co-hosting never reads as a Space. */}
          {hasPersonCohosts ? (
            <div
              className={`rounded-xl border border-border bg-surface-elevated p-3 ${
                hasSpaceCohosts ? 'mt-3' : ''
              }`}
            >
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">People</p>
              <ul className="space-y-0.5">
                {cohosts.map((c) => (
                  <li key={c.id}>
                    <PersonCohostRow cohost={c} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** One person co-hosting: round avatar (focal-point aware) + name + handle, linking to their profile.
 *  Round-vs-square and the @handle are what separate a person from a Space inside this section. */
function PersonCohostRow({ cohost }: { cohost: CohostView }) {
  return (
    <Link
      href={`/people/${cohost.handle}`}
      className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-surface"
    >
      {cohost.avatarUrl ? (
        <Image
          src={avatarSrc(cohost.avatarUrl)}
          alt={cohost.displayName}
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          style={avatarFocusStyle(cohost.avatarUrl)}
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong">
          {getInitials(cohost.displayName)}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{cohost.displayName}</p>
        <p className="truncate text-xs text-subtle">@{cohost.handle}</p>
      </div>
    </Link>
  )
}
