import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'

/** The minimal shape the public practice card renders. RankedPractice / PublicPractice
 *  both satisfy it structurally, so the directory and the per-Pillar pages share one card. */
export interface PracticeCardData {
  id: string
  slug: string | null
  title: string
  subcategory: { name: string } | null
  summary: string | null
  description: string | null
}

/** One practice tile, linking to its public HowTo detail page. Server-rendered (no client JS).
 *  Composes the one browse-card shell (EntityCard) — a practice is a distinct object in a grid,
 *  which is exactly what that shell is for, so this page reads identically to every other
 *  directory. The Sparkles tile is the card's `anchor`; the Pillar/subcategory is its `context`. */
export function PracticeCard({ p }: { p: PracticeCardData }) {
  return (
    <li className="h-full">
      <EntityCard
        href={`/discover/practices/${p.slug ?? p.id}`}
        anchor={
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary-bg text-primary-strong">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
        }
        title={p.title}
        context={p.subcategory?.name}
        description={p.summary ?? p.description}
      />
    </li>
  )
}

/** The Pillar filter chips shown above the directory + Pillar pages. `active` is the
 *  current Pillar slug ('all' on the full directory), so the matching chip reads selected. */
export function PillarChips({
  pillars,
  active,
}: {
  pillars: { slug: string; name: string }[]
  active: string
}) {
  const base =
    'rounded-pill border px-3 py-1.5 text-body-sm font-medium transition-colors'
  const on = 'border-primary bg-primary-bg text-primary-strong'
  const off = 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
  return (
    <nav aria-label="Browse practices by Pillar" className="mb-8 flex flex-wrap gap-2">
      <Link href="/discover/practices" className={`${base} ${active === 'all' ? on : off}`}>
        All
      </Link>
      {pillars.map((pl) => (
        <Link
          key={pl.slug}
          href={`/discover/practices/pillar/${pl.slug}`}
          className={`${base} ${active === pl.slug ? on : off}`}
        >
          {pl.name}
        </Link>
      ))}
    </nav>
  )
}
