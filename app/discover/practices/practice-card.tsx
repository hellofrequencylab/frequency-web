import Link from 'next/link'
import { Sparkles } from 'lucide-react'

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

/** One practice tile, linking to its public HowTo detail page. Server-rendered (no client JS). */
export function PracticeCard({ p }: { p: PracticeCardData }) {
  return (
    <li>
      <Link
        href={`/discover/practices/${p.slug ?? p.id}`}
        className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-elevated"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">{p.title}</span>
        </span>
        {p.subcategory && <span className="text-xs text-subtle">{p.subcategory.name}</span>}
        {(p.summary || p.description) && (
          <p className="line-clamp-3 text-sm text-muted">{p.summary ?? p.description}</p>
        )}
      </Link>
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
    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors'
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
