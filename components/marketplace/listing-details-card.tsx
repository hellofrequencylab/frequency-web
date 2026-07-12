// Compact "Item details" module for the listing detail right rail. Renders the seller's detail chips
// (Condition, Brand, Dimensions, ...) as a tight label/value list. Presentational Server Component;
// self-hides when there are no details. Tokens only, no hex; plain copy, no em/en dashes.

import { Info } from 'lucide-react'
import type { ListingDetailField } from '@/lib/marketplace'

export function ListingDetailsCard({ details }: { details: ListingDetailField[] }) {
  if (!details || details.length === 0) return null
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <Info className="h-3.5 w-3.5" aria-hidden /> Item details
      </h2>
      <dl className="divide-y divide-border/70">
        {details.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-xs text-muted">{d.label}</dt>
            <dd className="min-w-0 text-right text-sm font-medium text-text">{d.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
