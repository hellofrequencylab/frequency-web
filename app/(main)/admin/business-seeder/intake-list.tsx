// The intake list (docs/BUSINESS-IMPORTER.md §8, P3). Lists the operator's imports by status
// with the review / apply entry point. Composes EntityCard + EmptyState (PAGE-FRAMEWORK) —
// each card links to the import's review page. Presentational + server-friendly (no hooks).

import { Building2 } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import type { IntakeStatus } from '@/lib/importer/intake'
import type { IntakeListItem } from './actions'

/** The one status vocabulary for an import: glyph (PRESENTATION legend) + pill tone + label. */
export const STATUS_META: Record<
  IntakeStatus,
  { glyph: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }
> = {
  intake: { glyph: '⏳', tone: 'neutral', label: 'Queued' },
  researching: { glyph: '⏳', tone: 'info', label: 'Researching' },
  review: { glyph: '⚠️', tone: 'warning', label: 'In review' },
  applied: { glyph: '✅', tone: 'success', label: 'Applied' },
  failed: { glyph: '🔴', tone: 'danger', label: 'Failed' },
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function IntakeList({ imports }: { imports: IntakeListItem[] }) {
  if (imports.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No imports yet"
        description="Start one above: paste a business's website or social handles and Frequency will research it into a reviewable draft."
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {imports.map((it) => {
        const meta = STATUS_META[it.status]
        return (
          <EntityCard
            key={it.id}
            href={`/admin/business-seeder/${it.id}`}
            anchor={
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
            }
            title={it.name}
            badge={it.isDemo ? <StatusChip tone="neutral" size="sm">Demo</StatusChip> : undefined}
            context={it.seed}
            description={it.status === 'failed' && it.error ? it.error : undefined}
            meta={
              <>
                <StatusChip tone={meta.tone} size="sm">
                  {meta.glyph} {meta.label}
                </StatusChip>
                <span className="text-2xs text-subtle">{timeAgo(it.updatedAt)}</span>
              </>
            }
          />
        )
      })}
    </div>
  )
}
