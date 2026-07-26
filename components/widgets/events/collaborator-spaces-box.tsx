import Image from 'next/image'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import type { SpaceHostLite } from '@/lib/events/active-event'

// The public COLLABORATORS credit (relation B, ADR-834): the Spaces co-hosting this event through an
// ACCEPTED event_space_share (Events EC3). Featured on purpose — a business Space gets real billing
// on the event (logo card under the Host box, linking to its Space page), where a personal cohost
// (relation A, event_cohosts) gets a quiet avatar chip lower on the page. The list arrives already
// leak-safe: listCollaboratorSpacesForEvent returns accepted shares on active Spaces only, so a
// pending/declined/revoked share never renders here. Display only; a Collaborator holds NO
// management access on the event.
export function CollaboratorSpacesBox({ spaces }: { spaces: SpaceHostLite[] }) {
  if (spaces.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Collaborators</p>
      <ul className="space-y-1">
        {spaces.map((s) => (
          <li key={s.id}>
            <Link
              href={`/spaces/${s.slug}`}
              className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface-elevated"
            >
              {s.logoUrl ? (
                <Image
                  src={s.logoUrl}
                  alt={s.name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 select-none items-center justify-center rounded-xl bg-primary-bg text-sm font-semibold text-primary-strong">
                  {getInitials(s.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{s.name}</p>
                <p className="text-xs text-subtle">Co-hosting this event</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
