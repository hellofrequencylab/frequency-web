import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// CRM pipeline data layer (ADR-102). The crm_* tables aren't in the generated DB
// types yet, so every read/write goes through an untyped client cast (the same
// pattern used across lib/studio + lib/page-editor). Service-role only — callers
// gate on host+ (see app/(main)/admin/crm/actions.ts requireCrm()).
//
// PER-SPACE TENANCY (ENTITY-SPACES-BUILD Phase 2). Every read here takes an OPTIONAL
// `spaceId`. It is purely ADDITIVE and BACKWARD-COMPATIBLE:
//   • ABSENT (undefined)  -> NO space filter is applied, so the GLOBAL /admin/crm
//     operator tool sees EXACTLY the rows it sees today (the whole table). This is the
//     unchanged path; the global admin actions call these with no spaceId.
//   • PRESENT             -> the query filters `space_id = spaceId`, so a Space owner's
//     per-space pipeline sees only their own rows (cross-space isolation).
// The column was backfilled to the root space, so existing data is root-owned and the
// per-space pipeline for the root space still sees it (the global tool ignores space_id).

function db() {
  return createAdminClient()
}

// Apply the OPTIONAL space filter to a query builder. When spaceId is undefined the
// builder is returned untouched (exact current global behavior); when present it adds an
// `.eq('space_id', spaceId)`. Kept as one helper so every read scopes identically and the
// "absent = unchanged" guarantee lives in a single place. Typed loosely because the
// crm_* tables are not in the generated DB types (ADR-246).
function scopeBySpace<Q extends { eq: (col: string, val: string) => Q }>(
  query: Q,
  spaceId?: string,
): Q {
  return spaceId ? query.eq('space_id', spaceId) : query
}

export type StageKind = 'open' | 'won' | 'lost'
export type CrmStage = { id: string; name: string; sort_order: number; kind: StageKind }

export type PersonLite = { id: string; display_name: string; handle: string | null; avatar_url: string | null }

export type CrmDeal = {
  id: string
  title: string
  contact_name: string | null
  contact_id: string | null
  profile_id: string | null
  stage_id: string | null
  value: number
  currency: string
  status: StageKind
  source: string | null
  expected_close_date: string | null
  owner_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  owner: PersonLite | null
  member: PersonLite | null
}

export type CrmActivity = {
  id: string
  deal_id: string | null
  kind: 'note' | 'call' | 'email' | 'meeting' | 'task'
  body: string
  due_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  author: PersonLite | null
}

const PERSON_COLS = 'id, display_name, handle, avatar_url'

export async function getStages(spaceId?: string): Promise<CrmStage[]> {
  // FAIL-SAFE: a read error or a missing space_id column yields [] so the per-space board renders
  // empty rather than throwing (CRM-STRATEGY P3 fail-safe contract).
  try {
    const { data } = await scopeBySpace(
      db().from('crm_stages').select('id, name, sort_order, kind'),
      spaceId,
    ).order('sort_order')
    return (data as CrmStage[] | null) ?? []
  } catch {
    return []
  }
}

// All deals + resolved owner/member people, newest activity first within a stage.
// Optional spaceId scopes to one Space (absent = the global, unscoped admin view).
export async function getDeals(spaceId?: string): Promise<CrmDeal[]> {
  // FAIL-SAFE: a read error / missing column yields [] (CRM-STRATEGY P3 fail-safe contract).
  try {
    const { data } = await scopeBySpace(db().from('crm_deals').select('*'), spaceId)
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })
    const deals = (data as Record<string, unknown>[] | null) ?? []
    const people = await resolvePeople(deals.flatMap((d) => [d.owner_id, d.profile_id]).filter(Boolean) as string[])
    return deals.map((d) => hydrateDeal(d, people))
  } catch {
    return []
  }
}

// A single deal. Optional spaceId pins the read to one Space (the per-space surface passes
// it so a caller can never open a deal belonging to another Space by id); absent = global.
export async function getDeal(id: string, spaceId?: string): Promise<CrmDeal | null> {
  const { data } = await scopeBySpace(db().from('crm_deals').select('*').eq('id', id), spaceId).maybeSingle()
  if (!data) return null
  const d = data as Record<string, unknown>
  const people = await resolvePeople([d.owner_id, d.profile_id].filter(Boolean) as string[])
  return hydrateDeal(d, people)
}

// Activities on a deal. Optional spaceId scopes the read to one Space (a defense-in-depth
// filter on top of deal_id, so a cross-space deal id leaks nothing); absent = global.
export async function getActivities(dealId: string, spaceId?: string): Promise<CrmActivity[]> {
  const { data } = await scopeBySpace(
    db().from('crm_activities').select('*').eq('deal_id', dealId),
    spaceId,
  ).order('created_at', { ascending: false })
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const people = await resolvePeople(rows.map((r) => r.created_by).filter(Boolean) as string[])
  return rows.map((r) => ({
    id: r.id as string,
    deal_id: (r.deal_id as string) ?? null,
    kind: (r.kind as CrmActivity['kind']) ?? 'note',
    body: (r.body as string) ?? '',
    due_at: (r.due_at as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
    author: r.created_by ? people.get(r.created_by as string) ?? null : null,
  }))
}

// Count of open tasks (a due-dated activity not yet completed). Optional spaceId scopes the
// count to one Space (absent = the global admin count, unchanged).
export async function countOpenTasks(spaceId?: string): Promise<number> {
  const { count } = await scopeBySpace(
    db().from('crm_activities').select('id', { count: 'exact', head: true }).eq('kind', 'task'),
    spaceId,
  ).is('completed_at', null)
  return count ?? 0
}

export type CrmContact = {
  id: string
  email: string
  display_name: string | null
  consent_state: string
  created_at: string | null
  /** Imported custom fields, keyed by their stable registry key -> value (from `contacts.meta.custom`).
   *  Only populated by the single-contact `getContact` read; the list read leaves it undefined. */
  custom?: Record<string, string>
}

// A Space's CRM contacts (the per-space people list). Optional spaceId scopes to one Space;
// absent = the global contacts table (unchanged). Newest first. Reads only the columns the
// per-space contacts surface needs.
export async function getContacts(spaceId?: string, limit = 200): Promise<CrmContact[]> {
  // FAIL-SAFE: a read error / missing column yields [] (CRM-STRATEGY P3 fail-safe contract).
  try {
    const { data } = await scopeBySpace(
      db().from('contacts').select('id, email, display_name, consent_state, created_at'),
      spaceId,
    )
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Record<string, unknown>[] | null) ?? []
    return rows.map((c) => ({
      id: c.id as string,
      email: (c.email as string) ?? '',
      display_name: (c.display_name as string) ?? null,
      consent_state: (c.consent_state as string) ?? 'unknown',
      created_at: (c.created_at as string) ?? null,
    }))
  } catch {
    return []
  }
}

// A single contact, scoped to a Space when spaceId is present (so the notes surface can confirm
// the contact belongs to the Space before reading its notes). Absent = global lookup by id.
export async function getContact(id: string, spaceId?: string): Promise<CrmContact | null> {
  const { data } = await scopeBySpace(
    db().from('contacts').select('id, email, display_name, consent_state, created_at, meta').eq('id', id),
    spaceId,
  ).maybeSingle()
  if (!data) return null
  const c = data as Record<string, unknown>
  // Imported custom fields live in `meta.custom`, keyed by their stable registry key. Read them onto the
  // contact so the detail surface can show them (they were write-only dead data before).
  const meta = (c.meta as { custom?: unknown } | null) ?? {}
  const custom: Record<string, string> = {}
  if (meta.custom && typeof meta.custom === 'object') {
    for (const [k, v] of Object.entries(meta.custom as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) custom[k] = v
    }
  }
  return {
    id: c.id as string,
    email: (c.email as string) ?? '',
    display_name: (c.display_name as string) ?? null,
    consent_state: (c.consent_state as string) ?? 'unknown',
    created_at: (c.created_at as string) ?? null,
    custom: Object.keys(custom).length ? custom : undefined,
  }
}

async function resolvePeople(ids: string[]): Promise<Map<string, PersonLite>> {
  const unique = [...new Set(ids)]
  const map = new Map<string, PersonLite>()
  if (unique.length === 0) return map
  const { data } = await db().from('profiles').select(PERSON_COLS).in('id', unique)
  for (const p of (data as PersonLite[] | null) ?? []) map.set(p.id, p)
  return map
}

function hydrateDeal(d: Record<string, unknown>, people: Map<string, PersonLite>): CrmDeal {
  return {
    id: d.id as string,
    title: (d.title as string) ?? 'Untitled',
    contact_name: (d.contact_name as string) ?? null,
    contact_id: (d.contact_id as string) ?? null,
    profile_id: (d.profile_id as string) ?? null,
    stage_id: (d.stage_id as string) ?? null,
    value: Number(d.value) || 0,
    currency: (d.currency as string) ?? 'USD',
    status: (d.status as StageKind) ?? 'open',
    source: (d.source as string) ?? null,
    expected_close_date: (d.expected_close_date as string) ?? null,
    owner_id: (d.owner_id as string) ?? null,
    created_by: (d.created_by as string) ?? null,
    created_at: d.created_at as string,
    updated_at: d.updated_at as string,
    closed_at: (d.closed_at as string) ?? null,
    owner: d.owner_id ? people.get(d.owner_id as string) ?? null : null,
    member: d.profile_id ? people.get(d.profile_id as string) ?? null : null,
  }
}

// ── Per-space stage seeding (CRM-STRATEGY §7, P3 · unified with Space Modes by ADR-517 Phase F E1) ─────
// A Space gets a starting pipeline seeded into crm_stages, scoped by space_id, the first time its CRM is
// opened. The seed comes from the resolved MODE PRESET's pipeline (lib/crm/stage-templates.ts
// seedStagesForSpace -> lib/spaces/modes.ts), the SAME set the Mode settings "Suggested pipeline" preview
// shows, so the preview and the seed can never disagree. These are service-role writes (the crm_* tables
// are RLS-enabled with no policies; the caller gates on the Space owner / admin before calling), matching
// the lib/crm/pipeline.ts read posture.

import type { SpaceType } from '@/lib/spaces/types'
import { seedStagesForSpace, platformPipelineStages, isPipelineLane, type PipelineLane } from './stage-templates'

/** Idempotently seed the Mode-preset starting stages for a Space, scoped by space_id. Pass the Space's
 *  `type` and (optionally) its `mode_variant` so the seed matches the exact Mode preview the operator
 *  saw; an absent variant resolves to the type's default Focus. A NO-OP when the Space already has any
 *  stage (so an owner who has customized their pipeline is never overwritten, and a second CRM open never
 *  re-seeds). FAIL-SAFE: returns false and writes nothing on any error or missing column, so opening the
 *  CRM never throws. Returns true when it seeded a fresh set. */
export async function ensureSpaceStages(
  spaceId: string,
  type: SpaceType | null | undefined,
  variant?: string | null,
): Promise<boolean> {
  if (!spaceId) return false
  try {
    // Already seeded (or customized) -> leave it alone. One head count, scoped to this Space.
    const { count } = await db()
      .from('crm_stages')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
    if ((count ?? 0) > 0) return false

    const rows = seedStagesForSpace(type, variant).map((stage, i) => ({
      space_id: spaceId,
      name: stage.name,
      kind: stage.kind,
      sort_order: i,
    }))
    if (rows.length === 0) return false
    const { error } = await db().from('crm_stages').insert(rows)
    return !error
  } catch {
    return false
  }
}

/** Idempotently seed the PLATFORM pipeline (lib/crm/stage-templates.ts platformPipelineStages) for the
 *  platform's own Space, scoped by space_id. This is the global /admin/crm/pipeline board's funnel: the
 *  upsell + donation lanes share these columns and are told apart by `crm_deals.source`. A NO-OP when the
 *  Space already has any stage, so a customized platform pipeline is never overwritten and a second board
 *  open never re-seeds (the SAME never-clobber contract as ensureSpaceStages; existing installs keep their
 *  columns until an operator resets). FAIL-SAFE: returns false and writes nothing on any error / missing
 *  column, so opening the board never throws. Returns true when it seeded a fresh set. */
export async function ensurePlatformPipeline(spaceId: string): Promise<boolean> {
  if (!spaceId) return false
  try {
    const { count } = await db()
      .from('crm_stages')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
    if ((count ?? 0) > 0) return false

    const rows = platformPipelineStages().map((stage, i) => ({
      space_id: spaceId,
      name: stage.name,
      kind: stage.kind,
      sort_order: i,
    }))
    if (rows.length === 0) return false
    const { error } = await db().from('crm_stages').insert(rows)
    return !error
  } catch {
    return false
  }
}

/** The id + kind of a Space's FIRST OPEN stage (the lowest sort_order with kind='open'), or null. A
 *  graduated contact's deal lands here (CRM-STRATEGY §6). FAIL-SAFE: null on any error. */
export async function getFirstOpenStage(spaceId: string): Promise<{ id: string; kind: StageKind } | null> {
  if (!spaceId) return null
  try {
    const stages = await getStages(spaceId)
    const open = stages.find((s) => s.kind === 'open') ?? stages[0]
    return open ? { id: open.id, kind: open.kind } : null
  } catch {
    return null
  }
}

// ── Per-space tasks (CRM-STRATEGY §6/§7; crm_activities kind='task') ───────────────────────────────
// A task is a crm_activities row with kind='task': a title (the `body`), an optional due date (due_at),
// and a completion stamp (completed_at). It can hang off a deal (deal_id) and/or a contact (contact_id),
// always scoped by space_id. The board's Tasks panel reads these and labels each one with the deal /
// contact it points at. WRITES live in lib/crm/space-tasks.ts (owner-gated, space-scoped); this file
// only READS (fail-safe, [] on error), matching the rest of the per-space pipeline read layer.

export type SpaceTask = {
  id: string
  title: string
  due_at: string | null
  completed_at: string | null
  deal_id: string | null
  contact_id: string | null
  created_at: string
  /** A short label for what the task points at (deal title or contact name), resolved at read time. */
  linkLabel: string | null
}

/** PURE: split a Space's tasks into OPEN (due-soon first, then undated, then by creation) and DONE
 *  (most recently completed first). Deterministic with a stable id tiebreak so equal timestamps keep a
 *  fixed order. No IO, so it is unit-testable on its own. */
export function partitionTasks(tasks: SpaceTask[]): { open: SpaceTask[]; done: SpaceTask[] } {
  const open: SpaceTask[] = []
  const done: SpaceTask[] = []
  for (const t of tasks) (t.completed_at ? done : open).push(t)

  open.sort((a, b) => {
    // A dated task always sorts ahead of an undated one; among dated tasks, the soonest due is first.
    const da = a.due_at ? Date.parse(a.due_at) : null
    const dbv = b.due_at ? Date.parse(b.due_at) : null
    if (da !== null && dbv !== null && da !== dbv) return da - dbv
    if (da !== null && dbv === null) return -1
    if (da === null && dbv !== null) return 1
    const ca = Date.parse(a.created_at) || 0
    const cb = Date.parse(b.created_at) || 0
    if (ca !== cb) return cb - ca
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  done.sort((a, b) => {
    const ca = a.completed_at ? Date.parse(a.completed_at) : 0
    const cb = b.completed_at ? Date.parse(b.completed_at) : 0
    if (ca !== cb) return cb - ca
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return { open, done }
}

/** Every task (kind='task') for a Space, scoped by space_id, each labeled with the deal / contact it
 *  points at. FAIL-SAFE: [] on any read error / missing column (CRM-STRATEGY P3 fail-safe contract). */
export async function getSpaceTasks(spaceId: string, limit = 200): Promise<SpaceTask[]> {
  if (!spaceId) return []
  try {
    const { data } = await scopeBySpace(
      db()
        .from('crm_activities')
        .select('id, body, due_at, completed_at, deal_id, contact_id, created_at')
        .eq('kind', 'task'),
      spaceId,
    )
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Record<string, unknown>[] | null) ?? []
    if (rows.length === 0) return []

    // Resolve a short link label for each task: the deal title, else the contact's name / email.
    const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])]
    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[])]
    const [dealLabels, contactLabels] = await Promise.all([
      resolveDealLabels(dealIds, spaceId),
      resolveContactLabels(contactIds, spaceId),
    ])

    return rows.map((r) => {
      const dealId = (r.deal_id as string) ?? null
      const contactId = (r.contact_id as string) ?? null
      const linkLabel =
        (dealId ? dealLabels.get(dealId) : null) ?? (contactId ? contactLabels.get(contactId) : null) ?? null
      return {
        id: r.id as string,
        title: (r.body as string) ?? '',
        due_at: (r.due_at as string) ?? null,
        completed_at: (r.completed_at as string) ?? null,
        deal_id: dealId,
        contact_id: contactId,
        created_at: r.created_at as string,
        linkLabel,
      }
    })
  } catch {
    return []
  }
}

/** Map a set of deal ids (within this Space) to their titles. Fail-safe to an empty map. The space
 *  filter is applied BEFORE the id `in`, so the read is `.eq('space_id', …).in('id', …)`. */
async function resolveDealLabels(ids: string[], spaceId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  try {
    const { data } = await scopeBySpace(db().from('crm_deals').select('id, title'), spaceId).in('id', ids)
    for (const d of (data as Record<string, unknown>[] | null) ?? []) {
      map.set(d.id as string, ((d.title as string) ?? '').trim() || 'Untitled deal')
    }
  } catch {
    /* fall through to the partial / empty map */
  }
  return map
}

/** Map a set of contact ids (within this Space) to a display label (name, else email). Fail-safe. The
 *  space filter is applied BEFORE the id `in`, so the read is `.eq('space_id', …).in('id', …)`. */
async function resolveContactLabels(ids: string[], spaceId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  try {
    const { data } = await scopeBySpace(
      db().from('contacts').select('id, display_name, email'),
      spaceId,
    ).in('id', ids)
    for (const c of (data as Record<string, unknown>[] | null) ?? []) {
      const label = ((c.display_name as string) ?? '').trim() || ((c.email as string) ?? '').trim()
      if (label) map.set(c.id as string, label)
    }
  } catch {
    /* fall through to the partial / empty map */
  }
  return map
}

// ── Presentation helpers ──────────────────────────────────────────────────────

export function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

export type PipelineMetrics = {
  openCount: number
  openValue: number
  wonValue: number
  winRatePct: number | null
  tasksDue: number
  // ── Lane-aware reads for the platform Pipeline board (upsell + donation). Additive: existing
  // consumers (growth widget, per-space snapshot) read only the fields above. ─────────────────────
  /** Open deals tagged to the Business-upsell lane (source='upsell_business'). */
  businessOpen: number
  /** Open deals tagged to the Donations lane (source='donation'). */
  donationOpen: number
  /** Upsell deals WON with closed_at in the current month (members upgraded to Business this month). */
  upgradesThisMonth: number
  /** Donation deals WON all-time (members giving on a rhythm). */
  recurringDonors: number
}

/** A deal, plus the two fields the platform lanes read: its `source` (the lane tag) and `closed_at`
 *  (for "this month" reads). CrmDeal already carries both, so callers pass CrmDeal[] unchanged. */
type MetricDeal = Pick<CrmDeal, 'status' | 'value' | 'source' | 'closed_at'>

function sameMonth(iso: string | null, now: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  // Key the month to the community HOME zone, as the rest of the platform does (index-data.ts,
  // event-reminders). A deal won late on the last home-zone evening of a month must land in THAT
  // month, not the next UTC one. dayInZone -> 'YYYY-MM-DD'; compare the 'YYYY-MM' prefix.
  return dayInZone(d, HOME_TZ).slice(0, 7) === dayInZone(now, HOME_TZ).slice(0, 7)
}

export function computeMetrics(deals: MetricDeal[], tasksDue: number, now: Date = new Date()): PipelineMetrics {
  let openCount = 0
  let openValue = 0
  let wonValue = 0
  let won = 0
  let lost = 0
  let businessOpen = 0
  let donationOpen = 0
  let upgradesThisMonth = 0
  let recurringDonors = 0
  for (const d of deals) {
    const lane: PipelineLane | null = isPipelineLane(d.source) ? d.source : null
    if (d.status === 'open') {
      openCount++
      openValue += Number(d.value) || 0
      if (lane === 'upsell_business') businessOpen++
      else if (lane === 'donation') donationOpen++
    } else if (d.status === 'won') {
      won++
      wonValue += Number(d.value) || 0
      if (lane === 'upsell_business' && sameMonth(d.closed_at, now)) upgradesThisMonth++
      else if (lane === 'donation') recurringDonors++
    } else if (d.status === 'lost') {
      lost++
    }
  }
  const decided = won + lost
  return {
    openCount,
    openValue,
    wonValue,
    winRatePct: decided ? Math.round((won / decided) * 100) : null,
    tasksDue,
    businessOpen,
    donationOpen,
    upgradesThisMonth,
    recurringDonors,
  }
}
