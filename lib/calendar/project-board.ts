import type { CalendarEvent } from './item'
import { isOperatorListItem, operatorListHref, operatorStageLabel } from './pm-console'
import { ENTRY_STAGES, type EntryStage } from './registry'

// PROJECTS KANBAN (ADR-1464). Columns are ENTRY_STAGES (Pencil, Planning,
// Production, Cancelled). No new table. A card can move only when it is an
// event on its way (entryId). Published events sit in Production or Cancelled
// and open Manage. Do not name planningLane / productionLane here: those
// symbols close LIVE-417 / LIVE-418 on the Admin date-map console.

export type ProjectCard = {
  key: string
  title: string
  whenLabel: string
  stageLabel: string
  href: string | null
  editHref: string | null
  isCancelled: boolean
  entryId: string | null
  canMove: boolean
  goingCount: number
}

export type ProjectColumn = {
  stage: EntryStage
  label: string
  hint: string
  cards: ProjectCard[]
}

export function projectBoardStage(ev: CalendarEvent): EntryStage {
  if (ev.stage) return ev.stage
  if (ev.isCancelled) return 'cancelled'
  return 'production'
}

function toCard(ev: CalendarEvent): ProjectCard {
  return {
    key: `${ev.slug}|${ev.dayKey}`,
    title: ev.title,
    whenLabel: ev.whenLabel,
    stageLabel: operatorStageLabel(ev),
    href: operatorListHref(ev),
    editHref: ev.editHref ?? null,
    isCancelled: ev.isCancelled || ev.stage === 'cancelled',
    entryId: ev.entryId ?? null,
    canMove: Boolean(ev.entryId && ev.layer === 'pencil'),
    goingCount: ev.goingCount,
  }
}

export function projectBoard(events: CalendarEvent[]): ProjectColumn[] {
  const columns: ProjectColumn[] = ENTRY_STAGES.map((def) => ({
    stage: def.stage,
    label: def.label,
    hint: def.hint,
    cards: [],
  }))
  const index = new Map(columns.map((col) => [col.stage, col]))
  for (const ev of events
    .filter(isOperatorListItem)
    .slice()
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.title.localeCompare(b.title))) {
    index.get(projectBoardStage(ev))?.cards.push(toCard(ev))
  }
  return columns
}

export function canAcceptProjectMove(entryKind: string | null | undefined, nextStage: string): nextStage is EntryStage {
  if (entryKind !== 'pencil') return false
  return ENTRY_STAGES.some((d) => d.stage === nextStage)
}
