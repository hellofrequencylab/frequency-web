// The seed list (Wave 1). Lists the operator's listing seeds by status with the review
// entry point. Composes EntityCard + EmptyState (PAGE-FRAMEWORK) — each card links to the
// seed's review board. Presentational + server-friendly (no hooks).

import { ClipboardPaste, Home, Tag } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import type { ListingIntakeStatus, ListingSeedKind } from '@/lib/listing-seeder/types'
import type { ListingIntakeListItem } from './actions'

/** The one status vocabulary for a seed: glyph (PRESENTATION legend) + pill tone + label. */
export const LISTING_STATUS_META: Record<
  ListingIntakeStatus,
  { glyph: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }
> = {
  intake: { glyph: '⏳', tone: 'neutral', label: 'Extracting' },
  researching: { glyph: '⏳', tone: 'info', label: 'Extracting' },
  review: { glyph: '⚠️', tone: 'warning', label: 'In review' },
  applied: { glyph: '✅', tone: 'success', label: 'Published' },
  failed: { glyph: '🔴', tone: 'danger', label: 'Failed' },
}

const KIND_META: Record<ListingSeedKind, { label: string; icon: typeof Tag }> = {
  classifieds: { label: 'Classifieds', icon: Tag },
  housing: { label: 'Housing', icon: Home },
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

export function IntakeList({ intakes }: { intakes: ListingIntakeListItem[] }) {
  if (intakes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardPaste}
        title="No seeds yet"
        description="Start one above: pick the vertical, paste a listing you copied, and Frequency extracts the fields into a reviewable draft."
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {intakes.map((it) => {
        const meta = LISTING_STATUS_META[it.status]
        const kind = KIND_META[it.kind]
        const KindIcon = kind.icon
        return (
          <EntityCard
            key={it.id}
            href={`/admin/listing-seeder/${it.id}`}
            anchor={
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted">
                <KindIcon className="h-4 w-4" aria-hidden />
              </span>
            }
            title={it.title}
            badge={<StatusChip tone="neutral" size="sm">{kind.label}</StatusChip>}
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
