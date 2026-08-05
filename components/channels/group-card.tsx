import Link from 'next/link'
import { MapPin } from 'lucide-react'

// The compact Circle/Chapter card the Channel page renders in BOTH its body directory and its
// scope rail (components/channels/channel-rail.tsx), so the two can never drift. Markup is
// byte-matched to the ChaptersNearMe card, so the directory reads identically with or without
// the geo re-sort. It sizes down cleanly to the rail's column because every element is fluid:
// the name truncates, the mode chip is `shrink-0`, and the meta row wraps.

/** One normalized card shape for the Circles/Chapters strips and grids, so the program and
 *  non-program branches render through the SAME card component. */
export type GroupCardData = {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  city: string | null
  neighborhood: string | null
  members: number
  cap: number
}

export function GroupCard({ group }: { group: GroupCardData }) {
  return (
    <Link
      href={`/circles/${group.slug}`}
      className="block rounded-2xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-medium text-text truncate">{group.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
          group.type === 'in-person'
            ? 'bg-success-bg text-success'
            : 'bg-signal-bg text-signal-strong'
        }`}>
          {group.type === 'in-person' ? 'In-person' : 'Online'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-meta text-muted">
        {(group.city || group.neighborhood) && (
          <span className="flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5" />
            {group.neighborhood || group.city}
          </span>
        )}
        <span>
          {group.members}/{group.cap} members
        </span>
      </div>
    </Link>
  )
}
