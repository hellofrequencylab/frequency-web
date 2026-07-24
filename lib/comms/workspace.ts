// CONVERSATION WORKSPACE read model (ADR-812, Phase 3) — turns the comms_* spine (the system of record)
// into the list rows + full threads the unified inbox renders. Server-only; reads through the service-role
// admin client (staff-gated at the call site), mirroring lib/support/store.ts. The untyped admin handle is
// used because the comms_* tables are not in the generated Database types yet (ADR-246).
//
// The workspace is channel-agnostic: a row is a conversation regardless of whether it began as CRM
// outreach, a leader note, a support ticket, or an inbound reply. Identity (counterpart + assignee) is
// batch-loaded from profiles/contacts, exactly as lib/crm/inbox.ts and lib/support/store.ts already do.

import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): { from: (t: string) => any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as { from: (t: string) => any }
}

/** Which slice of the inbox the operator is looking at (URL-as-state on the workspace). */
export type ConversationScope = 'mine' | 'unassigned' | 'all'

export interface ConversationListFilter {
  scope: ConversationScope
  /** The signed-in operator/leader — defines "Mine". */
  viewerProfileId: string
  /** Scope to one Space's conversations; omit for the platform inbox. */
  spaceId?: string | null
  /** open | in_progress | waiting | resolved | closed */
  status?: string | null
  /** email | sms | in_app | … */
  channel?: string | null
  /** LEADER inbox scope: restrict to conversations this profile OWNS (their sender trail) or is assigned.
   *  When set, it bounds the whole list to the leader's own threads (they never see the platform queue). */
  ownedOrAssignedTo?: string | null
  limit?: number
}

/** One row in the conversation list (the middle pane). */
export interface ConversationListRow {
  id: string
  ref: string
  subject: string
  status: string
  priority: string
  channel: string
  kind: string
  counterpartName: string | null
  counterpartEmail: string | null
  assignedTo: string | null
  assigneeName: string | null
  lastActivityAt: string
  /** True when the last message was inbound (a reply is owed). */
  awaitingReply: boolean
  /** A short preview of the latest non-internal message. */
  snippet: string | null
}

/** One attributed message in the thread reader. */
export interface ConversationThreadMessage {
  id: string
  direction: 'inbound' | 'outbound' | 'internal'
  authorKind: string
  authorName: string
  body: string
  bodyHtml: string | null
  isInternal: boolean
  channel: string
  deliveryStatus: string
  occurredAt: string
}

/** The full thread (the reader pane): the conversation header + its attributed messages, oldest first. */
export interface ConversationThread {
  id: string
  ref: string
  subject: string
  status: string
  priority: string
  channel: string
  kind: string
  counterpartName: string | null
  counterpartEmail: string | null
  assignedTo: string | null
  assigneeName: string | null
  ownerProfileId: string | null
  memberProfileId: string | null
  contactId: string | null
  spaceId: string | null
  lastActivityAt: string
  messages: ConversationThreadMessage[]
}

const CONV_COLS =
  'id, ref, subject, status, priority, channel, kind, member_profile_id, contact_id, external_email, ' +
  'owner_profile_id, assigned_to, space_id, last_activity_at, last_inbound_at, last_outbound_at, created_at'

const MSG_COLS =
  'id, conversation_id, direction, author_id, author_contact_id, author_kind, body, body_html, ' +
  'is_internal, channel, delivery_status, occurred_at, created_at'

interface Identity {
  name: string | null
  email: string | null
}

/** Batch-load display names for a set of profile ids (fail-safe: empty map). */
async function loadProfileNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  try {
    const { data } = await db().from('profiles').select('id, display_name').in('id', unique)
    for (const p of (data as { id: string; display_name: string | null }[] | null) ?? []) {
      if (p.display_name) map.set(String(p.id), p.display_name)
    }
  } catch {
    /* fail-safe */
  }
  return map
}

/** Batch-load { name, email } for a set of contact ids (fail-safe: empty map). */
async function loadContactIdentities(ids: string[]): Promise<Map<string, Identity>> {
  const map = new Map<string, Identity>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  try {
    const { data } = await db().from('contacts').select('id, display_name, email').in('id', unique)
    for (const c of (data as { id: string; display_name: string | null; email: string | null }[] | null) ?? []) {
      map.set(String(c.id), { name: c.display_name ?? null, email: c.email ?? null })
    }
  } catch {
    /* fail-safe */
  }
  return map
}

/** Resolve a conversation's counterpart identity from its member/contact/external-email fields. */
function counterpartOf(
  row: { member_profile_id: string | null; contact_id: string | null; external_email: string | null },
  profiles: Map<string, string>,
  contacts: Map<string, Identity>,
): Identity {
  if (row.member_profile_id && profiles.has(row.member_profile_id)) {
    return { name: profiles.get(row.member_profile_id) ?? null, email: row.external_email }
  }
  if (row.contact_id && contacts.has(row.contact_id)) {
    const c = contacts.get(row.contact_id)!
    return { name: c.name, email: c.email ?? row.external_email }
  }
  return { name: null, email: row.external_email }
}

/**
 * List the conversations for the workspace, newest activity first, scoped + filtered. Batch-loads the
 * assignee name, the counterpart identity, and the latest non-internal message snippet. Staff-gated at the
 * call site. FAIL-SAFE: [] on any error.
 */
export async function listWorkspaceConversations(filter: ConversationListFilter): Promise<ConversationListRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500)
  try {
    let q = db().from('comms_conversations').select(CONV_COLS).order('last_activity_at', { ascending: false }).limit(limit)

    // LEADER inbox: bound to the leader's own threads (owner OR assignee) before any scope/status filter.
    if (filter.ownedOrAssignedTo) {
      q = q.or(`owner_profile_id.eq.${filter.ownedOrAssignedTo},assigned_to.eq.${filter.ownedOrAssignedTo}`)
    }
    if (filter.scope === 'mine') q = q.eq('assigned_to', filter.viewerProfileId)
    else if (filter.scope === 'unassigned') q = q.is('assigned_to', null)
    if (filter.spaceId) q = q.eq('space_id', filter.spaceId)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.channel) q = q.eq('channel', filter.channel)

    const { data, error } = await q
    const rows = (data as ConvRow[] | null) ?? []
    if (error || rows.length === 0) return []

    const profileIds = rows.flatMap((r) => [r.member_profile_id, r.assigned_to].filter(Boolean) as string[])
    const contactIds = rows.map((r) => r.contact_id).filter(Boolean) as string[]
    const [profiles, contacts, snippets] = await Promise.all([
      loadProfileNames(profileIds),
      loadContactIdentities(contactIds),
      loadLatestSnippets(rows.map((r) => r.id)),
    ])

    return rows.map((r) => {
      const cp = counterpartOf(r, profiles, contacts)
      return {
        id: String(r.id),
        ref: String(r.ref),
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        channel: r.channel,
        kind: r.kind,
        counterpartName: cp.name,
        counterpartEmail: cp.email,
        assignedTo: r.assigned_to,
        assigneeName: r.assigned_to ? (profiles.get(r.assigned_to) ?? null) : null,
        lastActivityAt: r.last_activity_at,
        awaitingReply: isAwaitingReply(r),
        snippet: snippets.get(String(r.id)) ?? null,
      }
    })
  } catch {
    return []
  }
}

interface ConvRow {
  id: string
  ref: number | string
  subject: string
  status: string
  priority: string
  channel: string
  kind: string
  member_profile_id: string | null
  contact_id: string | null
  external_email: string | null
  owner_profile_id: string | null
  assigned_to: string | null
  space_id: string | null
  last_activity_at: string
  last_inbound_at: string | null
  last_outbound_at: string | null
  created_at: string
}

/** A reply is owed when the last inbound is newer than the last outbound (or there is no outbound yet). */
function isAwaitingReply(r: { last_inbound_at: string | null; last_outbound_at: string | null }): boolean {
  if (!r.last_inbound_at) return false
  if (!r.last_outbound_at) return true
  return Date.parse(r.last_inbound_at) > Date.parse(r.last_outbound_at)
}

/** Load the latest NON-internal message body per conversation, for the list snippet. Fail-safe: empty. */
async function loadLatestSnippets(conversationIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!conversationIds.length) return map
  try {
    // Over-fetch recent messages for the listed conversations, newest first, then keep the first
    // (latest) non-internal body seen per conversation. Bounded so a busy thread can't dominate.
    const { data } = await db()
      .from('comms_messages')
      .select('conversation_id, body, is_internal, created_at')
      .in('conversation_id', conversationIds)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(conversationIds.length * 4)
    for (const m of (data as { conversation_id: string; body: string }[] | null) ?? []) {
      const key = String(m.conversation_id)
      if (!map.has(key) && m.body) map.set(key, m.body.replace(/\s+/g, ' ').trim().slice(0, 140))
    }
  } catch {
    /* fail-safe */
  }
  return map
}

/**
 * Load one full conversation thread (the reader pane): the conversation header + every message (internal
 * notes included — this is the staff view), oldest first, each attributed to its real sender. Staff-gated
 * at the call site. FAIL-SAFE: null on miss/error.
 */
export async function getWorkspaceThread(conversationId: string): Promise<ConversationThread | null> {
  const id = typeof conversationId === 'string' ? conversationId.trim() : ''
  if (!id) return null
  try {
    const { data: conv } = await db().from('comms_conversations').select(CONV_COLS).eq('id', id).maybeSingle()
    if (!conv) return null
    const row = conv as ConvRow

    const { data: msgData } = await db()
      .from('comms_messages')
      .select(MSG_COLS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500)
    const msgs = (msgData as MsgRow[] | null) ?? []

    // Resolve every author + the counterpart + the assignee in two batch loads.
    const profileIds = [
      row.member_profile_id,
      row.assigned_to,
      ...msgs.map((m) => m.author_id),
    ].filter(Boolean) as string[]
    const contactIds = [row.contact_id, ...msgs.map((m) => m.author_contact_id)].filter(Boolean) as string[]
    const [profiles, contacts] = await Promise.all([loadProfileNames(profileIds), loadContactIdentities(contactIds)])

    const cp = counterpartOf(row, profiles, contacts)
    const messages: ConversationThreadMessage[] = msgs.map((m) => ({
      id: String(m.id),
      direction: m.direction as ConversationThreadMessage['direction'],
      authorKind: m.author_kind,
      authorName: authorNameFor(m, profiles, contacts, cp.name),
      body: m.body,
      bodyHtml: m.body_html,
      isInternal: !!m.is_internal,
      channel: m.channel,
      deliveryStatus: m.delivery_status,
      occurredAt: m.occurred_at ?? m.created_at,
    }))

    return {
      id: String(row.id),
      ref: String(row.ref),
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      channel: row.channel,
      kind: row.kind,
      counterpartName: cp.name,
      counterpartEmail: cp.email,
      assignedTo: row.assigned_to,
      assigneeName: row.assigned_to ? (profiles.get(row.assigned_to) ?? null) : null,
      ownerProfileId: row.owner_profile_id,
      memberProfileId: row.member_profile_id,
      contactId: row.contact_id,
      spaceId: row.space_id,
      lastActivityAt: row.last_activity_at,
      messages,
    }
  } catch {
    return null
  }
}

interface MsgRow {
  id: string
  direction: string
  author_id: string | null
  author_contact_id: string | null
  author_kind: string
  body: string
  body_html: string | null
  is_internal: boolean
  channel: string
  delivery_status: string
  occurred_at: string | null
  created_at: string
}

/** Name a message's author: a profile/contact display name, else the kind (Vera/System), else the
 *  counterpart's name for an external sender we couldn't resolve. */
function authorNameFor(
  m: MsgRow,
  profiles: Map<string, string>,
  contacts: Map<string, Identity>,
  counterpartName: string | null,
): string {
  if (m.author_id && profiles.get(m.author_id)) return profiles.get(m.author_id)!
  if (m.author_contact_id && contacts.get(m.author_contact_id)?.name) return contacts.get(m.author_contact_id)!.name!
  if (m.author_kind === 'vera') return 'Vera'
  if (m.author_kind === 'system') return 'System'
  if (m.direction === 'inbound') return counterpartName ?? 'Them'
  return 'Frequency'
}

/** Per-status counts for the segments header, honoring the current scope + space (not the status filter). */
export async function conversationStatusCounts(
  filter: Omit<ConversationListFilter, 'status'>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  try {
    let q = db().from('comms_conversations').select('status').limit(2000)
    if (filter.scope === 'mine') q = q.eq('assigned_to', filter.viewerProfileId)
    else if (filter.scope === 'unassigned') q = q.is('assigned_to', null)
    if (filter.spaceId) q = q.eq('space_id', filter.spaceId)
    if (filter.channel) q = q.eq('channel', filter.channel)
    const { data } = await q
    for (const r of (data as { status: string }[] | null) ?? []) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
    }
  } catch {
    /* fail-safe */
  }
  return counts
}
