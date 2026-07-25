import Image from 'next/image'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import type { SpaceHostLite } from '@/lib/events/active-event'

// The event Host box when the event is hosted by a SPACE (posted from a Space → events.space_id). The
// Space is the attribution: its brand + logo, linking to the Space page. The individual organizer (host_id)
// keeps their operational rights but is shown as a subtle credit on the header line, not as the host here.
// A plain server component (no messaging modal) — the Space's own page carries its contact affordances.
export function SpaceHostBox({
  space,
  organizerName,
}: {
  space: SpaceHostLite
  /** The person in host_id, shown as a quiet "Organized by" credit under the Space (optional). */
  organizerName?: string | null
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Host</p>

      <Link
        href={`/spaces/${space.slug}`}
        className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface-elevated"
      >
        {space.logoUrl ? (
          <Image
            src={space.logoUrl}
            alt={space.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 select-none items-center justify-center rounded-xl bg-primary-bg text-base font-semibold text-primary-strong">
            {getInitials(space.name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{space.name}</p>
          <p className="text-xs text-subtle">Hosting this event</p>
        </div>
      </Link>

      {organizerName ? (
        <p className="mt-3 text-xs text-subtle">Organized by {organizerName}</p>
      ) : null}
    </section>
  )
}
