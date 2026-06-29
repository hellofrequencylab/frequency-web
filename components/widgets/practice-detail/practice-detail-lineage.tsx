import Link from 'next/link'
import { Wand2, GitBranch } from 'lucide-react'
import { getDetailPractice } from '@/lib/practices/detail-data'
import { getPracticeLineage } from '@/lib/practices/lineage'
import { SectionHeader } from '@/components/ui/section-header'

// Practice-detail layout module (ADR-438 Phase 3 "Grow", PRACTICE-LIBRARY §6): the remix
// lineage surface. Self-fetching async RSC scoped to the current detail route via
// getDetailPractice() (the practice id is a route param a nested module never receives). Reads
// the PUBLIC lineage only — member surface — and renders:
//   • a "Remixed from {original}" credit line linking to the original, when this is itself a remix,
//   • a "Remixed N times" stat, and
//   • the remix tree as a 2-col link list (the same density as "Used in").
// Returns null for an isolated original (no parent AND no remixes), so it costs one indexed read
// and renders nothing when there is no lineage to show (the module contract; PAGE-FRAMEWORK §4.1).
export async function PracticeDetailLineage() {
  const practice = await getDetailPractice()
  if (!practice) return null

  const lineage = await getPracticeLineage(practice.id)
  if (!lineage) return null

  // Other remixes off the same root, excluding the practice being viewed.
  const others = lineage.remixes.filter((r) => r.id !== practice.id)

  // An isolated original (no parent it came from AND no remixes spawned off the root) has no
  // lineage worth surfacing — render nothing.
  const isRemix = lineage.parent != null && !lineage.isOriginal
  if (!isRemix && lineage.remixCount === 0) return null

  // The original to credit, when this practice descends from one. Link by slug, falling back to id.
  const original = lineage.original
  const showCredit = isRemix && original && original.id !== practice.id
  const originalHref = original ? `/practices/${original.slug ?? original.id}` : null

  return (
    <section className="mt-6 border-t border-border pt-5">
      <SectionHeader title="Remix lineage" count={lineage.remixCount} />

      {showCredit && originalHref && (
        <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted">
          <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
          Remixed from{' '}
          <Link href={originalHref} className="font-semibold text-text hover:underline">
            {original.title || 'the original'}
          </Link>
        </p>
      )}

      {lineage.remixCount > 0 && (
        <p className="mb-4 text-sm text-muted">
          <span className="font-semibold text-text">
            Remixed {lineage.remixCount} {lineage.remixCount === 1 ? 'time' : 'times'}
          </span>{' '}
          across the community. Make it yours and add a version only you would make.
        </p>
      )}

      {others.length > 0 && (
        <div>
          <SectionHeader title="Other remixes" count={others.length} />
          <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
            {others.map((node) => (
              <Link
                key={node.id}
                href={`/practices/${node.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                <span className="truncate font-medium text-text">{node.title || 'Untitled practice'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
