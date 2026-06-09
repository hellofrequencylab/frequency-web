import Link from 'next/link'
import { SectionHeader } from '@/components/ui/section-header'
import { getPracticeBacklinks } from '@/lib/practices'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'

// "Used in" — the practice's backlinks: the journeys that include it and the
// circles running it (the inverse of journey_plan_items / circle_practices).
// Visibility is enforced in the loader (public journeys · non-archived,
// demo-respecting circles), so this is purely presentational. Renders nothing
// when both lists are empty, and hides a sub-list that has no rows — so it stays
// quiet on a brand-new practice. Compact, on-template (SectionHeader + a light
// link list, the same grammar as the circles index browse rail).

function LinkRow({
  href,
  label,
  count,
  noun,
}: {
  href: string
  label: string
  count: number
  noun: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-text"
    >
      <span className="truncate font-medium text-text">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-subtle">
        {count} {count === 1 ? noun : `${noun}s`}
      </span>
    </Link>
  )
}

export async function UsedInSection({ practiceId }: { practiceId: string }) {
  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())
  const { journeys, circles } = await getPracticeBacklinks(practiceId, { hideDemo })

  // Both empty → render nothing (the section disappears entirely).
  if (journeys.length === 0 && circles.length === 0) return null

  return (
    <section className="mt-6 border-t border-border pt-5">
      <h2 className="mb-4 text-sm font-bold tracking-tight text-text">Used in</h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {journeys.length > 0 && (
          <div>
            <SectionHeader title="Journeys" count={journeys.length} />
            <div className="space-y-0.5">
              {journeys.map((j) => (
                <LinkRow
                  key={j.slug}
                  href={`/journeys/${j.slug}`}
                  label={j.title}
                  count={j.adoptCount}
                  noun="adopt"
                />
              ))}
            </div>
          </div>
        )}

        {circles.length > 0 && (
          <div>
            <SectionHeader title="Circles" count={circles.length} />
            <div className="space-y-0.5">
              {circles.map((c) => (
                <LinkRow
                  key={c.slug}
                  href={`/circles/${c.slug}`}
                  label={c.name}
                  count={c.memberCount}
                  noun="member"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// A quiet placeholder while the backlink queries resolve (kept off the critical
// path via <Suspense> so it never blocks the practice page render).
export function UsedInSkeleton() {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="mb-4 h-4 w-20 rounded bg-surface-elevated" />
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2">
            <div className="h-3 w-16 rounded bg-surface-elevated" />
            <div className="h-7 rounded bg-surface-elevated/60" />
            <div className="h-7 rounded bg-surface-elevated/60" />
          </div>
        ))}
      </div>
    </section>
  )
}
