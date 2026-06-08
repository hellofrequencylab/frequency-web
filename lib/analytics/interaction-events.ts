// Wide interaction firehose — taxonomy + pure normalization (PI.1, ADR-166). The raw
// twin of the semantic `engagement_events` taxonomy (./events.ts). Unlike that closed,
// reviewable list, interaction KINDS are intentionally OPEN — a `kind` is any safe
// short slug — so a new signal needs no migration (ADR-166's "capture wide" rule). The
// list below is documentation + the auto-capture set, not a gate.
//
// Pure + server-shared: the /api/observe batch sink uses normalizeBatch to clean what
// the client buffer sends. No DB, no IO here.

import { sanitizeProps } from './track'

/** The signals the client auto-captures + explicit ones. Documentation, not a gate —
 *  any safe slug is accepted, so adding a kind is a one-line client call. */
export const KNOWN_INTERACTION_KINDS = [
  'view',        // entered a surface (route)
  'dwell',       // left a surface — props.ms = time on it
  'scroll',      // hit a scroll-depth milestone — props.pct
  'click',       // clicked an instrumented element — props.target
  'rage_click',  // rapid repeated clicks on one spot — props.count
  'search',      // ran a search — props.scope, props.q_len
  'zero_result', // a search returned nothing — props.scope
  'abandon',     // started then left a form/flow — props.form
  'visibility',  // tab hidden/shown — props.state
  'custom',      // explicit observe() with props.name
] as const

export type InteractionKind = (typeof KNOWN_INTERACTION_KINDS)[number] | (string & {})

/** Max events accepted per batch POST (a flush). Bounds payload + insert size. */
export const MAX_BATCH = 50

/** A safe kind slug: short, lowercase-ish identifier. Keeps the open taxonomy from
 *  becoming a junk drawer of arbitrary strings without closing it to an enum. */
export function isValidKind(kind: unknown): kind is string {
  return typeof kind === 'string' && /^[a-z][a-z0-9_.]{0,39}$/.test(kind)
}

export interface RawObservation {
  kind?: unknown
  surface?: unknown
  path?: unknown
  props?: unknown
  /** client event time, ms epoch (buffered events flush later, so per-event time matters) */
  t?: unknown
}

export interface CleanObservation {
  kind: string
  surface: string | null
  path: string | null
  props: Record<string, string | number | boolean>
  /** ISO string, clamped to a sane window (never future; not absurdly stale). */
  occurredAt: string
}

function clampTime(t: unknown): string {
  const now = Date.now()
  const n = typeof t === 'number' && Number.isFinite(t) ? t : now
  // Not in the future, and not older than ~6h (a buffered flush shouldn't exceed that).
  const clamped = Math.min(now, Math.max(now - 6 * 60 * 60 * 1000, n))
  return new Date(clamped).toISOString()
}

function cleanStr(v: unknown, maxLen: number): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, maxLen) : null
}

/** Normalize one raw observation from the client; null if the kind is invalid. */
export function normalizeObservation(raw: RawObservation): CleanObservation | null {
  if (!isValidKind(raw.kind)) return null
  return {
    kind: raw.kind,
    surface: cleanStr(raw.surface, 120),
    path: cleanStr(raw.path, 300),
    props: sanitizeProps(raw.props),
    occurredAt: clampTime(raw.t),
  }
}

/** Normalize + cap a batch (a flush). Drops invalid rows; never throws. */
export function normalizeBatch(rawList: unknown): CleanObservation[] {
  if (!Array.isArray(rawList)) return []
  const out: CleanObservation[] = []
  for (const raw of rawList.slice(0, MAX_BATCH)) {
    const clean = normalizeObservation((raw ?? {}) as RawObservation)
    if (clean) out.push(clean)
  }
  return out
}
