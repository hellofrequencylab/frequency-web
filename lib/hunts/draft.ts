/**
 * The Trail draft model and its commands (FH-013). Pure: no database, no Next, no network.
 * The route handlers and screens call these; they own nothing else. Design: docs/hunts/CREATOR-FLOW.md.
 *
 * A resident edits a flat list of stops. The graph is derived from it (a Trail is stops in order,
 * finish at the last), so the resident never edits edges. Preview evaluates that graph in memory:
 * nothing here can write a claim, a credit or an audit row.
 */
import { evaluate, validateGraph } from '@/lib/hunts/graph'
import type { Blocker, Chapter, HuntGraph } from '@/lib/hunts/graph'
import { BENEFIT_CODE } from '@/lib/hunts/pass-binding'
import { challengeProblems, stopLayers, stopPlay, type Challenge, type ChallengeView } from '@/lib/hunts/challenges'
import { slugify } from '@/lib/utils'
import { applyFinalePolicy, finaleContent, finaleDraftField } from '@/lib/hunts/finale-draft'

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

/** One thing a paid pass can include (FH-036S). `code` is the short name a pass or a store item binds to. */
type DraftBenefit = { label: string; code: string }

export const MAX_BENEFITS = 10

/**
 * FH-020Y: a partner venue named for one stop, by position. Only a Space with a live hunt_partners row
 * for this Hunt may be named (the editor offers those; publish checks again, lib/hunts/partners.ts
 * publishVenueBlocks). It lets a resident's Trail, which no Space runs, have a stop staff confirm.
 */
export type StopVenue = { stop: number; venueSpaceId: string }

/**
 * FH-030S: a region of a Passport, a named group of stops the organiser can switch off (a street closed
 * for a fair, a venue on holiday). Published as `policy.chapters` (lib/hunts/graph count rules), where a
 * switched-off region takes no new visits and a player who stays inside one region must still be able to
 * finish. Stops are named by position, like a venue or a challenge. A stop sits in one region at most.
 */
export type DraftRegion = { name: string; enabled: boolean; stops: number[] }

export const MAX_REGIONS = 5

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
  /** What a paid pass for this trail includes. Absent on a trail that sells nothing, which is most of them. */
  benefits?: DraftBenefit[]
  /** FH-020Y: partner venues named per stop. Absent when none is, which keeps older drafts unchanged. */
  venues?: StopVenue[]
  /**
   * FH-030S: a Passport. Players visit stops in any order and finish after this many of them (a 3 of 5
   * threshold), published as a `count` finish group with `min_count`. Absent is a Trail: stops in order.
   */
  finishCount?: number
  /** FH-030S: the Passport's regions. Absent when there are none; read only while `finishCount` is set. */
  regions?: DraftRegion[]
  /** FH-031T: the host Event the trail ends at. Absent on a trail with no finale. */
  finaleEventId?: string
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
  // A draft may hold a half-typed benefit, so nothing is validated here: the publish checklist does that.
  const benefits: DraftBenefit[] = (Array.isArray(o.benefits) ? o.benefits.slice(0, MAX_BENEFITS) : []).map((b) => {
    const r = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
    return { label: text(r.label, 80), code: text(r.code, 41).toLowerCase() }
  })
  // One venue per stop, a real stop position and a well formed Space id; liveness is checked at publish.
  const venues: StopVenue[] = []
  for (const v of Array.isArray(o.venues) ? o.venues.slice(0, MAX_STOPS) : []) {
    const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const stop = r.stop
    if (typeof stop !== 'number' || !Number.isInteger(stop) || stop < 0 || stop >= stops.length) continue
    if (typeof r.venueSpaceId !== 'string' || !UUID.test(r.venueSpaceId) || venues.some((x) => x.stop === stop)) continue
    venues.push({ stop, venueSpaceId: r.venueSpaceId.toLowerCase() })
  }
  // A whole number of stops; whether it can be reached is the publish checklist's question.
  const finishCount = typeof o.finishCount === 'number' && Number.isInteger(o.finishCount) && o.finishCount >= 1 && o.finishCount <= MAX_STOPS ? o.finishCount : null
  // Regions keep real stop positions only, each stop in the first region that names it.
  const placed = new Set<number>()
  const regions: DraftRegion[] = (Array.isArray(o.regions) ? o.regions.slice(0, MAX_REGIONS) : []).map((g) => {
    const r = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>
    const members = (Array.isArray(r.stops) ? r.stops : [])
      .map((x) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x))
      .filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < stops.length && !placed.has(x))
    const own = [...new Set(members)].sort((a, b) => a - b)
    own.forEach((x) => placed.add(x))
    return { name: text(r.name, 60), enabled: r.enabled === true, stops: own }
  })
  return {
    title: text(o.title, TRAIL_LIMITS.title),
    hook: text(o.hook, TRAIL_LIMITS.line),
    area: text(o.area, TRAIL_LIMITS.line),
    audience: text(o.audience, TRAIL_LIMITS.line),
    stops,
    routeTestedAtRevision: typeof tested === 'number' && Number.isInteger(tested) && tested >= 1 ? tested : null,
    permissionConfirmed: o.permissionConfirmed === true,
    // Present only when there is one, so a trail with no benefits is stored exactly as it always was.
    ...(benefits.length > 0 ? { benefits } : {}),
    ...(venues.length > 0 ? { venues: venues.sort((a, b) => a.stop - b.stop) } : {}),
    // FH-030S: present only on a Passport, so every Trail is stored exactly as before.
    ...(finishCount !== null ? { finishCount } : {}),
    ...(regions.length > 0 ? { regions } : {}),
    ...finaleDraftField(o.finaleEventId),
  }
}

/** FH-030S: the published key of the region at `index`. Keys follow position, like stop keys. */
const regionKey = (index: number): string => `region-${index + 1}`

/** FH-030S: a Passport's regions as the graph's chapters, or none. A Trail in order publishes none. */
function draftChapters(draft: Pick<TrailDraft, 'finishCount' | 'regions'>): Chapter[] {
  if (draft.finishCount === undefined) return []
  return (draft.regions ?? []).map((r, i) => ({ chapter_key: regionKey(i), enabled: r.enabled, members: r.stops.map(stopKey) }))
}

/** FH-030S: region stop lists after the stops move. `order[newIndex] = oldIndex`; a removed stop leaves its region. */
export function remapRegions(regions: readonly DraftRegion[], order: readonly number[]): DraftRegion[] {
  return regions.map((r) => ({ ...r, stops: r.stops.map((s) => order.indexOf(s)).filter((s) => s >= 0).sort((a, b) => a - b) }))
}

/** FH-020Y: the partner venue named for stop `i`, or null. */
export function stopVenue(draft: Pick<TrailDraft, 'venues'>, i: number): string | null {
  return draft.venues?.find((v) => v.stop === i)?.venueSpaceId ?? null
}

/** A short code from a label, e.g. "Tasting flight" gives `tasting-flight`. Empty when nothing usable is left. */
export function benefitCodeFrom(label: string): string {
  const code = slugify(label).replace(/^[^a-z]+/, '').slice(0, 41).replace(/-+$/, '')
  return BENEFIT_CODE.test(code) ? code : ''
}

/** Is every pass benefit complete: a label, a valid code, and no code used twice? */
export function benefitsReady(benefits: readonly DraftBenefit[]): boolean {
  const codes = benefits.map((b) => b.code)
  return benefits.every((b) => b.label.trim() !== '' && BENEFIT_CODE.test(b.code)) && new Set(codes).size === codes.length
}

/**
 * The Trail graph for a draft: each stop needs the one before it, the finish needs the last. With
 * challenges (FH-042S, lib/hunts/challenges.ts), neighbouring stops in one fork or stand-in set form one
 * layer: each of them needs the layer before, and what comes after needs any one of them. A Trail with
 * no challenges gets exactly the graph it always had.
 */
export function draftToGraph(draft: Pick<TrailDraft, 'stops' | 'finishCount' | 'regions'>, challenges: readonly ChallengeLike[] = []): HuntGraph {
  // FH-030S: a Passport has no order. Every stop is open from the start, the finish needs any
  // `finishCount` of them (distinct venues count once), and its regions are the graph's chapters.
  if (draft.finishCount !== undefined) {
    const chapters = draftChapters(draft)
    return {
      missions: draft.stops.map((_, i) => {
        const play = stopPlay(challenges.map(asChallenge), i)
        return {
          mission_key: stopKey(i),
          ...(play.kind === 'answer' ? { kind: 'answer' } : {}),
          ...(play.choiceGroup ? { choice_group: play.choiceGroup } : {}),
          ...(play.fallbackGroup ? { fallback_group: play.fallbackGroup } : {}),
          rule_groups: [],
        }
      }),
      finish: { rule_groups: draft.stops.length > 0 ? [{ logic: 'count' as const, min_count: draft.finishCount, members: draft.stops.map((_, i) => stopKey(i)) }] : [] },
      ...(chapters.length > 0 ? { chapters } : {}),
    }
  }
  if (challenges.length === 0) {
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
  const layers = stopLayers(draft.stops.length, challenges)
  const needs = (layer: number[] | undefined) =>
    layer ? [{ logic: layer.length > 1 ? ('any' as const) : ('all' as const), members: layer.map(stopKey) }] : []
  const layerOf = (i: number) => layers.findIndex((l) => l.includes(i))
  const missions = draft.stops.map((_, i) => {
    const play = stopPlay(challenges.map(asChallenge), i)
    return {
      mission_key: stopKey(i),
      ...(play.kind === 'answer' ? { kind: 'answer' } : {}),
      ...(play.choiceGroup ? { choice_group: play.choiceGroup } : {}),
      ...(play.fallbackGroup ? { fallback_group: play.fallbackGroup } : {}),
      rule_groups: needs(layers[layerOf(i) - 1]),
    }
  })
  return { missions, finish: { rule_groups: needs(layers[layers.length - 1]) } }
}

/** A stored challenge or the editor's view of one: the graph and checklist read neither the hash nor the answer. */
type ChallengeLike = Challenge | ChallengeView
const asChallenge = (c: ChallengeLike): Challenge => ('answerHash' in c ? c : { ...c, answerHash: null })
const answerIsSet = (c: ChallengeLike): boolean => ('answerSet' in c ? c.answerSet : c.answerHash !== null)

export type ChecklistItem = { code: string; ok: boolean; message: string; stop?: number }

/**
 * FH-030S: what the publish guard checks the route against. `ownerVenue` is the Space that runs the
 * Trail (a stop with no partner venue sits there), and `closedVenues` are venues closed right now (a
 * partner that withdrew or was ended), so a route that only works through a closed venue is refused.
 */
export type RouteFacts = { ownerVenue: string | null; closedVenues?: ReadonlySet<string> }

/** FH-030S: the draft's graph with each stop placed at its venue, closed where the venue is closed. Pure. */
export function routeGraph(draft: TrailDraft, challenges: readonly ChallengeLike[], facts: RouteFacts): HuntGraph {
  const graph = draftToGraph(draft, challenges)
  return {
    ...graph,
    missions: graph.missions.map((m, i) => {
      const venue = stopVenue(draft, i) ?? facts.ownerVenue
      if (!venue) return m
      return { ...m, placements: [{ placement_key: m.mission_key, venue, ...(facts.closedVenues?.has(venue) ? { closed: true } : {}) }] }
    }),
  }
}

/** FH-030S: the count rule and region blockers in the resident's words. Every other blocker keeps its own. */
function routeMessage(b: Blocker, draft: Pick<TrailDraft, 'regions'>): string {
  const region = (key: string | undefined) => {
    const at = draft.regions?.findIndex((_, i) => regionKey(i) === key) ?? -1
    return at >= 0 ? draft.regions?.[at]?.name.trim() || `Region ${at + 1}` : 'One region'
  }
  switch (b.code) {
    case 'COUNT_INVALID':
    case 'COUNT_IMPOSSIBLE':
      return 'The Passport asks for more stops than players can reach. Stops at the same venue count once, and a closed venue or a region that is off counts for nothing. Lower the number of stops needed.'
    case 'CHAPTER_INFEASIBLE':
    case 'CHAPTER_NO_FREE_FINISH':
      return `${region(b.message.match(/"([^"]+)"/)?.[1])}: players who stay in this region could not finish. Add stops to it, lower the number of stops needed, or turn the region off.`
    case 'CHAPTER_INVALID':
      return 'Each region needs at least one stop, and a stop can be in one region only.'
    case 'VENUE_COUNTS_TWICE':
      return 'Two stops can be proven at the same venue, so one visit could count twice. Pick a different venue for one of them.'
    default:
      return b.message
  }
}

/**
 * The publish checklist. Publishing stays off until every item is ok. `venue` says whether the Trail
 * has a venue Space whose staff can confirm a visit (FH-020X); unknown counts as none, so a stop that
 * staff must confirm never goes live where nobody can confirm it.
 */
export function publishChecklist(draft: TrailDraft, revision: number, opts: { venue?: boolean; challenges?: readonly ChallengeLike[]; route?: RouteFacts } = {}): { ok: boolean; items: ChecklistItem[] } {
  const items: ChecklistItem[] = []
  const challenges = opts.challenges ?? []
  // FH-030S: with route facts, each stop is checked at its venue and a closed venue counts for nothing.
  const graph = validateGraph(opts.route ? routeGraph(draft, challenges, opts.route) : draftToGraph(draft, challenges))
  const blockers: Blocker[] = draft.stops.length >= MIN_STOPS ? graph.blockers : []
  items.push({
    code: 'stops_count',
    ok: draft.stops.length >= MIN_STOPS && draft.stops.length <= MAX_STOPS,
    message: `A trail needs ${MIN_STOPS} to ${MAX_STOPS} stops.`,
  })
  items.push({
    code: 'graph',
    ok: blockers.length === 0,
    message: blockers[0] ? routeMessage(blockers[0], draft) : 'The stops lead to a finish.',
  })
  draft.stops.forEach((s, i) => {
    items.push({ code: 'stop_text', ok: s.place.trim() !== '' && s.clue.trim() !== '', stop: i, message: 'This stop needs a place name and a clue.' })
    items.push({ code: 'stop_placement', ok: s.placementReady, stop: i, message: 'Print or place a code at this stop so people can prove they were here.' })
    if (s.staffConfirmed === true) {
      // FH-020Y: a partner venue named for the stop also has staff who can confirm a visit there.
      items.push({ code: 'stop_staff_venue', ok: opts.venue === true || stopVenue(draft, i) !== null, stop: i, message: 'Staff can confirm visits only where a venue runs the stop. Pick a partner venue for this stop, or turn off staff confirming.' })
    }
  })
  // FH-042S: the challenge blockers come in plain words; the engine's graph check above still runs.
  for (const p of challengeProblems(draft.stops.length, challenges.map((c) => ({ ...asChallenge(c), answerSet: answerIsSet(c) })))) {
    items.push({ code: 'challenge', ok: false, message: p.message, ...(p.stop !== undefined ? { stop: p.stop } : {}) })
  }
  items.push({ code: 'title', ok: draft.title.trim() !== '', message: 'Give the trail a title.' })
  if (draft.benefits?.length) {
    items.push({ code: 'benefits', ok: benefitsReady(draft.benefits), message: 'Each pass benefit needs a name and its own short code.' })
  }
  items.push({ code: 'route_test', ok: draft.routeTestedAtRevision === revision, message: 'Walk it once in preview before you publish.' })
  items.push({ code: 'permission', ok: draft.permissionConfirmed, message: 'Confirm you may place a code at each place.' })
  return { ok: items.every((i) => i.ok), items }
}

/**
 * Preview: what a player would see after earning `credited` stops, evaluated in memory. Writes nothing.
 * Returns keys and states only, like the real evaluator.
 */
export function previewTrail(draft: Pick<TrailDraft, 'stops' | 'finishCount' | 'regions'>, credited: readonly string[], now: Date = new Date(), challenges: readonly ChallengeLike[] = []) {
  return evaluate(
    draftToGraph(draft, challenges),
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
  missions: {
    mission_key: string; title: string; visible_body: string; locked_teaser: string | null; kind: 'visit' | 'answer'; required_assurance: 'signed_node' | 'staff'
    /** FH-042S: present on every row when the Trail has challenges, so one upsert writes one column set. */
    choice_group?: string | null; fallback_group?: string | null; answer_hash?: string | null
  }[]
  /** One prerequisite group per stop after the first, plus the finish group. */
  groups: { key: string; target_mission_key: string | null; target_finish: boolean; logic: 'all' | 'any' | 'count'; min_count?: number; members: string[] }[]
}

export function publishRows(draft: TrailDraft, challenges: readonly Challenge[] = []): PublishRows {
  const graph = draftToGraph(draft, challenges)
  const missions = draft.stops.map((s, i) => {
    const base = {
      mission_key: stopKey(i),
      title: s.place.trim(),
      visible_body: s.clue.trim(),
      locked_teaser: s.hint?.trim() ? s.hint.trim() : null,
      kind: 'visit' as 'visit' | 'answer',
      // FH-020X: a staff-confirmed stop needs staff assurance; every other stop keeps the signed scan.
      required_assurance: s.staffConfirmed === true ? ('staff' as const) : ('signed_node' as const),
    }
    if (challenges.length === 0) return base
    // FH-042S: a Mystery adds its question to the clue, takes the challenge hint (shown after the second
    // wrong try) and carries only the answer's hash. Forks and stand-in sets publish as their groups.
    const play = stopPlay(challenges, i)
    return {
      ...base,
      visible_body: play.question ? `${base.visible_body}\n\nQuestion: ${play.question}` : base.visible_body,
      locked_teaser: play.hint || base.locked_teaser,
      kind: play.kind,
      choice_group: play.choiceGroup,
      fallback_group: play.fallbackGroup,
      answer_hash: play.answerHash,
    }
  })
  const groups: PublishRows['groups'] = []
  for (const m of graph.missions) {
    for (const g of m.rule_groups) {
      groups.push({ key: `${m.mission_key}:needs`, target_mission_key: m.mission_key, target_finish: false, logic: g.logic === 'any' ? 'any' : 'all', members: g.members })
    }
  }
  for (const g of graph.finish.rule_groups) {
    // FH-030S: a Passport's finish is a count group; `min_count` is present only there, so a Trail's rows are unchanged.
    const logic = g.logic === 'count' ? 'count' : g.logic === 'any' ? 'any' : 'all'
    groups.push({ key: 'finish', target_mission_key: null, target_finish: true, logic, ...(logic === 'count' ? { min_count: g.min_count } : {}), members: g.members })
  }
  return { missions, groups }
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
export function canonicalContent(draft: TrailDraft, challenges: readonly Challenge[] = []): string {
  // With no challenges the rows are what they always were, so every earlier Trail keeps its hash.
  const rows = publishRows(draft, challenges)
  const benefits = (draft.benefits ?? []).map((b) => ({ code: b.code, label: b.label.trim() }))
  return JSON.stringify({
    schema: 1,
    title: draft.title.trim(),
    hook: draft.hook.trim(),
    area: draft.area.trim(),
    audience: draft.audience.trim(),
    missions: rows.missions,
    groups: rows.groups,
    // Only when the trail has any, so a trail with none hashes exactly as it did before benefits existed.
    ...(benefits.length > 0 ? { benefits } : {}),
    // Only when a stop opts in, so every Trail published before FH-020V keeps its hash.
    ...(draft.stops.some((stop) => stop.holdForReview === true)
      ? { review_holds: draft.stops.flatMap((stop, i) => (stop.holdForReview === true ? [stopKey(i)] : [])) }
      : {}),
    // FH-030S: a Passport's regions are content (switching one changes who can finish). None, no key.
    ...(draftChapters(draft).length > 0 ? { chapters: draftChapters(draft) } : {}),
    ...finaleContent(draft.finaleEventId),
  })
}

/**
 * The policy a published version freezes. The pass benefits the resident authored are published as
 * `policy.benefits`, which is where a pass binding and a store offer read them (lib/hunts/benefit-codes.ts).
 * A trail with none publishes no `benefits` key, exactly as before.
 */
export function publishedPolicy(prior: Record<string, unknown> | null, draft: TrailDraft): Record<string, unknown> {
  const policy: Record<string, unknown> = { ...(prior ?? {}), trail: draft }
  if (draft.benefits?.length) policy.benefits = draft.benefits.map((b) => ({ code: b.code, label: b.label.trim() }))
  else delete policy.benefits
  // FH-030S: the regions as `policy.chapters`, the key lib/hunts/run-store.ts reads for the player.
  const chapters = draftChapters(draft)
  if (chapters.length > 0) policy.chapters = chapters
  else delete policy.chapters
  applyFinalePolicy(policy, draft.finaleEventId)
  return policy
}
