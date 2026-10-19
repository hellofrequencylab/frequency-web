import Link from 'next/link'
import { Flag, MapPin } from 'lucide-react'
import { distanceLabel, endsLine, nearbyLine, type LiveHunt, type NearbyRegular } from '@/lib/loyalty/nearby'

// REGULARS DISCOVERY on /rewards (LIVE-944): the Spaces running Regulars near the member, and the hunts
// live today. Each row links to the place; the check-in itself still happens at the door. Tokens only,
// no hardcoded hex. No em dashes.

export function NearbyRegularsList({ places }: { places: NearbyRegular[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {places.map((p) => {
        const dist = distanceLabel(p.distanceMiles)
        return (
          <li key={p.spaceId}>
            <Link href={`/spaces/${p.slug}`} className="block rounded-card border border-border bg-surface p-3 lift-1 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-body-sm font-semibold text-text">{p.name}</span>
                {(dist || p.city) && (
                  <span className="flex shrink-0 items-center gap-1 text-meta text-muted">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {dist ?? p.city}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-meta text-muted">{nearbyLine(p)}. 25 Zaps a visit.</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function LiveHuntsList({ hunts }: { hunts: LiveHunt[] }) {
  return (
    <ul className="space-y-2">
      {hunts.map((h) => (
        <li key={h.slug}>
          <Link href={`/hunts/${h.slug}`} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 lift-1 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-text">
                <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{h.title}</span>
              </span>
              <span className="mt-0.5 block text-meta text-muted">
                {h.stopsTotal} {h.stopsTotal === 1 ? 'stop' : 'stops'}, hosted by {h.hostName}. {h.rewardTitle ? `Finish for ${h.rewardTitle}.` : ''}
              </span>
            </span>
            <span className="shrink-0 text-meta text-muted">{endsLine(h.endsOn)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
