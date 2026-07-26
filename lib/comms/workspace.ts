// CONVERSATION WORKSPACE read model (ADR-812, Phase 3) — turns the comms_* spine (the system of record)
// into the list rows + full threads the unified inbox renders. Server-only; reads through the service-role
// admin client (staff-gated at the call site), mirroring lib/support/store.ts. The untyped admin handle is
// used because the comms_* tables are not in the generated Database types yet (ADR-246).
//
// The workspace is channel-agnostic: a row is a conversation regardless of whether it began as CRM
// outreach, a leader note, a support ticket, or an inbound reply. Identity (counterpart + assignee) is
// batch-loaded from profiles/contacts, exactly as lib/crm/inbox.ts and lib/support/store.ts already do.

import { createAdminClient } from '@/lib/supabase/admin'
import { cleanConversationBody } from '@/lib/comms/message-body'
import { splitQuotedReply } from '@/lib/comms/quoted-reply'
import { healMissingBodies } from '@/lib/comms/inbound'

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
  /** F5 SEAL (owner ruling 2026-07-25): tenant Space lanes are visible ONLY to web_role admin/janitor.
   *  Set for a caller admitted via a team staff domain instead — the list collapses to the PLATFORM lane
   *  (space_id null or the root space) and every tenant thread stays sealed. */
  platformLaneOnly?: boolean
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
  /** The owning Space's name, when the thread belongs to one (null = platform-global). Lets the platform
   *  operator inbox show which tenant a thread is from. */
  spaceName?: string | null
}

/** One attributed message in the thread reader. */
export interface ConversationThreadMessage {
  id: string
  direction: 'inbound' | 'outbound' | 'internal'
  authorKind: string
  authorName: string
  body: string
  bodyHtml: string | null
  /** The quoted/threaded email trail split off `body` at display time (null when none). The reader keeps
   *  it behind a collapsed toggle; the stored body is untouched. */
  quotedTrail: string | null
  isInternal: boolean
  channel: string
  deliveryStatus: string
  occurredAt: string
}

/** A thing the conversation is attached to (event, circle, campaign...), for the reader's context band.
 *  `href` is null when the reference exists but has no linkable page. */
export interface ConversationContextRef {
  label: string
  href: string | null
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
  /** The owning Space's display name + slug (for the context band's Space link); null = platform lane. */
  spaceName: string | null
  spaceSlug: string | null
  /** The linked support ticket, when this conversation wraps one (kind='support'). */
  supportTicketId: string | null
  /** Resolved references from the conversation's context/metadata (event, circle, campaign...). */
  contextRefs: ConversationContextRef[]
  lastActivityAt: string
  messages: ConversationThreadMessage[]
}

const CONV_COLS =
  'id, ref, subject, status, priority, channel, kind, member_profile_id, contact_id, external_email, ' +
  'owner_profile_id, assigned_to, space_id, support_ticket_id, context, metadata, ' +
  'last_activity_at, last_inbound_at, last_outbound_at, created_at'

const MSG_COLS =
  'id, conversation_id, direction, author_id, author_contact_id, author_kind, body, body_html, ' +
  'is_internal, channel, delivery_status, occurred_at, created_at, external_message_id, metadata'

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

/** Batch-load Space display names for a set of space ids (fail-safe: empty map). */
async function loadSpaceNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  try {
    const { data } = await db().from('spaces').select('id, name, brand_name').in('id', unique)
    for (const s of (data as { id: string; name: string | null; brand_name: string | null }[] | null) ?? []) {
      const label = s.brand_name || s.name
      if (label) map.set(String(s.id), label)
    }
  } catch {
    /* fail-safe */
  }
  return map
}

/** Load one Space's display name + slug for the thread's context band (fail-safe: null). */
async function loadSpaceIdentity(spaceId: string | null): Promise<{ name: string | null; slug: string | null } | null> {
  if (!spaceId) return null
  try {
    const { data } = await db().from('spaces').select('name, brand_name, slug').eq('id', spaceId).maybeSingle()
    if (!data) return null
    const s = data as { name: string | null; brand_name: string | null; slug: string | null }
    return { name: s.brand_name || s.name || null, slug: s.slug ?? null }
  } catch {
    return null
  }
}

/** Read the first non-empty string under any of the given keys (defensive: metadata shapes vary). */
function firstStringKey(bag: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = bag[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Resolve what a conversation references (event / circle / broadcast / campaign) from its context +
 *  metadata jsonb — the formal scope columns don't exist yet, so this reads defensively and only returns
 *  refs that actually resolve. Slug-routed entities get links; id-only refs render as plain labels.
 *  FAIL-SAFE: []. */
async function resolveContextRefs(
  context: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null,
): Promise<ConversationContextRef[]> {
  const bag: Record<string, unknown> = {
    ...(context && typeof context === 'object' ? context : {}),
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  }
  const refs: ConversationContextRef[] = []
  const eventId = firstStringKey(bag, ['event_id', 'eventId'])
  const circleId = firstStringKey(bag, ['circle_id', 'circleId'])
  const broadcastId = firstStringKey(bag, ['broadcast_id', 'broadcastId'])
  const campaignId = firstStringKey(bag, ['campaign_id', 'campaignId'])

  if (eventId) {
    try {
      const { data } = await db().from('events').select('slug, title').eq('id', eventId).maybeSingle()
      const e = data as { slug: string | null; title: string | null } | null
      if (e) refs.push({ label: e.title || 'Event', href: e.slug ? `/events/${e.slug}` : null })
    } catch {
      /* fail-safe */
    }
  }
  if (circleId) {
    try {
      const { data } = await db().from('circles').select('slug, name').eq('id', circleId).maybeSingle()
      const c = data as { slug: string | null; name: string | null } | null
      if (c) refs.push({ label: c.name || 'Circle', href: c.slug ? `/circles/${c.slug}` : null })
    } catch {
      /* fail-safe */
    }
  }
  if (broadcastId) refs.push({ label: 'From a broadcast', href: null })
  if (campaignId) refs.push({ label: 'From an email campaign', href: null })
  return refs
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

/** The PLATFORM-lane OR clause (space_id null OR the root space) for the F5 seal. Null root (a
 *  pre-tenancy DB) degrades to null-lane only, which is strictly narrower — fail closed. */
async function platformLaneClause(): Promise<string> {
  const { loadRootSpaceId } = await import('@/lib/spaces/store')
  const rootId = await loadRootSpaceId()
  return rootId ? `space_id.is.null,space_id.eq.${rootId}` : 'space_id.is.null'
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
    else if (filter.platformLaneOnly) q = q.or(await platformLaneClause())
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.channel) q = q.eq('channel', filter.channel)

    const { data, error } = await q
    const rows = (data as ConvRow[] | null) ?? []
    if (error || rows.length === 0) return []

    const profileIds = rows.flatMap((r) => [r.member_profile_id, r.assigned_to].filter(Boolean) as string[])
    const contactIds = rows.map((r) => r.contact_id).filter(Boolean) as string[]
    // Only resolve Space names for the PLATFORM view (no spaceId filter) — a Space-scoped list is already
    // one tenant, so the label would be redundant noise there.
    const spaceIds = filter.spaceId ? [] : (rows.map((r) => r.space_id).filter(Boolean) as string[])
    const [profiles, contacts, snippets, spaceNames] = await Promise.all([
      loadProfileNames(profileIds),
      loadContactIdentities(contactIds),
      loadLatestSnippets(rows.map((r) => r.id)),
      loadSpaceNames(spaceIds),
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
        spaceName: r.space_id ? (spaceNames.get(r.space_id) ?? null) : null,
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
  support_ticket_id: string | null
  context: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
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
      // Clean the email chrome (footer links, quoted history) out of the snippet, same as the thread.
      const snippet = cleanConversationBody(m.body).replace(/\s+/g, ' ').trim().slice(0, 140)
      if (!map.has(key) && snippet) map.set(key, snippet)
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
export async function getWorkspaceThread(
  conversationId: string,
  opts: { platformLaneOnly?: boolean } = {},
): Promise<ConversationThread | null> {
  const id = typeof conversationId === 'string' ? conversationId.trim() : ''
  if (!id) return null
  try {
    const { data: conv } = await db().from('comms_conversations').select(CONV_COLS).eq('id', id).maybeSingle()
    if (!conv) return null
    const row = conv as ConvRow
    // F5 SEAL: a tenant Space's thread never opens for a caller without the web_role lens, even by id.
    if (opts.platformLaneOnly && row.space_id) {
      const { loadRootSpaceId } = await import('@/lib/spaces/store')
      const rootId = await loadRootSpaceId()
      if (row.space_id !== rootId) return null
    }

    const { data: msgData } = await db()
      .from('comms_messages')
      .select(MSG_COLS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500)
    const msgs = (msgData as MsgRow[] | null) ?? []

    // HEAL-ON-LOAD (best-effort): recover the bodies of inbound emails that recorded WITHOUT one
    // (the degraded-hydration path, or the pre-fix "(no message body)" rows) by re-fetching from the
    // provider — the stored resend_email_id first, else a receiving-list match by Message-ID. The
    // update persists; the map patches this render so the operator sees the real message NOW.
    const healed = await healMissingBodies(
      msgs.map((m) => ({
        id: String(m.id),
        body: m.body,
        channel: m.channel,
        externalMessageId: m.external_message_id,
        metadata: m.metadata,
      })),
    )
    for (const m of msgs) {
      const fix = healed.get(String(m.id))
      if (fix) {
        m.body = fix.body
        if (fix.bodyHtml) m.body_html = fix.bodyHtml
      }
    }

    // Resolve every author + the counterpart + the assignee in two batch loads.
    const profileIds = [
      row.member_profile_id,
      row.assigned_to,
      ...msgs.map((m) => m.author_id),
    ].filter(Boolean) as string[]
    const contactIds = [row.contact_id, ...msgs.map((m) => m.author_contact_id)].filter(Boolean) as string[]
    const [profiles, contacts, space, contextRefs] = await Promise.all([
      loadProfileNames(profileIds),
      loadContactIdentities(contactIds),
      loadSpaceIdentity(row.space_id),
      resolveContextRefs(row.context, row.metadata),
    ])

    const cp = counterpartOf(row, profiles, contacts)
    const messages: ConversationThreadMessage[] = msgs.map((m) => {
      // Chat view leads with the NEW content only. An email reply carries the quoted trail its client
      // stapled underneath — split it off (display-time; raw stays stored) so the reader can offer it
      // behind a collapsed toggle instead of repeating the whole chain in every bubble.
      const split = m.channel === 'email' ? splitQuotedReply(m.body) : { visible: m.body ?? '', quoted: null }
      const visible = cleanConversationBody(split.visible)
      return {
        id: String(m.id),
        direction: m.direction as ConversationThreadMessage['direction'],
        authorKind: m.author_kind,
        authorName: authorNameFor(m, profiles, contacts, cp.name),
        // Fail-safe for a quote-only message: fall back to the whole cleaned body (old behavior).
        body: visible || cleanConversationBody(m.body),
        bodyHtml: m.body_html,
        quotedTrail: visible ? split.quoted : null,
        isInternal: !!m.is_internal,
        channel: m.channel,
        deliveryStatus: m.delivery_status,
        occurredAt: m.occurred_at ?? m.created_at,
      }
    })

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
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
      supportTicketId: row.support_ticket_id,
      contextRefs,
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
  external_message_id: string | null
  metadata: Record<string, unknown> | null
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
    // Mirror listWorkspaceConversations' scoping so counts can never contradict a scoped list (a
    // leader-scoped caller must not get platform-wide totals).
    if (filter.ownedOrAssignedTo) {
      q = q.or(`owner_profile_id.eq.${filter.ownedOrAssignedTo},assigned_to.eq.${filter.ownedOrAssignedTo}`)
    }
    if (filter.scope === 'mine') q = q.eq('assigned_to', filter.viewerProfileId)
    else if (filter.scope === 'unassigned') q = q.is('assigned_to', null)
    if (filter.spaceId) q = q.eq('space_id', filter.spaceId)
    else if (filter.platformLaneOnly) q = q.or(await platformLaneClause())
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

/** The people a Space can assign/trade a conversation to: its active operator team (editor+) plus the
 *  owner, with display names. Mirrors listAssignableAgents (support) but scoped to ONE Space's team, so a
 *  Space console never offers a foreign person as an assignee. FAIL-SAFE: [] on error. */
export async function listSpaceAssignableAgents(
  spaceId: string,
  ownerProfileId: string | null,
): Promise<{ id: string; name: string }[]> {
  const id = typeof spaceId === 'string' ? spaceId.trim() : ''
  if (!id) return []
  try {
    const { data } = await db()
      .from('space_members')
      .select('profile_id, role, status')
      .eq('space_id', id)
      .eq('status', 'active')
      .in('role', ['editor', 'moderator', 'admin'])
    const memberIds = ((data as { profile_id: string }[] | null) ?? []).map((r) => String(r.profile_id))
    const ids = [...new Set([...(ownerProfileId ? [ownerProfileId] : []), ...memberIds])]
    if (!ids.length) return []
    const names = await loadProfileNames(ids)
    return ids.map((pid) => ({ id: pid, name: names.get(pid) ?? 'Teammate' }))
  } catch {
    return []
  }
}
