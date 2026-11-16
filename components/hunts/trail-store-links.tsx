import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { storeLinksForHunt, type TrailStoreLink } from '@/lib/hunts/merch-hooks'

/**
 * The approved store items for a Trail (FH-038S). The store owns the sale: this only sends the player to
 * the item's own page, resolved on the server (lib/hunts/merch-hooks.ts, `resolveStoreLink`). An item that
 * cannot be bought right now keeps its name and loses its link.
 */

/** The links for one Hunt. Empty until HUNTS_COMMERCE_ENABLED is on, and empty rather than an error if the read fails. */
export function loadTrailStoreLinks(huntId: string): Promise<TrailStoreLink[]> {
  return storeLinksForHunt(huntId).catch(() => [])
}

export function TrailStoreLinks({ links }: { links: readonly TrailStoreLink[] }) {
  if (links.length === 0) return null
  return (
    <section aria-labelledby="trail-store-links" className="rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-store-links" className="text-body font-semibold text-text">From the shop</h2>
      <p className="text-body-sm text-muted">Picked for this Trail. You buy from the shop itself.</p>
      <ul className="mt-2 space-y-2">
        {links.map((l) => (
          <li key={l.offerId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words text-body-sm text-text">
              {l.title}
              {l.includesBenefit ? <span className="text-muted"> (comes with a Trail extra)</span> : null}
            </span>
            {l.href ? (
              <Link href={l.href} prefetch={false} className={buttonClasses('secondary', 'md')}>
                View in the shop
              </Link>
            ) : (
              <span className="text-body-sm text-subtle">Not available right now</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
