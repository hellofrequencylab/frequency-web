import type { SpacePlan } from './plans'
import type { EntryRow } from './entries'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'

// PRODUCTION PREFILL (ADR-1386 P3, ADR-1504). Map the chosen Pencil, plus its Plan when it has
// one, onto the event Spark field keys. Reads keys the Event manifest already declares. Never a
// second wizard. The Plan is optional because the entry drawer's Publish step (ADR-1504) opens the
// Spark from a date that was never put on a Plan; the entry alone carries everything the Spark
// needs, and the Plan only adds a fallback title and the link back.

const MANIFEST_PATHS = new Set(EVENT_MANIFEST.fields.map((f) => f.path))

export interface ProductionPrefill {
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  /** The entry's own zone (ADR-1504). `startsAt`/`endsAt` are wall-clock in THIS zone; without it
   *  the Spark read them in the host's home zone and the event moved when the two differed. */
  timeZone: string
  /** '' when the date is not on a Plan. */
  planId: string
  sourceEntryId: string
}

function wallLocal(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function productionPrefill(
  plan: Pick<SpacePlan, 'id' | 'title' | 'notes'> | null,
  entry: EntryRow,
): ProductionPrefill {
  const planTitle = plan?.title ?? ''
  const title = MANIFEST_PATHS.has('title') ? entry.title || planTitle : planTitle
  // Description is public copy; Team notes never reach the Spark (ADR-1388 §5).
  const description = MANIFEST_PATHS.has('description') ? entry.description || '' : ''
  const location = MANIFEST_PATHS.has('location') ? entry.location || '' : ''
  const startsAt = MANIFEST_PATHS.has('startsAt') ? wallLocal(entry.starts_at) : ''
  const endsAt = MANIFEST_PATHS.has('endsAt') ? wallLocal(entry.ends_at) : ''
  const timeZone = MANIFEST_PATHS.has('timeZone') ? entry.time_zone || '' : ''
  return {
    title,
    description,
    location,
    startsAt,
    endsAt,
    timeZone,
    planId: plan?.id ?? '',
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
