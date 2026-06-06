// Support ticket reads + writes (ADR-159). Server-only. The tables aren't in the
// generated DB types until regen, so we go through an untyped admin handle (repo
// convention — see lib/entry-points/store.ts). Member self-service is also governed
// by RLS; staff/admin operations run here behind app-code authz.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type SupportTicket,
  type TicketWithThread,
  type TicketMessage,
  type TicketParty,
  type TicketType,
  type TicketStatus,
  type TicketPriority,
  type SupportContext,
  isOpenStatus,
} from './types'

const SCREENSHOT_BUCKET = 'support'
const SIGNED_URL_TTL = 60 * 30 // 30 minutes

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

interface TicketRow {
  id: string
  ref: number
  profile_id: string
  type: string
  subject: string
  status: string
  priority: string
  page_url: string | null
  context: unknown
  screenshot_path: string | null
  assigned_to: string | null
  resolved_at: string | null
  last_activity_at: string
  created_at: string
  updated_at: string
}

const TICKET_COLS =
  'id, ref, profile_id, type, subject, status, priority, page_url, context, screenshot_path, assigned_to, resolved_at, last_activity_at, created_at, updated_at'

function toTicket(r: TicketRow): SupportTicket {
  return {
    id: r.id,
    ref: r.ref,
    profileId: r.profile_id,
    type: r.type as TicketType,
    subject: r.subject,
    status: r.status as TicketStatus,
    priority: r.priority as TicketPriority,
    pageUrl: r.page_url,
    context: (r.context && typeof r.context === 'object' ? r.context : {}) as SupportContext,
    screenshotPath: r.screenshot_path,
    assignedTo: r.assigned_to,
    resolvedAt: r.resolved_at,
    lastActivityAt: r.last_activity_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

interface MessageRow {
  id: string
  author_id: string | null
  author_kind: string
  body: string
  is_internal: boolean
  created_at: string
}

async function partyMap(ids: string[]): Promise<Map<string, TicketParty>> {
  const map = new Map<string, TicketParty>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return map
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', unique)
  for (const p of (data as { id: string; display_name: string; handle: string; avatar_url: string | null }[] | null) ?? []) {
    map.set(p.id, { id: p.id, name: p.display_name, handle: p.handle, avatarUrl: p.avatar_url })
  }
  return map
}

async function signedScreenshot(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await createAdminClient().storage.from(SCREENSHOT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

// ── Member self-service ───────────────────────────────────────────────────────

export interface NewTicketInput {
  profileId: string
  type: TicketType
  subject: string
  body: string
  pageUrl?: string | null
  context?: SupportContext
  screenshotPath?: string | null
}

/** File a ticket + its opening message. Returns the new id + human ref. */
export async function createTicket(input: NewTicketInput): Promise<{ id: string; ref: number }> {
  const now = new Date().toISOString()
  const { data, error } = await db()
    .from('support_tickets')
    .insert({
      profile_id: input.profileId,
      type: input.type,
      subject: input.subject.trim().slice(0, 160),
      page_url: input.pageUrl ?? null,
      context: (input.context ?? {}) as unknown,
      screenshot_path: input.screenshotPath ?? null,
      last_activity_at: now,
    })
    .select('id, ref')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create the ticket.')

  const row = data as { id: string; ref: number }
  const body = input.body.trim()
  if (body) {
    await db().from('support_ticket_messages').insert({
      ticket_id: row.id,
      author_id: input.profileId,
      author_kind: 'member',
      body: body.slice(0, 8000),
    })
  }
  return row
}

/** Every ticket a member filed, newest activity first. */
export async function listMyTickets(profileId: string): Promise<SupportTicket[]> {
  const { data } = await db()
    .from('support_tickets')
    .select(TICKET_COLS)
    .eq('profile_id', profileId)
    .order('last_activity_at', { ascending: false })
  return ((data as TicketRow[] | null) ?? []).map(toTicket)
}

/** One ticket + its public thread, only if `profileId` owns it. */
export async function getTicketForViewer(id: string, profileId: string): Promise<TicketWithThread | null> {
  const { data } = await db().from('support_tickets').select(TICKET_COLS).eq('id', id).maybeSingle()
  const row = data as TicketRow | null
  if (!row || row.profile_id !== profileId) return null
  return assembleThread(row, { includeInternal: false })
}

/** Add a member reply; bumps activity and re-opens a resolved ticket. */
export async function addMemberMessage(ticketId: string, profileId: string, body: string): Promise<boolean> {
  const { data } = await db().from('support_tickets').select('id, profile_id, status').eq('id', ticketId).maybeSingle()
  const t = data as { id: string; profile_id: string; status: string } | null
  if (!t || t.profile_id !== profileId) return false
  await db().from('support_ticket_messages').insert({
    ticket_id: ticketId,
    author_id: profileId,
    author_kind: 'member',
    body: body.trim().slice(0, 8000),
  })
  const reopen = t.status === 'resolved' || t.status === 'closed'
  await db()
    .from('support_tickets')
    .update({
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(reopen ? { status: 'open', resolved_at: null } : {}),
    })
    .eq('id', ticketId)
  return true
}

// ── Vera context ──────────────────────────────────────────────────────────────

/** A short, plain-text summary of a member's recent tickets for Vera's prompt. */
export async function supportSummaryForVera(profileId: string, limit = 4): Promise<string> {
  const { data } = await db()
    .from('support_tickets')
    .select('ref, type, status, subject')
    .eq('profile_id', profileId)
    .order('last_activity_at', { ascending: false })
    .limit(limit)
  const rows = (data as { ref: number; type: string; status: string; subject: string }[] | null) ?? []
  if (rows.length === 0) return ''
  return rows
    .map((r) => `#${r.ref} (${r.type}, ${r.status.replace('_', ' ')}): "${r.subject}"`)
    .join('; ')
}

// ── Admin / staff console ─────────────────────────────────────────────────────

export interface TicketFilters {
  status?: TicketStatus | 'all' | 'open_all'
  type?: TicketType
  assignedTo?: string
  q?: string
}

export interface AdminTicketRow extends SupportTicket {
  reporter: TicketParty | null
  assignee: TicketParty | null
  replyCount: number
}

/** All tickets for the console, filtered, newest activity first. */
export async function listTickets(filters: TicketFilters = {}): Promise<AdminTicketRow[]> {
  let q = db().from('support_tickets').select(TICKET_COLS).order('last_activity_at', { ascending: false }).limit(300)
  if (filters.status === 'open_all') q = q.in('status', ['open', 'in_progress', 'waiting'])
  else if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.type) q = q.eq('type', filters.type)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
  if (filters.q?.trim()) q = q.ilike('subject', `%${filters.q.trim()}%`)

  const { data } = await q
  const rows = ((data as TicketRow[] | null) ?? []).map(toTicket)
  if (rows.length === 0) return []

  const parties = await partyMap(rows.flatMap((r) => [r.profileId, r.assignedTo].filter((x): x is string => !!x)))
  const { data: counts } = await db()
    .from('support_ticket_messages')
    .select('ticket_id')
    .in('ticket_id', rows.map((r) => r.id))
  const countMap = new Map<string, number>()
  for (const c of (counts as { ticket_id: string }[] | null) ?? []) {
    countMap.set(c.ticket_id, (countMap.get(c.ticket_id) ?? 0) + 1)
  }

  return rows.map((r) => ({
    ...r,
    reporter: parties.get(r.profileId) ?? null,
    assignee: r.assignedTo ? parties.get(r.assignedTo) ?? null : null,
    replyCount: countMap.get(r.id) ?? 0,
  }))
}

/** Counts per status, for the console header chips. */
export async function ticketStatusCounts(): Promise<Record<string, number>> {
  const { data } = await db().from('support_tickets').select('status')
  const out: Record<string, number> = {}
  for (const r of (data as { status: string }[] | null) ?? []) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

/** Full ticket + thread INCLUDING internal notes — staff view. */
export async function getTicketAdmin(id: string): Promise<TicketWithThread | null> {
  const { data } = await db().from('support_tickets').select(TICKET_COLS).eq('id', id).maybeSingle()
  const row = data as TicketRow | null
  if (!row) return null
  return assembleThread(row, { includeInternal: true })
}

export interface TicketUpdate {
  status?: TicketStatus
  priority?: TicketPriority
  assignedTo?: string | null
}

export async function updateTicketFields(id: string, patch: TicketUpdate): Promise<void> {
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now, last_activity_at: now }
  if (patch.status !== undefined) {
    update.status = patch.status
    update.resolved_at = patch.status === 'resolved' || patch.status === 'closed' ? now : null
  }
  if (patch.priority !== undefined) update.priority = patch.priority
  if (patch.assignedTo !== undefined) update.assigned_to = patch.assignedTo
  await db().from('support_tickets').update(update).eq('id', id)
}

/** A staff reply (public) or internal note. Public replies move an open ticket to
 *  'waiting' (on the member) unless it's already resolved/closed. */
export async function addStaffMessage(
  ticketId: string,
  staffId: string,
  body: string,
  isInternal: boolean,
): Promise<void> {
  await db().from('support_ticket_messages').insert({
    ticket_id: ticketId,
    author_id: staffId,
    author_kind: 'staff',
    body: body.trim().slice(0, 8000),
    is_internal: isInternal,
  })
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { last_activity_at: now, updated_at: now }

  // A public reply moves an open ticket to 'waiting' and notifies the reporter so
  // the loop closes — they hear back without having to revisit /support. Internal
  // notes do neither.
  if (!isInternal) {
    const { data } = await db()
      .from('support_tickets')
      .select('status, profile_id, ref')
      .eq('id', ticketId)
      .maybeSingle()
    const t = data as { status: string; profile_id: string; ref: number } | null
    if (t && isOpenStatus(t.status as TicketStatus)) update.status = 'waiting'
    if (t) {
      try {
        await db().from('notifications').insert({
          recipient_id: t.profile_id,
          actor_id: staffId,
          type: 'support_reply',
          reference_type: 'support_ticket',
          reference_id: ticketId,
          body: `replied to your report #${t.ref}`,
        })
      } catch {
        /* notification is best-effort, never blocks the reply */
      }
    }
  }
  await db().from('support_tickets').update(update).eq('id', ticketId)
}

/** Active host+ members an operator can assign a ticket to. */
export async function listAssignableAgents(): Promise<TicketParty[]> {
  const { data } = await db()
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role')
    .eq('is_active', true)
    .in('community_role', ['host', 'guide', 'mentor', 'admin', 'janitor'])
    .order('display_name', { ascending: true })
    .limit(200)
  return ((data as { id: string; display_name: string; handle: string; avatar_url: string | null }[] | null) ?? []).map(
    (p) => ({ id: p.id, name: p.display_name, handle: p.handle, avatarUrl: p.avatar_url }),
  )
}

/** A given member's tickets — for the staff member-record panel (same query as
 *  listMyTickets, named for the operator context). */
export function listTicketsForProfile(profileId: string): Promise<SupportTicket[]> {
  return listMyTickets(profileId)
}

/** Count of a member's tickets — surfaced on their profile/CRM record. */
export async function ticketCountForProfile(profileId: string): Promise<{ total: number; open: number }> {
  const { data } = await db().from('support_tickets').select('status').eq('profile_id', profileId)
  const rows = (data as { status: string }[] | null) ?? []
  return { total: rows.length, open: rows.filter((r) => isOpenStatus(r.status as TicketStatus)).length }
}

// ── Screenshot upload (private bucket) ────────────────────────────────────────

export async function uploadScreenshot(profileId: string, file: File): Promise<string | null> {
  if (!file || file.size === 0) return null
  if (file.size > 10 * 1024 * 1024) throw new Error('Screenshot must be under 10MB.')
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${profileId}/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await createAdminClient().storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, { contentType: file.type || 'image/png', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

// ── Shared thread assembly ────────────────────────────────────────────────────

async function assembleThread(row: TicketRow, opts: { includeInternal: boolean }): Promise<TicketWithThread> {
  let mq = db().from('support_ticket_messages').select('id, author_id, author_kind, body, is_internal, created_at').eq('ticket_id', row.id).order('created_at', { ascending: true })
  if (!opts.includeInternal) mq = mq.eq('is_internal', false)
  const { data: msgRows } = await mq
  const messages = (msgRows as MessageRow[] | null) ?? []

  const parties = await partyMap([
    row.profile_id,
    row.assigned_to ?? '',
    ...messages.map((m) => m.author_id ?? ''),
  ])

  const ticket = toTicket(row)
  return {
    ...ticket,
    messages: messages.map((m): TicketMessage => ({
      id: m.id,
      authorId: m.author_id,
      authorKind: m.author_kind as TicketMessage['authorKind'],
      authorName: m.author_id ? parties.get(m.author_id)?.name ?? null : null,
      body: m.body,
      isInternal: m.is_internal,
      createdAt: m.created_at,
    })),
    screenshotUrl: await signedScreenshot(row.screenshot_path),
    reporter: parties.get(row.profile_id) ?? null,
    assignee: row.assigned_to ? parties.get(row.assigned_to) ?? null : null,
  }
}
