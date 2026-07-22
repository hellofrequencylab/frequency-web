'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ban, Copy, Pencil, Trash2 } from 'lucide-react'
import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DangerModal } from '@/components/admin/danger-modal'
import { cancelEvent } from '@/app/(main)/events/actions'
import { deleteEvent } from '@/app/(main)/events/admin-actions'

// THE SPACE EVENTS MANAGER (Events EC5). The per-event management list the space Calendar
// console was missing: the month grid is view-only, so this is where an owner actually
// Edits, Duplicates, Cancels, and Deletes their space's events — past and upcoming alike.
// Every action re-resolves `event.editSettings` server-side (the space owner/admin/editor
// now delegates through getEventCapabilities), so this list is a convenience, not the authz.

export interface ManagedEvent {
  id: string
  slug: string
  title: string
  whenLabel: string
  isPast: boolean
  isCancelled: boolean
}

type Confirm = { kind: 'cancel' | 'delete'; ev: ManagedEvent } | null

export function SpaceEventsManager({ events }: { events: ManagedEvent[] }) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(c: NonNullable<Confirm>) {
    setPendingId(c.ev.id)
    start(async () => {
      if (c.kind === 'cancel') await cancelEvent(c.ev.id)
      else await deleteEvent(c.ev.id, c.ev.slug)
      setConfirm(null)
      setPendingId(null)
      router.refresh()
    })
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        description="Events you create for this space show up here, where you can edit, duplicate, or cancel them."
      />
    )
  }

  const btn =
    'inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-primary-bg hover:bg-primary-bg/40 disabled:opacity-50'
  const dangerBtn =
    'inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50'

  return (
    <>
      <div className="space-y-3">
        {events.map((ev) => {
          const busy = pending && pendingId === ev.id
          return (
            <RowCard
              key={ev.id}
              href={`/events/${ev.slug}`}
              title={ev.title}
              dimmed={ev.isCancelled || ev.isPast}
              badge={
                ev.isCancelled ? (
                  <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger">
                    Cancelled
                  </span>
                ) : ev.isPast ? (
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-subtle">
                    Past
                  </span>
                ) : (
                  <span className="rounded-full bg-primary-bg px-2 py-0.5 text-[11px] font-semibold text-primary-strong">
                    Upcoming
                  </span>
                )
              }
              context={ev.whenLabel}
              actions={
                <>
                  <Link href={`/events/${ev.slug}/edit`} className={btn}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                  </Link>
                  <Link href={`/events/new?duplicate=${ev.id}`} className={btn}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate
                  </Link>
                  {!ev.isCancelled && !ev.isPast && (
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: 'cancel', ev })}
                      disabled={busy}
                      className={dangerBtn}
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden /> Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'delete', ev })}
                    disabled={busy}
                    className={dangerBtn}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                  </button>
                </>
              }
            />
          )
        })}
      </div>

      <DangerModal
        open={confirm?.kind === 'cancel'}
        onClose={() => setConfirm(null)}
        title="Cancel event"
        body={
          <>
            This marks <span className="font-semibold text-text">{confirm?.ev.title}</span> as
            cancelled for everyone, and refunds any paid tickets. You can&apos;t undo this from here.
          </>
        }
        confirmLabel="Cancel event"
        onConfirm={() => confirm && run(confirm)}
      />
      <DangerModal
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete event"
        body={
          <>
            This permanently deletes <span className="font-semibold text-text">{confirm?.ev.title}</span>{' '}
            and removes it from every calendar and feed. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete event"
        onConfirm={() => confirm && run(confirm)}
      />
    </>
  )
}
