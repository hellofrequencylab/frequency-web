// The staged-event list (ADR-989). Mirrors the Business Seeder's intake list: EntityCard +
// EmptyState from the page kit, one card per staged event, linking into its review board.
// Presentational + server-friendly (no hooks).

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import { relativeTime } from '@/lib/utils'
import type { IntakeStatus } from '@/lib/events/seed/intake'
import type { StagedEventListItem } from './actions'

/** The one status vocabulary for a staged event: glyph (PRESENTATION legend) + tone + label.
 *  'researching' cannot occur today (the read has already happened when a row is created), but
 *  the machine is shared with the Business Seeder, so the map stays total. */
export const STATUS_META: Record<
  IntakeStatus,
  { glyph: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }
> = {
  intake: { glyph: '⏳', tone: 'neutral', label: 'Queued' },
  researching: { glyph: '⏳', tone: 'info', label: 'Reading' },
  review: { glyph: '⚠️', tone: 'warning', label: 'Needs review' },
  applied: { glyph: '✅', tone: 'success', label: 'Seeded' },
  failed: { glyph: '🔴', tone: 'danger', label: 'Not seeded' },
}

/** The start, in the plain house format. Empty when the draft has no usable date. */
function whenLine(iso: string): string {
  if (!iso) return 'No date yet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No date yet'
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function IntakeList({ items }: { items: StagedEventListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing staged yet"
        description="Two doors feed this board. Run a WhatsApp chat export through Import from chat and send the events it finds here, or photograph posters around town and send each one straight over from the flyer scan."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/admin/import" className={buttonClasses('secondary', 'sm')}>
              Import from chat
            </Link>
            <Link href="/events/scan" className={buttonClasses('secondary', 'sm')}>
              Scan a flyer
            </Link>
          </div>
        }
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const meta = STATUS_META[it.status]
        return (
          <EntityCard
            key={it.id}
            href={`/admin/event-seeder/${it.id}`}
            anchor={
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-elevated text-muted">
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
            }
            title={it.title}
            badge={it.isDemo ? <StatusChip tone="neutral" size="sm">Unlisted</StatusChip> : undefined}
            context={whenLine(it.startsAt)}
            description={it.error ?? it.source}
            meta={
              <>
                <StatusChip tone={meta.tone} size="sm">
                  {meta.glyph} {meta.label}
                </StatusChip>
                <span className="text-2xs text-muted">{relativeTime(it.updatedAt)}</span>
              </>
            }
          />
        )
      })}
    </div>
  )
}

