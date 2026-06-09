'use client'

import dynamic from 'next/dynamic'
import type { GroupMapVenue, GroupMapEvent } from './group-map'

// maplibre must not run on the server. The `ssr: false` dynamic import is only
// allowed inside a Client Component (Next 16), so this thin client wrapper is where
// it lives — the async server section (group-map-section.tsx) renders this.
const GroupMap = dynamic(() => import('./group-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />
  ),
})

export function GroupMapClient({ venue, events }: { venue: GroupMapVenue; events: GroupMapEvent[] }) {
  return <GroupMap venue={venue} events={events} />
}
