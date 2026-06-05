// The unified "person" — one human gathered from the three identity records that
// describe them, joined by lowercased email (ADR-127, docs/NETWORK-CRM.md):
//   • contacts         — the CRM hub (lead → member)              [the anchor]
//   • profiles         — the member, if they have a login          [0..1]
//   • network_contacts — stewards' private captures (card scans)   [0..n]
// plus their behavioral trail — qr_scans + engagement_events (members) and the CRM
// pipeline (crm_deals / crm_activities). Powers the CRM "User Stats" page so an
// operator sees ONE grouped record and the path the person took through the system.
//
// Server-only: service-role (the crm/network tables aren't in the generated types),
// gated upstream by the /marketing layout (community admin/janitor or Studio staff).
// Grouping is by email at READ time, so it works even before the stitch migration
// backfills the FK links.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db() {
  return createAdminClient() as unknown as SupabaseClient
}

type Acquisition = { channel?: string; source?: string; campaign?: string; code?: string } | null

export type ContactCore = {
  id: string
  email: string
  displayName: string | null
  consentState: string
  engagementScore: number
  profileId: string | null
  source: string | null
  acquisition: Acquisition
  firstSeenAt: string | null
  lastSeenAt: string | null
  createdAt: string | null
}

export type MemberRef = {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  city: string | null
  communityRole: string
  acquisition: Acquisition
  referred: boolean
  createdAt: string | null
}

export type Capture = {
  id: string
  ownerId: string
  ownerName: string | null
  source: string
  visibility: string
  status: string
  displayName: string | null
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  city: string | null
  invitedAt: string | null
  createdAt: string | null
  tags: string[]
  notes: { id: string; body: string; kind: string; createdAt: string | null }[]
}

export type ScanEvent = { id: string; codeTitle: string | null; scannedAt: string }
export type LedgerEvent = { id: string; source: string; eventType: string; createdAt: string }
export type ContactActivity = { id: string; kind: string; body: string; createdAt: string }
export type DealRef = { id: string; title: string; status: string; value: number; currency: string }

export type Person = {
  contact: ContactCore
  member: MemberRef | null
  captures: Capture[]
  scans: ScanEvent[]
  events: LedgerEvent[]
  activities: ContactActivity[]
  deals: DealRef[]
}

function asAcquisition(meta: unknown): Acquisition {
  const m = meta as Record<string, unknown> | null
  const a = m?.acquisition as Record<string, unknown> | undefined
  if (!a) return null
  return {
    channel: a.channel as string | undefined,
    source: a.source as string | undefined,
    campaign: a.campaign as string | undefined,
    code: a.code as string | undefined,
  }
}

function mapContactCore(c: Record<string, unknown>): ContactCore {
  return {
    id: String(c.id),
    email: String(c.email),
    displayName: (c.display_name as string) ?? null,
    consentState: (c.consent_state as string) ?? 'unknown',
    engagementScore: Number(c.engagement_score ?? 0),
    profileId: (c.profile_id as string) ?? null,
    source: (c.source as string) ?? null,
    acquisition: asAcquisition(c.meta),
    firstSeenAt: (c.first_seen_at as string) ?? null,
    lastSeenAt: (c.last_seen_at as string) ?? null,
    createdAt: (c.created_at as string) ?? null,
  }
}

const CONTACT_COLS =
  'id, email, display_name, consent_state, engagement_score, profile_id, source, meta, first_seen_at, last_seen_at, created_at'

export async function getContactCore(id: string): Promise<ContactCore | null> {
  const { data } = await db().from('contacts').select(CONTACT_COLS).eq('id', id).maybeSingle()
  return data ? mapContactCore(data as Record<string, unknown>) : null
}

/** Search the CRM by email or name. Powers the contacts list search box. */
export async function searchContacts(q: string, limit = 100): Promise<ContactCore[]> {
  const needle = q.replace(/[(),%]/g, ' ').trim()
  let query = db().from('contacts').select(CONTACT_COLS).order('created_at', { ascending: false }).limit(limit)
  if (needle) query = query.or(`email.ilike.%${needle}%,display_name.ilike.%${needle}%`)
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(mapContactCore)
}

/** Gather everything that describes the person behind a CRM contact. */
export async function resolvePerson(contactId: string): Promise<Person | null> {
  const contact = await getContactCore(contactId)
  if (!contact) return null
  const email = contact.email.toLowerCase()

  const [member, captures, behavior, crm] = await Promise.all([
    contact.profileId ? loadMember(contact.profileId) : Promise.resolve(null),
    loadCaptures(email),
    contact.profileId ? loadBehavior(contact.profileId) : Promise.resolve({ scans: [], events: [] }),
    loadCrm(contactId, contact.profileId),
  ])

  return { contact, member, captures, scans: behavior.scans, events: behavior.events, ...crm }
}

async function loadMember(profileId: string): Promise<MemberRef | null> {
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle, avatar_url, city, community_role, acquisition, referred_by_profile_id, created_at')
    .eq('id', profileId)
    .maybeSingle()
  if (!data) return null
  const p = data as Record<string, unknown>
  return {
    id: String(p.id),
    displayName: (p.display_name as string) ?? '',
    handle: (p.handle as string) ?? '',
    avatarUrl: (p.avatar_url as string) ?? null,
    city: (p.city as string) ?? null,
    communityRole: (p.community_role as string) ?? 'member',
    acquisition: asAcquisition({ acquisition: p.acquisition }),
    referred: !!p.referred_by_profile_id,
    createdAt: (p.created_at as string) ?? null,
  }
}

async function loadCaptures(email: string): Promise<Capture[]> {
  const { data } = await db()
    .from('network_contacts')
    .select(
      'id, owner_id, source, visibility, status, display_name, email, phone, title, company, city, invited_at, created_at',
    )
    .ilike('email', email)
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => String(r.id))
  const ownerIds = [...new Set(rows.map((r) => r.owner_id).filter(Boolean) as string[])]
  const [ownerMap, tagMap, noteMap] = await Promise.all([
    resolveNames(ownerIds),
    loadTags(ids),
    loadNotes(ids),
  ])

  return rows.map((r) => {
    const id = String(r.id)
    return {
      id,
      ownerId: String(r.owner_id),
      ownerName: ownerMap.get(String(r.owner_id)) ?? null,
      source: (r.source as string) ?? 'manual',
      visibility: (r.visibility as string) ?? 'private',
      status: (r.status as string) ?? 'new',
      displayName: (r.display_name as string) ?? null,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      title: (r.title as string) ?? null,
      company: (r.company as string) ?? null,
      city: (r.city as string) ?? null,
      invitedAt: (r.invited_at as string) ?? null,
      createdAt: (r.created_at as string) ?? null,
      tags: tagMap.get(id) ?? [],
      notes: noteMap.get(id) ?? [],
    }
  })
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const { data } = await db().from('profiles').select('id, display_name').in('id', ids)
  for (const p of (data ?? []) as Record<string, unknown>[]) map.set(String(p.id), (p.display_name as string) ?? '')
  return map
}

async function loadTags(captureIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const { data } = await db().from('network_contact_tags').select('contact_id, tag').in('contact_id', captureIds)
  for (const t of (data ?? []) as Record<string, unknown>[]) {
    const cid = String(t.contact_id)
    map.set(cid, [...(map.get(cid) ?? []), String(t.tag)])
  }
  return map
}

async function loadNotes(captureIds: string[]): Promise<Map<string, Capture['notes']>> {
  const map = new Map<string, Capture['notes']>()
  const { data } = await db()
    .from('network_contact_notes')
    .select('id, contact_id, body, kind, created_at')
    .in('contact_id', captureIds)
    .order('created_at', { ascending: false })
  for (const n of (data ?? []) as Record<string, unknown>[]) {
    const cid = String(n.contact_id)
    const note = { id: String(n.id), body: String(n.body), kind: (n.kind as string) ?? 'note', createdAt: (n.created_at as string) ?? null }
    map.set(cid, [...(map.get(cid) ?? []), note])
  }
  return map
}

async function loadBehavior(profileId: string): Promise<{ scans: ScanEvent[]; events: LedgerEvent[] }> {
  const [scansRes, eventsRes] = await Promise.all([
    db()
      .from('qr_scans')
      .select('id, scanned_at, qr_codes!qr_code_id ( title )')
      .eq('profile_id', profileId)
      .order('scanned_at', { ascending: false })
      .limit(50),
    db()
      .from('engagement_events')
      .select('id, source, event_type, created_at')
      .eq('actor_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const scans: ScanEvent[] = ((scansRes.data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: String(s.id),
    codeTitle: ((s.qr_codes as { title?: string } | null)?.title as string) ?? null,
    scannedAt: String(s.scanned_at),
  }))
  const events: LedgerEvent[] = ((eventsRes.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    source: (e.source as string) ?? 'system',
    eventType: (e.event_type as string) ?? 'event',
    createdAt: String(e.created_at),
  }))
  return { scans, events }
}

async function loadCrm(contactId: string, profileId: string | null): Promise<{ activities: ContactActivity[]; deals: DealRef[] }> {
  const orFilter = profileId ? `contact_id.eq.${contactId},profile_id.eq.${profileId}` : `contact_id.eq.${contactId}`
  const [actRes, dealRes] = await Promise.all([
    db()
      .from('crm_activities')
      .select('id, kind, body, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    db().from('crm_deals').select('id, title, status, value, currency').or(orFilter),
  ])
  const activities: ContactActivity[] = ((actRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    kind: (a.kind as string) ?? 'note',
    body: (a.body as string) ?? '',
    createdAt: String(a.created_at),
  }))
  const deals: DealRef[] = ((dealRes.data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    title: (d.title as string) ?? 'Untitled',
    status: (d.status as string) ?? 'open',
    value: Number(d.value ?? 0),
    currency: (d.currency as string) ?? 'USD',
  }))
  return { activities, deals }
}
