import { createAdminClient } from '@/lib/supabase/admin'

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
  const { data } = await scopeBySpace(
    db().from('crm_stages').select('id, name, sort_order, kind'),
    spaceId,
  ).order('sort_order')
  return (data as CrmStage[] | null) ?? []
}

// All deals + resolved owner/member people, newest activity first within a stage.
// Optional spaceId scopes to one Space (absent = the global, unscoped admin view).
export async function getDeals(spaceId?: string): Promise<CrmDeal[]> {
  const { data } = await scopeBySpace(db().from('crm_deals').select('*'), spaceId)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
  const deals = (data as Record<string, unknown>[] | null) ?? []
  const people = await resolvePeople(deals.flatMap((d) => [d.owner_id, d.profile_id]).filter(Boolean) as string[])
  return deals.map((d) => hydrateDeal(d, people))
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
}

// A Space's CRM contacts (the per-space people list). Optional spaceId scopes to one Space;
// absent = the global contacts table (unchanged). Newest first. Reads only the columns the
// per-space contacts surface needs.
export async function getContacts(spaceId?: string, limit = 200): Promise<CrmContact[]> {
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
}

// A single contact, scoped to a Space when spaceId is present (so the notes surface can confirm
// the contact belongs to the Space before reading its notes). Absent = global lookup by id.
export async function getContact(id: string, spaceId?: string): Promise<CrmContact | null> {
  const { data } = await scopeBySpace(
    db().from('contacts').select('id, email, display_name, consent_state, created_at').eq('id', id),
    spaceId,
  ).maybeSingle()
  if (!data) return null
  const c = data as Record<string, unknown>
  return {
    id: c.id as string,
    email: (c.email as string) ?? '',
    display_name: (c.display_name as string) ?? null,
    consent_state: (c.consent_state as string) ?? 'unknown',
    created_at: (c.created_at as string) ?? null,
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
}

export function computeMetrics(deals: Pick<CrmDeal, 'status' | 'value'>[], tasksDue: number): PipelineMetrics {
  let openCount = 0
  let openValue = 0
  let wonValue = 0
  let won = 0
  let lost = 0
  for (const d of deals) {
    if (d.status === 'open') {
      openCount++
      openValue += Number(d.value) || 0
    } else if (d.status === 'won') {
      won++
      wonValue += Number(d.value) || 0
    } else if (d.status === 'lost') {
      lost++
    }
  }
  const decided = won + lost
  return { openCount, openValue, wonValue, winRatePct: decided ? Math.round((won / decided) * 100) : null, tasksDue }
}

export function stageTone(kind: StageKind): string {
  return kind === 'won' ? 'success' : kind === 'lost' ? 'danger' : 'open'
}
