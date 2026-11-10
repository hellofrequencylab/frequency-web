/**
 * The Trail draft model and its commands (FH-013). Pure: no database, no Next, no network.
 * The route handlers and screens call these; they own nothing else. Design: docs/hunts/CREATOR-FLOW.md.
 *
 * A resident edits a flat list of stops. The graph is derived from it (a Trail is stops in order,
 * finish at the last), so the resident never edits edges. Preview evaluates that graph in memory:
 * nothing here can write a claim, a credit or an audit row.
 */
import { evaluate, validateGraph } from '@/lib/hunts/graph'
import type { Blocker, HuntGraph } from '@/lib/hunts/graph'

export type Stop = {
  place: string
  clue: string
  hint?: string
  /** A live placement the resident has marked as placed (FH-014 owns real placements). */
  placementReady: boolean
}

export type TrailDraft = {
  title: string
  hook: string
  area: string
  /** Who the trail is for, in the resident's words. */
  audience: string
  stops: Stop[]
  /** Set by the route test on this revision; any edit clears it (see saveDraft). */
  routeTestedAtRevision: number | null
  permissionConfirmed: boolean
}

export const MIN_STOPS = 3
export const MAX_STOPS = 10
/** Field caps, the same numbers the hunt_missions columns hold (title 120) plus plain room for a clue. */
const TRAIL_LIMITS = { title: 120, line: 200, clue: 1000 } as const

/** `stop-1`, `stop-2`, ... Keys follow position, so reordering a stop reorders the Trail. */
export const stopKey = (index: number): string => `stop-${index + 1}`

export function emptyStop(): Stop {
  return { place: '', clue: '', hint: '', placementReady: false }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

/**
 * Read a draft off untrusted input (an action argument, a stored jsonb). Total: anything that is
 * not a draft becomes an empty one, strings are capped, and more than MAX_STOPS stops are dropped.
 * The revision marker is read as a number only; a tab cannot forge a route test with a string.
 */
export function parseTrailDraft(input: unknown): TrailDraft {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const rawStops = Array.isArray(o.stops) ? o.stops.slice(0, MAX_STOPS) : []
  const stops: Stop[] = rawStops.map((s) => {
    const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    return {
      place: text(r.place, TRAIL_LIMITS.title),
      clue: text(r.clue, TRAIL_LIMITS.clue),
      hint: text(r.hint, TRAIL_LIMITS.line),
      placementReady: r.placementReady === true,
    }
  })
  const tested = o.routeTestedAtRevision
  return {
    title: text(o.title, TRAIL_LIMITS.title),
    hook: text(o.hook, TRAIL_LIMITS.line),
    area: text(o.area, TRAIL_LIMITS.line),
    audience: text(o.audience, TRAIL_LIMITS.line),
    stops,
    routeTestedAtRevision: typeof tested === 'number' && Number.isInteger(tested) && tested >= 1 ? tested : null,
    permissionConfirmed: o.permissionConfirmed === true,
  }
}

/** The Trail graph for a draft: each stop needs the one before it, the finish needs the last. */
export function draftToGraph(draft: Pick<TrailDraft, 'stops'>): HuntGraph {
  const missions = draft.stops.map((_, i) => ({
    mission_key: stopKey(i),
    rule_groups: i === 0 ? [] : [{ logic: 'all' as const, members: [stopKey(i - 1)] }],
  }))
  const last = draft.stops.length - 1
  return {
    missions,
    finish: { rule_groups: last >= 0 ? [{ logic: 'all' as const, members: [stopKey(last)] }] : [] },
  }
}

export type ChecklistItem = { code: string; ok: boolean; message: string; stop?: number }

/** The publish checklist. Publishing stays off until every item is ok. */
export function publishChecklist(draft: TrailDraft, revision: number): { ok: boolean; items: ChecklistItem[] } {
  const items: ChecklistItem[] = []
  const graph = validateGraph(draftToGraph(draft))
  const blockers: Blocker[] = draft.stops.length >= MIN_STOPS ? graph.blockers : []
  items.push({
    code: 'stops_count',
    ok: draft.stops.length >= MIN_STOPS && draft.stops.length <= MAX_STOPS,
    message: `A trail needs ${MIN_STOPS} to ${MAX_STOPS} stops.`,
  })
  items.push({
    code: 'graph',
    ok: blockers.length === 0,
    message: blockers[0]?.message ?? 'The stops lead to a finish.',
  })
  draft.stops.forEach((s, i) => {
    items.push({ code: 'stop_text', ok: s.place.trim() !== '' && s.clue.trim() !== '', stop: i, message: 'This stop needs a place name and a clue.' })
    items.push({ code: 'stop_placement', ok: s.placementReady, stop: i, message: 'Print or place a code at this stop so people can prove they were here.' })
  })
  items.push({ code: 'title', ok: draft.title.trim() !== '', message: 'Give the trail a title.' })
  items.push({ code: 'route_test', ok: draft.routeTestedAtRevision === revision, message: 'Walk it once in preview before you publish.' })
  items.push({ code: 'permission', ok: draft.permissionConfirmed, message: 'Confirm you may place a code at each place.' })
  return { ok: items.every((i) => i.ok), items }
}

/**
 * Preview: what a player would see after earning `credited` stops, evaluated in memory. Writes nothing.
 * Returns keys and states only, like the real evaluator.
 */
export function previewTrail(draft: Pick<TrailDraft, 'stops'>, credited: readonly string[], now: Date = new Date()) {
  return evaluate(
    draftToGraph(draft),
    credited.map((mission_key) => ({ mission_key })),
    now,
  )
}

/** What the store must offer. `update` is one conditional write: it applies only when the stored revision equals `baseRevision`. */
export type DraftStore = {
  update(huntId: string, baseRevision: number, draft: TrailDraft): Promise<{ applied: true; revision: number } | { applied: false; currentRevision: number }>
}

/**
 * Save a draft from a tab that last saw `baseRevision`. A tab holding an older revision gets a conflict
 * and nothing is written, so two tabs cannot overwrite a newer revision. Any saved edit clears the route
 * test, which must be run again on the new revision.
 */
export async function saveDraft(store: DraftStore, input: { huntId: string; baseRevision: number; draft: TrailDraft }) {
  const edited: TrailDraft = { ...input.draft, routeTestedAtRevision: null }
  const res = await store.update(input.huntId, input.baseRevision, edited)
  if (res.applied) return { ok: true as const, revision: res.revision }
  return { ok: false as const, conflict: true as const, currentRevision: res.currentRevision }
}

// ── Publishing ───────────────────────────────────────────────────────────────────────────────

/** The rows an immutable published version holds (FH-005 tables), derived from the draft. Pure. */
type PublishRows = {
  missions: { mission_key: string; title: string; visible_body: string; locked_teaser: string | null; kind: 'visit'; required_assurance: 'signed_node' }[]
  /** One prerequisite group per stop after the first, plus the finish group. */
  groups: { key: string; target_mission_key: string | null; target_finish: boolean; logic: 'all'; members: string[] }[]
}

export function publishRows(draft: TrailDraft): PublishRows {
  const graph = draftToGraph(draft)
  const missions = draft.stops.map((s, i) => ({
    mission_key: stopKey(i),
    title: s.place.trim(),
    visible_body: s.clue.trim(),
    locked_teaser: s.hint?.trim() ? s.hint.trim() : null,
    kind: 'visit' as const,
    required_assurance: 'signed_node' as const,
  }))
  const groups: PublishRows['groups'] = []
  for (const m of graph.missions) {
    for (const g of m.rule_groups) {
      groups.push({ key: `${m.mission_key}:needs`, target_mission_key: m.mission_key, target_finish: false, logic: 'all', members: g.members })
    }
  }
  for (const g of graph.finish.rule_groups) {
    groups.push({ key: 'finish', target_mission_key: null, target_finish: true, logic: 'all', members: g.members })
  }
  return { missions, groups }
}

/**
 * The published content as one canonical string, so two publishes of the same draft hash the same
 * and any material change hashes differently. Key order is fixed here; the hash itself is the
 * store's (node:crypto is not pure).
 */
export function canonicalContent(draft: TrailDraft): string {
  const rows = publishRows(draft)
  return JSON.stringify({
    schema: 1,
    title: draft.title.trim(),
    hook: draft.hook.trim(),
    area: draft.area.trim(),
    audience: draft.audience.trim(),
    missions: rows.missions,
    groups: rows.groups,
  })
}
