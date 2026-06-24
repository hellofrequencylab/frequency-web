import Link from 'next/link'
import { ArrowRight, HeartPulse } from 'lucide-react'
import { SidebarCard } from '@/components/ui/sidebar-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { WorklistRow } from '@/lib/dashboard/scores'

// The who-needs-attention worklist (Resonance Engine Phase 2 · ADR-383). The part operators
// actually use: the top members the model says are sliding now, each carrying its next move as
// a one-tap route into Vera Today (/admin/crm/today), where the governed action lives. People,
// not a chart. Composed from SidebarCard rows + the shared EmptyState. Semantic tokens only
// (no hardcoded hex); copy in voice (no em or en dashes).

// The autonomy badge: a quiet label so the operator knows what the next move will do. Mirrors
// the Today card badge so the worklist and Today read the same.
const TIER_BADGE: Record<WorklistRow['autonomyTier'], { label: string; cls: string }> = {
  auto: { label: 'In-product, reversible', cls: 'bg-success/10 text-success' },
  suggest: { label: 'You approve before it sends', cls: 'bg-primary/10 text-primary-strong' },
  never_auto: { label: 'Needs an explicit confirm', cls: 'bg-warning/10 text-warning' },
}

export function Worklist({
  rows,
  laterCount,
  title = 'Who needs you',
  /** Where a row routes on tap. Defaults to Vera Today (the platform action surface). */
  actionHref = '/admin/crm/today',
  /** Optional per-row href builder (e.g. a Space board's contact detail). Wins over actionHref. */
  hrefFor,
  /** Where the "Later shelf" tail links. Defaults to actionHref. */
  laterHref,
}: {
  rows: WorklistRow[]
  laterCount: number
  title?: string
  actionHref?: string
  hrefFor?: (row: WorklistRow) => string
  laterHref?: string
}) {
  return (
    <SidebarCard title={title} count={rows.length} Icon={HeartPulse}>
      {rows.length === 0 ? (
        <div className="p-3">
          <EmptyState
            variant="cleared"
            title="Nobody is sliding right now"
            description="When a member starts to cool, they show up here with the one move to make. Check back after the next overnight refresh."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const badge = TIER_BADGE[row.autonomyTier]
            return (
              <li key={row.contactId}>
                <Link
                  href={hrefFor ? hrefFor(row) : actionHref}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-text">{row.name}</span>
                      <span className="text-xs text-subtle">{row.context}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">{row.whyNow}</p>
                    <span
                      className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${badge.cls}`}
                    >
                      {row.playbookName} · {badge.label}
                    </span>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {laterCount > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href={laterHref ?? actionHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:underline"
          >
            {laterCount} more on the Later shelf
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </SidebarCard>
  )
}
