/**
 * Seasonal editions and legacy imports (FH-044). Pure: no database, no Next, no network.
 * The IO half is lib/hunts/edition-store.ts.
 *
 * An edition is a published hunt_versions row (ADR-1940). Three guarantees live here and in the
 * migration beside it (supabase/migrations/20270346082000_hunt_teams_editions.sql):
 *
 * - Existing runs keep their rules. A run is pinned to the edition it started on (a database trigger
 *   refuses to move it), a published edition is frozen, and `runStanding` says what a pinned run may
 *   still do. A run is never carried onto new rules.
 * - Printed codes resolve as intended. A sign names a place, not a stop number, and stop keys follow
 *   position (stop-1, stop-2, ...), so a reordered Trail would silently repoint every sign.
 *   `buildCrosswalk` maps each outgoing stop to the stop at the same place in the new edition, or to
 *   nothing when the place was dropped, and `carryBindings` moves each sign with its place. A sign
 *   whose place is gone is retired: it opens the Trail and credits nothing.
 * - Imports carry no real credits. `importRegularsHunt` and `importQrCampaign` read a legacy hunt's
 *   shape (title, places, window) into an unpublished TrailDraft. Their inputs have no field for a
 *   stamp, a completion, a scan or a reward, so there is nothing to copy; the legacy rows, routes and
 *   printed links stay exactly as they are (docs/hunts/DECISIONS-D1.md).
 */
import { MAX_STOPS, stopKey, type Stop, type TrailDraft } from './draft'

// ── Editions ─────────────────────────────────────────────────────────────────────────────────────

/** What an edition records beside its frozen trail (hunt_versions.policy.edition). */
export type EditionNote = {
  label: string
  /** The edition this one replaced, or null for the first. */
  previousVersionId: string | null
  /** Outgoing stop key to the stop at the same place in this edition, or null when the place was dropped. */
  crosswalk: Record<string, string | null>
}

const STOP_KEY = /^stop-\d{1,3}$/

/** Read an edition note off stored jsonb. Total: anything else is null. */
export function parseEditionNote(input: unknown): EditionNote | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (typeof o.label !== 'string') return null
  const crosswalk: Record<string, string | null> = {}
  if (o.crosswalk && typeof o.crosswalk === 'object') {
    for (const [from, to] of Object.entries(o.crosswalk as Record<string, unknown>)) {
      if (STOP_KEY.test(from) && (to === null || (typeof to === 'string' && STOP_KEY.test(to)))) crosswalk[from] = to
    }
  }
  return { label: o.label.slice(0, 80), previousVersionId: typeof o.previousVersionId === 'string' ? o.previousVersionId : null, crosswalk }
}

const placeName = (s: Pick<Stop, 'place'>): string => s.place.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Where each outgoing stop went. Stops are matched by place name, in order, each new stop taken once,
 * so two stops at places with the same name keep their order. A place that is not in the new edition
 * maps to null: its sign is retired rather than pointed at whichever stop took its number.
 */
export function buildCrosswalk(outgoing: readonly Pick<Stop, 'place'>[], incoming: readonly Pick<Stop, 'place'>[]): Record<string, string | null> {
  const taken = new Set<number>()
  const crosswalk: Record<string, string | null> = {}
  outgoing.forEach((stop, i) => {
    const name = placeName(stop)
    const match = name === '' ? -1 : incoming.findIndex((s, j) => !taken.has(j) && placeName(s) === name)
    if (match >= 0) taken.add(match)
    crosswalk[stopKey(i)] = match >= 0 ? stopKey(match) : null
  })
  return crosswalk
}

export type Binding = { missionKey: string; placementId: string; venueSpaceId: string | null; evidencePolicy: Record<string, unknown> }

/**
 * The bindings the new edition starts with: every sign follows its place. `retired` lists the signs
 * whose place was dropped (or was never in the crosswalk): they get no binding, so they credit nothing.
 */
export function carryBindings(bindings: readonly Binding[], crosswalk: Record<string, string | null>): { carried: Binding[]; retired: string[] } {
  const carried: Binding[] = []
  const retired = new Set<string>()
  for (const b of bindings) {
    const to = crosswalk[b.missionKey]
    if (typeof to === 'string') carried.push({ ...b, missionKey: to })
    else retired.add(b.placementId)
  }
  for (const b of carried) retired.delete(b.placementId)
  return { carried, retired: [...retired].sort() }
}

/**
 * What a run may do once editions have moved on. A run on the current edition plays. A run on an
 * earlier edition is a record: it keeps the rules and credits of the edition it started on, takes no
 * new credit once its grace is over (the claim command answers version_superseded, see
 * `editionGraceEndsAt`) and is never moved to the new rules.
 */
export function runStanding(run: { versionId: string; state: string }, hunt: { currentVersionId: string | null }): 'playing' | 'record' {
  return run.versionId === hunt.currentVersionId && run.state === 'active' ? 'playing' : 'record'
}

/**
 * The grace a run in flight gets when its edition is replaced (FH-044S, owner ruling 2026-11-16: "7-day
 * grace to finish"). The same number is in the claim command (hunt_claim_apply,
 * 20270346250000_hunt_edition_grace.sql); this copy only finds the run, the database decides the credit.
 */
export const EDITION_GRACE_DAYS = 7

type EditionRow = { id: string; version_no: number; status: string; published_at: string | null }

/**
 * When a replaced edition stops taking credit, in epoch ms, or null when it takes none: the first later
 * edition's publish time plus the grace. Null for an edition that is not superseded, or when no later
 * edition carries a publish time. A second release inside the week does not restart the clock.
 */
export function editionGraceEndsAt(versionId: string, versions: readonly EditionRow[]): number | null {
  const own = versions.find((v) => v.id === versionId)
  if (!own || own.status !== 'superseded') return null
  const later = versions
    .filter((v) => v.version_no > own.version_no && typeof v.published_at === 'string')
    .map((v) => Date.parse(v.published_at as string))
    .filter((t) => Number.isFinite(t))
  if (later.length === 0) return null
  return Math.min(...later) + EDITION_GRACE_DAYS * 24 * 3600 * 1000
}

// ── Imports from the two legacy formats ──────────────────────────────────────────────────────────

/** Where a draft came from (hunt_versions.policy.import). Only an id and a time: no member data. */
type ImportNote = { source: 'regulars' | 'qr_campaign'; sourceId: string; importedAt: string }

/** Read an import note off stored jsonb. Total: anything else is null. */
export function parseImportNote(input: unknown): ImportNote | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if ((o.source !== 'regulars' && o.source !== 'qr_campaign') || typeof o.sourceId !== 'string' || typeof o.importedAt !== 'string') return null
  return { source: o.source, sourceId: o.sourceId, importedAt: o.importedAt }
}

type Imported = {
  draft: TrailDraft
  note: ImportNote
  /** Plain lines for the author: what was left behind and what they still have to write. */
  notices: string[]
}

/**
 * The shape of a Regulars hunt (lib/loyalty/hunts.ts LoyaltyHunt): a title, a description and the
 * Spaces that are its stops. There is deliberately no stamp, completion or reward field.
 */
type RegularsSource = {
  id: string
  title: string
  description: string | null
  hostSpaceName: string
  stops: readonly { spaceName: string; status: 'invited' | 'accepted' | 'declined' }[]
}

/** The shape of a QR campaign (season_challenges plus its challenge_qr_codes): a name, a target and the code titles. */
type QrCampaignSource = {
  id: string
  name: string
  description: string | null
  /** How many codes a member had to scan. */
  target: number
  codes: readonly { title: string }[]
}

function importedDraft(input: { title: string; hook: string; area: string; places: string[] }): { draft: TrailDraft; dropped: number } {
  const places = input.places.map((p) => p.trim()).filter((p) => p !== '')
  const stops: Stop[] = places.slice(0, MAX_STOPS).map((place) => ({
    place: place.slice(0, 120),
    // A legacy hunt has no clue text. The author writes each one; the publish checklist waits for it.
    clue: '',
    hint: '',
    // No printed code is carried: every stop needs a new signed placement before it can publish.
    placementReady: false,
  }))
  return {
    draft: {
      title: input.title.trim().slice(0, 120),
      hook: input.hook.trim().slice(0, 200),
      area: input.area.trim().slice(0, 200),
      audience: '',
      stops,
      routeTestedAtRevision: null,
      permissionConfirmed: false,
    },
    dropped: Math.max(places.length - MAX_STOPS, 0),
  }
}

const BASE_NOTICES = [
  'This is a new draft. Nobody has progress on it: stamps, scans, finishes and rewards from the old hunt stay with the old hunt.',
  'The old hunt, its page and its printed codes keep working as they are.',
  'Write a clue for each stop and place a new code there before you publish.',
]

const dropNotice = (dropped: number): string[] =>
  dropped > 0 ? [`A trail holds up to ${MAX_STOPS} stops, so the last ${dropped} ${dropped === 1 ? 'place was' : 'places were'} left out.`] : []

/** A Regulars hunt as an unpublished Trail draft. Only Spaces that accepted become stops. */
export function importRegularsHunt(source: RegularsSource, importedAt: string): Imported {
  const { draft, dropped } = importedDraft({
    title: source.title,
    hook: source.description ?? '',
    area: source.hostSpaceName,
    places: source.stops.filter((s) => s.status === 'accepted').map((s) => s.spaceName),
  })
  return { draft, note: { source: 'regulars', sourceId: source.id, importedAt }, notices: [...BASE_NOTICES, ...dropNotice(dropped)] }
}

/** A QR campaign as an unpublished Trail draft. Each code in the campaign's set becomes a stop, named by the code's title. */
export function importQrCampaign(source: QrCampaignSource, importedAt: string): Imported {
  const { draft, dropped } = importedDraft({
    title: source.name,
    hook: source.description ?? '',
    area: '',
    places: source.codes.map((c) => c.title),
  })
  const anyOf = source.target < source.codes.length
    ? [`The campaign asked for any ${source.target} of ${source.codes.length} codes. The draft is a trail in order: every stop counts until you change its shape.`]
    : []
  return { draft, note: { source: 'qr_campaign', sourceId: source.id, importedAt }, notices: [...BASE_NOTICES, ...anyOf, ...dropNotice(dropped)] }
}

// ── Old grants, read only ────────────────────────────────────────────────────────────────────────

/** A reward a member earned before the current edition. Read where it was written; never copied. */
export type OldGrant = {
  source: 'edition' | 'regulars' | 'qr_campaign'
  title: string
  earnedAt: string
  state: 'held' | 'used'
  /** The edition a Hunt reward was earned on. Null for a legacy grant. */
  editionNo: number | null
}

/** Newest first, so a member reads their latest reward at the top whatever its source. */
export function sortOldGrants(grants: readonly OldGrant[]): OldGrant[] {
  return [...grants].sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
}
