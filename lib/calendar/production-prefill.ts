import type { SpacePlan } from './plans'
import type { EntryRow } from './entries'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'

// PRODUCTION PREFILL (ADR-1386 P3). Map a Plan plus the chosen Pencil onto the event Spark
// field keys. Reads keys the Event manifest already declares. Never a second wizard.

const MANIFEST_PATHS = new Set(EVENT_MANIFEST.fields.map((f) => f.path))

export interface ProductionPrefill {
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  planId: string
  sourceEntryId: string
}

function wallLocal(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function productionPrefill(plan: Pick<SpacePlan, 'id' | 'title' | 'notes'>, entry: EntryRow): ProductionPrefill {
  const title = MANIFEST_PATHS.has('title') ? entry.title || plan.title : plan.title
  const description = MANIFEST_PATHS.has('description') ? entry.description || '' : ''
  const location = MANIFEST_PATHS.has('location') ? entry.location || '' : ''
  const startsAt = MANIFEST_PATHS.has('startsAt') ? wallLocal(entry.starts_at) : ''
  const endsAt = MANIFEST_PATHS.has('endsAt') ? wallLocal(entry.ends_at) : ''
  return {
    title,
    description,
    location,
    startsAt,
    endsAt,
    planId: plan.id,
    sourceEntryId: entry.id,
  }
}

/** Required Spark fields still empty, plus open to-dos. Derived, never a second list. */
export function readinessGaps(opts: {
  required: readonly { path: string; label: string; value: unknown }[]
  openTodoCount: number
}): string[] {
  const gaps = opts.required
    .filter((f) => f.value == null || (typeof f.value === 'string' && !f.value.trim()))
    .map((f) => f.label)
  if (opts.openTodoCount > 0) {
    gaps.push(opts.openTodoCount === 1 ? '1 open to-do' : `${opts.openTodoCount} open to-dos`)
  }
  return gaps
}
