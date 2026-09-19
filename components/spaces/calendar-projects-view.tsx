'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Select } from '@/components/ui/select'
import { moveCalendarProjectStage } from '@/app/(main)/spaces/[slug]/settings/calendar/entry-actions'
import { ENTRY_STAGES } from '@/lib/calendar/registry'
import type { ProjectCard, ProjectColumn } from '@/lib/calendar/project-board'
import { cn } from '@/lib/utils'

// PROJECTS VIEW (ADR-1464). Kanban over ENTRY_STAGES. Cards with an entryId move
// through Pencil, Planning, Production, and Cancelled. Published events stay in
// Production or Cancelled and open Manage. No new table.

export function CalendarProjectsView({
  slug,
  columns,
  canManage,
}: {
  slug: string
  columns: ProjectColumn[]
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const total = columns.reduce((n, col) => n + col.cards.length, 0)

  function move(entryId: string, stage: string) {
    setError(null)
    start(async () => {
      const res = await moveCalendarProjectStage(slug, entryId, stage)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  if (total === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="Nothing on the board."
        description="Pencil a date on the Admin view. An event on its way can move through these phases."
      />
    )
  }

  return (
    <div className="space-y-4" data-calendar-projects-view>
      <SectionHeader title="Projects" count={total} />
      {error && <p className="text-body-sm text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section
            key={col.stage}
            aria-labelledby={`project-col-${col.stage}`}
            data-project-column={col.stage}
            onDragOver={(e) => {
              if (canManage) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const entryId = e.dataTransfer.getData('text/plain')
              if (entryId) move(entryId, col.stage)
              setDragging(null)
            }}
            className={cn(
              'rounded-card border border-border bg-surface p-3',
              dragging && canManage && 'border-dashed border-primary',
            )}
          >
            <SectionHeader id={`project-col-${col.stage}`} title={col.label} count={col.cards.length} />
            <p className="mb-3 text-meta text-muted">{col.hint}</p>
            {col.cards.length === 0 ? (
              <p className="text-meta text-muted">Nothing in {col.label}.</p>
            ) : (
              <ul className="space-y-2">
                {col.cards.map((card) => (
                  <li key={card.key}>
                    <ProjectCardBlock
                      card={card}
                      column={col.stage}
                      canManage={canManage}
                      pending={pending}
                      onMove={move}
                      onDragStart={() => setDragging(card.entryId)}
                      onDragEnd={() => setDragging(null)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function ProjectCardBlock({
  card,
  column,
  canManage,
  pending,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  card: ProjectCard
  column: string
  canManage: boolean
  pending: boolean
  onMove: (entryId: string, stage: string) => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const movable = canManage && card.canMove && card.entryId
  return (
    <article
      draggable={Boolean(movable)}
      onDragStart={(e) => {
        if (!card.entryId) return
        e.dataTransfer.setData('text/plain', card.entryId)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-card border border-border bg-surface-elevated p-3',
        card.isCancelled && 'opacity-70',
        movable && 'cursor-grab',
      )}
    >
      <h3 className={cn('text-body-sm font-semibold text-text', card.isCancelled && 'line-through')}>{card.title}</h3>
      <p className="mt-1 text-meta text-muted">{card.whenLabel}</p>
      {card.goingCount > 0 && (
        <p className="mt-1 text-meta text-muted">
          <span className="font-semibold tabular-nums text-text">{card.goingCount}</span> going
        </p>
      )}
      <p className="mt-2">
        <span className="inline-flex items-center rounded-pill bg-surface px-2 py-0.5 text-meta font-semibold text-muted">
          {card.stageLabel}
        </span>
      </p>
      {movable ? (
        <div className="mt-3">
          <Select
            aria-label={`Move ${card.title}`}
            value={column}
            disabled={pending}
            wrapperClassName="inline-block w-max max-w-full"
            className="text-meta"
            options={ENTRY_STAGES.map((st) => ({ value: st.stage, label: st.label }))}
            onChange={(e) => onMove(card.entryId!, e.target.value)}
          />
        </div>
      ) : card.editHref || card.href ? (
        <p className="mt-3">
          <Link
            href={card.editHref ?? card.href ?? '#'}
            className="text-meta font-semibold text-primary-strong hover:underline"
          >
            {card.editHref ? 'Manage' : 'Open event'}
          </Link>
        </p>
      ) : null}
    </article>
  )
}
