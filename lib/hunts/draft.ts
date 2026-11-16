/**
 * The Trail draft model and its commands (FH-013). Pure: no database, no Next, no network.
 * The route handlers and screens call these; they own nothing else. Design: docs/hunts/CREATOR-FLOW.md.
 *
 * A resident edits a flat list of stops. The graph is derived from it (a Trail is stops in order,
 * finish at the last), so the resident never edits edges. Preview evaluates that graph in memory:
 * nothing here can write a claim, a credit or an audit row.
 */
import { evaluate, validateGraph } from '@/lib/hunts/graph'
import type { Blocker, Chapter, HuntGraph, Mission, RuleGroup } from '@/lib/hunts/graph'

export type Stop = {
  place: string
  clue: string
  hint?: string
  /** A live placement the resident has marked as placed (FH-014 owns real placements). */
  placementReady: boolean
  /** FH-020V: keep a visit that staff could not confirm on the spot for review, instead of refusing it. */
  holdForReview?: boolean
  /**
   * FH-020X: staff at this place confirm each visit, so the stop's mission publishes at `staff`
   * assurance. A scan alone is then refused, or kept for review when `holdForReview` is on too.
   */
  staffConfirmed?: boolean
  /**
   * FH-020X: the live placement printed for this stop. Written by the publish (lib/hunts/store.ts
   * `bindStopPlacements`), never typed: a value that is not this Hunt's live placement is ignored there.
   */
  placementId?: string
}

/**
 * FH-030S: where one stop's code sits, beyond the default (the Space that runs the Hunt, or none).
 * `venue` and `substitute` are Space ids, limited at publish to the Hunt's own Space or a live partner
 * (lib/hunts/partners.ts). The substitute is a second, equivalent code for the same stop at another
 * place: a visit at either counts once, and it keeps the stop open when the first place closes.
 */
export type StopVenue = { stop: string; venue: string; substitute?: string }

/**
 * FH-030S: a region of a Passport (a `Chapter` in lib/hunts/graph). A player who stays inside one
 * switched-on region, plus the stops in no region, must be able to finish. A region switched off takes
 * no new visits; visits already counted there stay counted.
 */
export type DraftRegion = { name: string; enabled: boolean; stops: string[] }

/** `trail`: stops in order, finish at the last. `passport`: any order, finish after `finishCount` places. */
type TrailShape = 'trail' | 'passport'

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
  /** FH-030S. Absent means `trail`, so every draft saved before it reads back unchanged. */
  shape?: TrailShape
  /** FH-030S: a Passport finishes after this many distinct places. Absent means every stop. */
  finishCount?: number
  /** FH-030S: the stops whose code sits at a chosen venue, with an optional substitute. */
  venues?: StopVenue[]
  /** FH-030S: the regions of a Passport, each with its own on and off switch. */
  regions?: DraftRegion[]
}

export const MIN_STOPS = 3
export const MAX_STOPS = 10
/** FH-030S: at most this many regions on one Passport. */
export const MAX_REGIONS = 5
/** Field caps, the same numbers the hunt_missions columns hold (title 120) plus plain room for a clue. */
const TRAIL_LIMITS = { title: 120, line: 200, clue: 1000 } as const

/** `stop-1`, `stop-2`, ... Keys follow position, so reordering a stop reorders the Trail. */
export const stopKey = (index: number): string => `stop-${index + 1}`

export function emptyStop(): Stop {
  return { place: '', clue: '', hint: '', placementReady: false }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      // A strict true only, like placementReady; absent otherwise so older drafts read back unchanged.
      ...(r.holdForReview === true ? { holdForReview: true } : {}),
      ...(r.staffConfirmed === true ? { staffConfirmed: true } : {}),
      ...(typeof r.placementId === 'string' && UUID.test(r.placementId) ? { placementId: r.placementId.toLowerCase() } : {}),
    }
  })
  const tested = o.routeTestedAtRevision
  const keys = new Set(stops.map((_, i) => stopKey(i)))
  const space = (v: unknown): string | undefined => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : undefined)
  // FH-030S. Each key is written only when it says something, so a draft saved before it reads back unchanged.
  const venues: StopVenue[] = []
  for (const raw of Array.isArray(o.venues) ? o.venues.slice(0, MAX_STOPS) : []) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const stop = typeof r.stop === 'string' && keys.has(r.stop) ? r.stop : undefined
    const venue = space(r.venue)
    if (!stop || !venue || venues.some((v) => v.stop === stop)) continue
    const substitute = space(r.substitute)
    venues.push({ stop, venue, ...(substitute && substitute !== venue ? { substitute } : {}) })
  }
  const regions: DraftRegion[] = (Array.isArray(o.regions) ? o.regions.slice(0, MAX_REGIONS) : []).map((raw) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const members = Array.isArray(r.stops) ? r.stops.filter((k): k is string => typeof k === 'string' && keys.has(k)) : []
    return { name: text(r.name, TRAIL_LIMITS.line), enabled: r.enabled === true, stops: [...new Set(members)] }
  })
  const count = o.finishCount
  return {
    title: text(o.title, TRAIL_LIMITS.title),
    hook: text(o.hook, TRAIL_LIMITS.line),
    area: text(o.area, TRAIL_LIMITS.line),
    audience: text(o.audience, TRAIL_LIMITS.line),
    stops,
    routeTestedAtRevision: typeof tested === 'number' && Number.isInteger(tested) && tested >= 1 ? tested : null,
    permissionConfirmed: o.permissionConfirmed === true,
    ...(o.shape === 'passport' ? { shape: 'passport' as const } : {}),
    ...(typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= MAX_STOPS ? { finishCount: count } : {}),
    ...(venues.length > 0 ? { venues } : {}),
    ...(regions.length > 0 ? { regions } : {}),
  }
}

/**
 * FH-030S: the same draft with its stops in a new order. `order[i]` is the old index of the stop that
 * now sits at i; an old index left out is a removed stop. Stop keys follow position, so every venue and
 * region that names a stop moves with it, and one that names a removed stop is dropped.
 */
export function reorderStops(draft: TrailDraft, order: readonly number[]): TrailDraft {
  const rename = new Map(order.map((from, to) => [stopKey(from), stopKey(to)]))
  const venues = (draft.venues ?? []).flatMap((v) => (rename.has(v.stop) ? [{ ...v, stop: rename.get(v.stop)! }] : []))
  const regions = (draft.regions ?? []).map((r) => ({ ...r, stops: r.stops.flatMap((k) => (rename.has(k) ? [rename.get(k)!] : [])) }))
  const { venues: _v, regions: _r, ...rest } = draft
  return {
    ...rest,
    stops: order.map((from) => draft.stops[from]),
    ...(venues.length > 0 ? { venues } : {}),
    ...(draft.regions ? { regions } : {}),
  }
}

/** The live facts a graph is checked against (FH-030S). Both default to none. */
type VenueFacts = {
  /** The Space that runs the Hunt. A code there is the organiser's own, so it never shares a count bucket. */
  ownerSpaceId?: string | null
  /** Venues that are closed, or are set to close (a partner that withdrew, was suspended, or has an end date). */
  closedVenues?: ReadonlySet<string>
}

/** How many distinct places finish a Passport: the draft's number, capped at the stop count. */
export function passportCount(draft: Pick<TrailDraft, 'stops' | 'finishCount'>): number {
  const n = draft.stops.length
  return draft.finishCount !== undefined ? Math.min(draft.finishCount, n) : n
}

const isPassport = (draft: Pick<TrailDraft, 'shape'>): boolean => draft.shape === 'passport'

/** The regions as graph chapters: `region-1`, `region-2`, ... in the order the resident wrote them. */
function draftChapters(draft: Pick<TrailDraft, 'stops' | 'regions'>): Chapter[] {
  const keys = new Set(draft.stops.map((_, i) => stopKey(i)))
  return (draft.regions ?? []).map((r, i) => ({ chapter_key: `region-${i + 1}`, enabled: r.enabled, members: r.stops.filter((k) => keys.has(k)) }))
}

/**
 * The graph for a draft. A Trail: each stop needs the one before it, the finish needs the last. A
 * Passport (FH-030S): every stop is open from the start and the finish counts `passportCount` distinct
 * places. A stop with a chosen venue carries its codes as equivalent placements; a code at the Hunt's
 * own Space has no venue for counting, so a Space-run Passport still counts each stop.
 */
export function draftToGraph(draft: Pick<TrailDraft, 'stops' | 'shape' | 'finishCount' | 'venues' | 'regions'>, facts: VenueFacts = {}): HuntGraph {
  const passport = isPassport(draft)
  const countVenue = (v: string): string | null => (v === facts.ownerSpaceId ? null : v)
  const missions: Mission[] = draft.stops.map((_, i) => {
    const key = stopKey(i)
    const at = draft.venues?.find((v) => v.stop === key)
    const placements = at
      ? [at.venue, ...(at.substitute ? [at.substitute] : [])].map((venue, n) => ({
          placement_key: `${key}:${n === 0 ? 'main' : 'substitute'}`,
          venue: countVenue(venue),
          ...(facts.closedVenues?.has(venue) ? { closed: true } : {}),
        }))
      : []
    return {
      mission_key: key,
      ...(placements.length > 0 ? { placements } : {}),
      rule_groups: passport || i === 0 ? [] : [{ logic: 'all' as const, members: [stopKey(i - 1)] }],
    }
  })
  const last = draft.stops.length - 1
  const finish: RuleGroup[] =
    last < 0
      ? []
      : passport
        ? [{ logic: 'count', min_count: passportCount(draft), members: draft.stops.map((_, i) => stopKey(i)) }]
        : [{ logic: 'all', members: [stopKey(last)] }]
  const chapters = draftChapters(draft)
  return { missions, finish: { rule_groups: finish }, ...(chapters.length > 0 ? { chapters } : {}) }
}

const stopWords = (k: string): string => k.replace(/^stop-(\d+)$/, 'stop $1')

/**
 * A graph blocker in the resident's words (FH-030S). The engine's own text names mission and chapter
 * keys; here a stop is "stop 2" and a chapter is the region's name. Codes this has no wording for keep
 * the engine's text.
 */
export function blockerMessage(b: Blocker, draft: Pick<TrailDraft, 'regions'> = {}): string {
  const stops = [...new Set(b.mission_keys.filter((k) => /^stop-\d+$/.test(k)))].map(stopWords)
  const region = (): string => {
    const m = b.message.match(/region-(\d+)/)
    const name = m ? draft.regions?.[Number(m[1]) - 1]?.name.trim() : ''
    return name ? `The region "${name}"` : 'A region'
  }
  switch (b.code) {
    case 'COUNT_IMPOSSIBLE':
      return 'The Passport asks for more places than a player can visit. Two stops at the same venue count once, and a closed venue counts for nothing. Lower the number or add stops at other places.'
    case 'VENUE_COUNTS_TWICE':
      return `${stops.join(' and ') || 'Two stops'} could both be visited at the same venue, so one visit could count twice. Move one of the codes.`
    case 'CHAPTER_INVALID':
      return 'Each stop can be in one region at most, and every region needs at least one stop.'
    case 'CHAPTER_INFEASIBLE':
      return `${region()} cannot be finished on its own. Add stops to it, lower the number of places, or switch the region off.`
    case 'CHAPTER_NO_FREE_FINISH':
      return `${region()} can only be finished through a paid stop. Each region needs a free way to finish.`
    case 'FINISH_UNREACHABLE':
      return 'No player could reach the finish. Check the number of places, and any stop whose venue is closed.'
    default:
      return b.message
  }
}

export type ChecklistItem = { code: string; ok: boolean; message: string; stop?: number }

/**
 * The publish checklist. Publishing stays off until every item is ok. `venue` says whether the Trail
 * has a venue Space whose staff can confirm a visit (FH-020X); unknown counts as none, so a stop that
 * staff must confirm never goes live where nobody can confirm it.
 */
export function publishChecklist(
  draft: TrailDraft,
  revision: number,
  opts: {
    venue?: boolean
    /**
     * FH-030S: the venues a stop may name, the Hunt's own Space and its live partners, read this request.
     * Unknown counts as none, so a stop never goes live at a place that has not agreed.
     */
    allowedVenues?: ReadonlySet<string>
  } & VenueFacts = {},
): { ok: boolean; items: ChecklistItem[] } {
  const items: ChecklistItem[] = []
  // The graph as published, then (FH-030S) the same graph with every closed or closing venue shut. A
  // closure the open graph survives is fine; one that breaks a region or the finish is refused here,
  // before it goes live.
  const open = validateGraph(draftToGraph(draft, { ownerSpaceId: opts.ownerSpaceId }))
  const blockers: Blocker[] = draft.stops.length >= MIN_STOPS ? open.blockers : []
  items.push({
    code: 'stops_count',
    ok: draft.stops.length >= MIN_STOPS && draft.stops.length <= MAX_STOPS,
    message: `A trail needs ${MIN_STOPS} to ${MAX_STOPS} stops.`,
  })
  items.push({
    code: 'graph',
    ok: blockers.length === 0,
    message: blockers[0] ? blockerMessage(blockers[0], draft) : 'The stops lead to a finish.',
  })
  if (opts.closedVenues && opts.closedVenues.size > 0 && blockers.length === 0 && draft.stops.length >= MIN_STOPS) {
    const shut = validateGraph(draftToGraph(draft, opts))
    items.push({
      code: 'venue_closure',
      ok: shut.ok,
      message: shut.blockers[0]
        ? `A venue on this trail is leaving or closed. Without it: ${blockerMessage(shut.blockers[0], draft)} Add a substitute place for its stops.`
        : 'Every region can still be finished without the venues that are leaving.',
    })
  }
  for (const v of draft.venues ?? []) {
    const index = draft.stops.findIndex((_, i) => stopKey(i) === v.stop)
    if (index < 0) continue
    const places = [v.venue, ...(v.substitute ? [v.substitute] : [])]
    items.push({
      code: 'stop_venue',
      ok: places.every((p) => opts.allowedVenues?.has(p) === true),
      stop: index,
      message: 'This stop names a place that is not this Hunt\'s Space or a partner that has accepted. Choose another place or invite the venue.',
    })
  }
  draft.stops.forEach((s, i) => {
    items.push({ code: 'stop_text', ok: s.place.trim() !== '' && s.clue.trim() !== '', stop: i, message: 'This stop needs a place name and a clue.' })
    items.push({ code: 'stop_placement', ok: s.placementReady, stop: i, message: 'Print or place a code at this stop so people can prove they were here.' })
    if (s.staffConfirmed === true) {
      items.push({ code: 'stop_staff_venue', ok: opts.venue === true, stop: i, message: 'Staff can confirm visits only on a trail a Space runs. Turn off staff confirming for this stop.' })
    }
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
export function previewTrail(draft: Pick<TrailDraft, 'stops' | 'shape' | 'finishCount' | 'venues' | 'regions'>, credited: readonly string[], now: Date = new Date()) {
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
  missions: { mission_key: string; title: string; visible_body: string; locked_teaser: string | null; kind: 'visit'; required_assurance: 'signed_node' | 'staff' }[]
  /**
   * A Trail: one prerequisite group per stop after the first, plus the finish group. A Passport
   * (FH-030S): the finish group alone, `count` with its `min_count`, the column check
   * `hunt_rule_groups` holds (min_count only on a count group).
   */
  groups: ({ key: string; target_mission_key: string | null; target_finish: boolean; members: string[] } & ({ logic: 'all' } | { logic: 'count'; min_count: number }))[]
}

export function publishRows(draft: TrailDraft): PublishRows {
  const graph = draftToGraph(draft)
  const missions = draft.stops.map((s, i) => ({
    mission_key: stopKey(i),
    title: s.place.trim(),
    visible_body: s.clue.trim(),
    locked_teaser: s.hint?.trim() ? s.hint.trim() : null,
    kind: 'visit' as const,
    // FH-020X: a staff-confirmed stop needs staff assurance; every other stop keeps the signed scan.
    required_assurance: s.staffConfirmed === true ? ('staff' as const) : ('signed_node' as const),
  }))
  const groups: PublishRows['groups'] = []
  for (const m of graph.missions) {
    for (const g of m.rule_groups) {
      groups.push({ key: `${m.mission_key}:needs`, target_mission_key: m.mission_key, target_finish: false, logic: 'all', members: g.members })
    }
  }
  for (const g of graph.finish.rule_groups) {
    // FH-030S: the threshold of a count group travels with it as min_count; an all group has none.
    if (g.logic === 'count') groups.push({ key: 'finish', target_mission_key: null, target_finish: true, logic: 'count', min_count: g.min_count ?? g.members.length, members: g.members })
    else groups.push({ key: 'finish', target_mission_key: null, target_finish: true, logic: 'all', members: g.members })
  }
  return { missions, groups }
}

/**
 * The version policy keys a publish writes beside `trail` (FH-030S): the regions as `chapters`, the key
 * lib/hunts/run-store.ts reads into the player graph. Empty when the draft has no regions.
 */
export function publishPolicy(draft: Pick<TrailDraft, 'stops' | 'regions'>): { chapters?: Chapter[] } {
  const chapters = draftChapters(draft)
  return chapters.length > 0 ? { chapters } : {}
}

/** FH-030S: the venue of each stop's main code and its substitute, if any. Null means the default. */
export function stopVenue(draft: Pick<TrailDraft, 'venues'>, index: number): { venue: string | null; substitute: string | null } {
  const at = draft.venues?.find((v) => v.stop === stopKey(index))
  return { venue: at?.venue ?? null, substitute: at?.substitute ?? null }
}

/** FH-030S: every Space a stop names as a venue or a substitute, for the partner check at publish. */
export function draftVenueIds(draft: Pick<TrailDraft, 'venues'>): string[] {
  return [...new Set((draft.venues ?? []).flatMap((v) => [v.venue, ...(v.substitute ? [v.substitute] : [])]))].sort()
}

type BindingPolicy = { mission_key: string; placement_id: string; evidence_policy: unknown }

/**
 * The stop's opt-in as the database reads it (FH-020V). `hunt_claim_apply` keeps a qualifying shortfall
 * for staff review only when the mission placement carries `evidence_policy.hold_for_review = true`
 * (supabase/migrations/20270346053000_hunt_claim_hold.sql). The resident sets a switch on the stop; this
 * is the only place that turns it into the stored key, so no screen ever edits the JSON.
 */
export function stopEvidencePolicy(stop: Pick<Stop, 'holdForReview'> | undefined): { hold_for_review?: true } {
  return stop?.holdForReview === true ? { hold_for_review: true } : {}
}

/**
 * Which mission placements need their evidence policy rewritten to match the draft. Other keys on a
 * binding's policy are kept. A binding for a stop the draft no longer has is left alone. Pure: the
 * store reads the bindings and writes what this returns.
 */
export function evidencePolicyUpdates(draft: Pick<TrailDraft, 'stops'>, bindings: readonly BindingPolicy[]): { mission_key: string; placement_id: string; evidence_policy: Record<string, unknown> }[] {
  const updates: { mission_key: string; placement_id: string; evidence_policy: Record<string, unknown> }[] = []
  for (const binding of bindings) {
    const index = draft.stops.findIndex((_, i) => stopKey(i) === binding.mission_key)
    if (index < 0) continue
    const current = binding.evidence_policy && typeof binding.evidence_policy === 'object' && !Array.isArray(binding.evidence_policy)
      ? binding.evidence_policy as Record<string, unknown>
      : {}
    const { hold_for_review: was, ...rest } = current
    const wanted = stopEvidencePolicy(draft.stops[index])
    if ((was === true) === (wanted.hold_for_review === true) && (was === undefined || was === true)) continue
    updates.push({ mission_key: binding.mission_key, placement_id: binding.placement_id, evidence_policy: { ...rest, ...wanted } })
  }
  return updates
}

/**
 * Which placement each stop is bound through when the version publishes (FH-020X). Pure: the store
 * reads this Hunt's live placements and the version's bindings, and creates a placement for each null.
 * A stop keeps the placement it names when that placement is live here, else reuses a live placement
 * already bound to its mission on this version. No placement serves two stops, so a scan always names
 * exactly one mission (lib/hunts/staff-store.ts `loadUniquePlacementMission`).
 */
export function planStopPlacements(
  draft: Pick<TrailDraft, 'stops'>,
  facts: { live: ReadonlySet<string>; bound: readonly { mission_key: string; placement_id: string }[] },
): (string | null)[] {
  const taken = new Set<string>()
  const pick = (id: string | undefined): string | null => {
    if (!id || !facts.live.has(id) || taken.has(id)) return null
    taken.add(id)
    return id
  }
  const named = draft.stops.map((s) => pick(s.placementId))
  return named.map((id, i) => id ?? facts.bound.filter((b) => b.mission_key === stopKey(i)).map((b) => pick(b.placement_id)).find((x) => x !== null) ?? null)
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
    // Only when a stop opts in, so every Trail published before FH-020V keeps its hash.
    ...(draft.stops.some((stop) => stop.holdForReview === true)
      ? { review_holds: draft.stops.flatMap((stop, i) => (stop.holdForReview === true ? [stopKey(i)] : [])) }
      : {}),
    // FH-030S, the same rule: only when the draft names a venue or a region.
    ...(draft.venues && draft.venues.length > 0 ? { venues: draft.venues } : {}),
    ...publishPolicy(draft),
  })
}
