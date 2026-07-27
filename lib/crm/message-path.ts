// THE PATH assembler (CRM Everywhere plan Phase 2 / ADR-827 ruling 3). The pure core that turns the
// raw communication history for ONE person — contact_interactions rows + comms_conversations spine
// threads — into the chronological, thread-grouped message path the member-detail fold renders. Each
// entry resolves its tied WEBSITE EVENT reference (the RSVP, the campaign, the Dispatch, the booking
// that caused the message): the NEW first-class scope convention (`scope_kind`/`scope_id` columns)
// wins, the LEGACY `metadata` conventions (`event_id`, `campaign_id`, `metadata.kind` + snake ids)
// are the fallback — so the fold reads correctly both before and after the Phase 0 backfill.
//
// NO new tables and NO IO here (mirrors lib/crm/timeline.ts): every spine message already mirrors to
// the person timeline keyed `conv-msg:<messageId>`, so this module only merges, dedupes the mirrors
// against loaded threads, groups, and resolves refs. The IO that gathers the rows lives in
// lib/crm/message-path-io.ts; the types below are safe to import from client components.
//
// ALTITUDE is enforced HERE, not in the renderer (plan invariant 2 + 4):
//   • platform — the staff lens: every lane, including internal notes on threads.
//   • space    — one Space's lane (the IO also filters server-side; this double-checks the stamp).
//   • event / circle / hub / nexus — scope-eq only, FAIL-CLOSED: an entry that does not RESOLVE to
//     this exact scope is dropped, so an event admin sees that event's comms and nothing else.
//   • audience 'leader' additionally drops internal notes and staff-logged manual touches.
//
// Copy is plain and in voice, no em dashes (docs/CONTENT-VOICE.md).

import { interactionTitle } from './timeline'
import type { InteractionChannel, InteractionDirection } from './interactions'

// ── Vocabulary ────────────────────────────────────────────────────────────────────────────────────

/** The website-event reference kinds a message can be tied to. The first eight mirror the
 *  scope-spine CHECK vocabulary (ADR-831, lock-step with InteractionScopeKind); `ticket` covers the
 *  legacy space-ticket metadata rows. */
export type PathRefKind =
  | 'event' | 'circle' | 'hub' | 'nexus' | 'campaign' | 'dispatch' | 'booking' | 'membership' | 'ticket'

const REF_KINDS: readonly PathRefKind[] =
  ['event', 'circle', 'hub', 'nexus', 'campaign', 'dispatch', 'booking', 'membership', 'ticket']

/** A resolved-but-unlabeled reference: which site object this message was tied to. */
export interface PathRef {
  kind: PathRefKind
  id: string
}

/** The display form of a reference: the tied site event, named, linked when there is a safe route. */
export interface PathEventRef extends PathRef {
  label: string
  href?: string
}

/** The lane the viewer is standing on. Drives the fail-closed scope filter above. */
export type PathScope =
  | { kind: 'platform' }
  | { kind: 'space'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'circle'; id: string }
  | { kind: 'hub'; id: string }
  | { kind: 'nexus'; id: string }

// ── Input row shapes (what the IO hands in; every scope field optional + read defensively, since
//    the scope_kind/scope_id columns may not exist until the Phase 0 migration lands) ──────────────

export interface PathInteractionRow {
  id: string
  channel: InteractionChannel
  direction: InteractionDirection
  summary: string | null
  body: string | null
  metadata: Record<string, unknown> | null
  source: string
  occurredAt: string
  spaceId: string | null
  idempotencyKey?: string | null
  /** The NEW scope columns (Phase 0). Absent or null on pre-migration rows. */
  scopeKind?: string | null
  scopeId?: string | null
}

export interface PathConversationRow {
  id: string
  kind: string
  subject: string | null
  channel: string
  spaceId: string | null
  metadata: Record<string, unknown> | null
  lastActivityAt: string | null
  scopeKind?: string | null
  scopeId?: string | null
}

export interface PathMessageRow {
  id: string
  conversationId: string
  direction: InteractionDirection
  authorKind: string
  /** Resolved by the IO from the author profile; null for external / system authors. */
  authorName: string | null
  body: string
  channel: string
  isInternal: boolean
  occurredAt: string
}

/** Batched display labels the IO resolved for the referenced entities, keyed `<kind>:<id>`. */
export type PathLabels = Record<string, { label: string; href?: string }>

// ── Output shapes (what the fold renders) ──────────────────────────────────────────────────────────

/** One message / touch inside a thread. */
export interface PathEntry {
  id: string
  channel: string
  direction: InteractionDirection
  /** Who it reads as from (the member's name inbound, the author or "Team" outbound). */
  sender: string
  /** The one-line label (the summary, the subject, or the channel verb). */
  title: string
  /** A short body excerpt, when one is safe to show. */
  snippet: string | null
  /** ISO timestamp. */
  at: string
  /** The tied website event, named (and linked when resolvable). */
  ref?: PathEventRef
}

/** One thread in the path: a spine conversation, a collapsed campaign, or a solo touch. */
export interface PathThread {
  key: string
  subject: string
  channel: string
  count: number
  /** ISO timestamp of the newest entry (the sort key, newest thread first). */
  lastAt: string
  /** Chronological (oldest first) inside the thread. */
  entries: PathEntry[]
  ref?: PathEventRef
}

/** The assembled path: newest thread first, plus the latest single touch for the collapsed line. */
export interface MessagePath {
  threads: PathThread[]
  totalEntries: number
  latest: PathEntry | null
}

export const EMPTY_MESSAGE_PATH: MessagePath = { threads: [], totalEntries: 0, latest: null }

// ── Reference resolution: NEW scope convention first, LEGACY metadata second ───────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length ? v.trim() : null
}

/**
 * Resolve which website event a row is tied to. Order of authority:
 *   1. the first-class `scope_kind`/`scope_id` columns (Phase 0) when present and in-vocabulary;
 *   2. the legacy `metadata` conventions: `event_id`, `campaign_id`, `broadcast_id`/`dispatch_id`,
 *      then the `metadata.kind` families (`booking*` + `bookingId`, `membership*`/`ticket*` + `tierId`).
 * Returns null when nothing resolves (the entry simply carries no badge, or is dropped by a
 * fail-closed leader scope). Pure and deterministic.
 */
export function resolvePathRef(row: {
  scopeKind?: string | null
  scopeId?: string | null
  metadata?: Record<string, unknown> | null
}): PathRef | null {
  const scopeKind = str(row.scopeKind)
  const scopeId = str(row.scopeId)
  if (scopeKind && scopeId && REF_KINDS.includes(scopeKind as PathRefKind)) {
    return { kind: scopeKind as PathRefKind, id: scopeId }
  }

  const m = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const eventId = str(m.event_id) ?? str(m.eventId)
  if (eventId) return { kind: 'event', id: eventId }
  const campaignId = str(m.campaign_id) ?? str(m.campaignId)
  if (campaignId) return { kind: 'campaign', id: campaignId }
  const dispatchId = str(m.broadcast_id) ?? str(m.dispatch_id) ?? str(m.dispatchId)
  if (dispatchId) return { kind: 'dispatch', id: dispatchId }

  const kind = str(m.kind) ?? ''
  if (kind.startsWith('booking')) {
    const bookingId = str(m.bookingId) ?? str(m.booking_id)
    if (bookingId) return { kind: 'booking', id: bookingId }
  }
  if (kind.startsWith('membership')) {
    const tierId = str(m.tierId) ?? str(m.tier_id)
    if (tierId) return { kind: 'membership', id: tierId }
  }
  if (kind.startsWith('ticket')) {
    const ticketId = str(m.ticket_id) ?? str(m.tierId) ?? str(m.tier_id)
    if (ticketId) return { kind: 'ticket', id: ticketId }
  }
  return null
}

/** The plain fallback name per kind, used when the IO could not resolve a real label. */
const FALLBACK_LABEL: Record<PathRefKind, string> = {
  event: 'Event',
  circle: 'Circle',
  hub: 'Hub',
  nexus: 'Nexus',
  campaign: 'Campaign',
  dispatch: 'Dispatch',
  booking: 'Booking',
  membership: 'Membership',
  ticket: 'Ticket',
}

/** Attach the resolved display label (and link) to a raw ref. Pure. */
export function labelRef(ref: PathRef, labels: PathLabels | undefined): PathEventRef {
  const hit = labels?.[`${ref.kind}:${ref.id}`]
  return { ...ref, label: hit?.label ?? FALLBACK_LABEL[ref.kind], href: hit?.href }
}

// ── Scope + audience filters ────────────────────────────────────────────────────────────────────────

/**
 * Does a row belong in this viewer's lane? Platform sees every lane; a Space lane requires the Space
 * stamp; the event / circle / hub / nexus lanes require the ref to RESOLVE to that exact scope
 * (fail-closed: an unresolvable entry is not theirs to see). Pure.
 */
export function matchesScope(ref: PathRef | null, rowSpaceId: string | null | undefined, scope: PathScope): boolean {
  switch (scope.kind) {
    case 'platform':
      return true
    case 'space':
      return rowSpaceId === scope.id
    default:
      return !!ref && ref.kind === scope.kind && ref.id === scope.id
  }
}

/** The idempotency key every spine mirror carries: `conv-msg:<messageId>`. */
const MIRROR_KEY_RE = /^conv-msg:(.+)$/

/** The message id a mirror row points to, or null when the row is not a spine mirror. Pure. */
export function mirroredMessageId(idempotencyKey: string | null | undefined): string | null {
  if (!idempotencyKey) return null
  const m = MIRROR_KEY_RE.exec(idempotencyKey)
  return m ? m[1] : null
}

function snippetOf(body: string | null | undefined, cap = 160): string | null {
  if (typeof body !== 'string') return null
  const clean = body.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > cap ? `${clean.slice(0, cap - 1)}…` : clean
}

function ts(at: string | null | undefined): number {
  const t = at ? Date.parse(at) : NaN
  return Number.isNaN(t) ? 0 : t
}

// ── The assembler ───────────────────────────────────────────────────────────────────────────────────

export interface AssembleMessagePathInput {
  interactions: PathInteractionRow[]
  conversations: PathConversationRow[]
  messages: PathMessageRow[]
  labels?: PathLabels
  scope: PathScope
  audience: 'staff' | 'leader'
  /** The member's display name (the inbound sender label). */
  memberName?: string
}

/** Max threads returned (newest first). One page of the fold; "Show older" pages via the IO cursor. */
const MAX_THREADS = 30

/**
 * Merge one person's interactions + spine conversations into the thread-grouped message path:
 *   • a spine conversation is ONE thread carrying its messages chronologically;
 *   • interactions mirrored from loaded messages (`conv-msg:<id>`) are deduped away (the thread
 *     already shows them); a mirror whose thread was NOT loaded stays as a solo entry, so history
 *     never silently disappears;
 *   • a campaign send and its opens / clicks collapse into one thread per campaign;
 *   • everything else is a solo entry.
 * Scope + audience rules are applied here (see the header). Pure and deterministic.
 */
export function assembleMessagePath(input: AssembleMessagePathInput): MessagePath {
  const { scope, audience, labels } = input
  const leader = audience === 'leader'
  const memberName = input.memberName?.trim() || 'Member'

  // 1. Conversations in this lane (each becomes a thread), with their refs resolved once.
  const keptConversations = (input.conversations ?? []).flatMap((c) => {
    const ref = resolvePathRef(c)
    if (!matchesScope(ref, c.spaceId, scope)) return []
    return [{ row: c, ref }]
  })
  const keptConvIds = new Set(keptConversations.map((c) => c.row.id))

  // 2. Messages of the kept conversations. Internal (agent-only) notes never reach a leader.
  const loadedMessageIds = new Set((input.messages ?? []).map((msg) => msg.id))
  const messagesByConv = new Map<string, PathMessageRow[]>()
  for (const msg of input.messages ?? []) {
    if (!keptConvIds.has(msg.conversationId)) continue
    if (msg.isInternal && leader) continue
    const list = messagesByConv.get(msg.conversationId) ?? []
    list.push(msg)
    messagesByConv.set(msg.conversationId, list)
  }

  // 3. Interactions: dedupe spine mirrors against the LOADED messages, trim by audience, scope-check.
  const keptInteractions = (input.interactions ?? []).flatMap((i) => {
    const mirrored = mirroredMessageId(i.idempotencyKey)
    if (mirrored && loadedMessageIds.has(mirrored)) return []
    if (leader && (i.channel === 'note' || i.direction === 'internal' || i.source === 'manual')) return []
    const ref = resolvePathRef(i)
    if (!matchesScope(ref, i.spaceId, scope)) return []
    return [{ row: i, ref }]
  })

  const threads: PathThread[] = []

  // 4. Conversation threads.
  for (const { row, ref } of keptConversations) {
    const msgs = (messagesByConv.get(row.id) ?? []).slice().sort((a, b) => ts(a.occurredAt) - ts(b.occurredAt))
    if (msgs.length === 0) continue
    const labeled = ref ? labelRef(ref, labels) : undefined
    const entries: PathEntry[] = msgs.map((msg) => ({
      id: `msg:${msg.id}`,
      channel: msg.channel,
      direction: msg.direction,
      sender:
        msg.direction === 'inbound'
          ? memberName
          : msg.authorName?.trim() || (msg.authorKind === 'vera' ? 'Vera' : 'Team'),
      title: msg.direction === 'inbound' ? 'Reply' : row.subject?.trim() || 'Message',
      snippet: snippetOf(msg.body),
      at: msg.occurredAt,
      ref: labeled,
    }))
    threads.push({
      key: `conv:${row.id}`,
      subject: row.subject?.trim() || 'Conversation',
      channel: row.channel || 'email',
      count: entries.length,
      lastAt: entries[entries.length - 1].at,
      entries,
      ref: labeled,
    })
  }

  // 5. Campaign threads: one per campaign id, the send + its opens / clicks collapsed together.
  const campaignGroups = new Map<string, { ref: PathRef; rows: PathInteractionRow[] }>()
  const soloRows: { row: PathInteractionRow; ref: PathRef | null }[] = []
  for (const kept of keptInteractions) {
    if (kept.ref?.kind === 'campaign') {
      const group = campaignGroups.get(kept.ref.id) ?? { ref: kept.ref, rows: [] }
      group.rows.push(kept.row)
      campaignGroups.set(kept.ref.id, group)
    } else {
      soloRows.push(kept)
    }
  }

  const interactionEntry = (row: PathInteractionRow, ref: PathRef | null): PathEntry => ({
    id: `int:${row.id}`,
    channel: row.channel,
    direction: row.direction,
    sender: row.direction === 'inbound' ? memberName : 'Team',
    title: row.summary?.trim() || interactionTitle(row.channel, row.direction),
    snippet: snippetOf(row.body),
    at: row.occurredAt,
    ref: ref ? labelRef(ref, labels) : undefined,
  })

  for (const [campaignId, group] of campaignGroups) {
    const entries = group.rows
      .map((row) => interactionEntry(row, group.ref))
      .sort((a, b) => ts(a.at) - ts(b.at))
    const labeled = labelRef(group.ref, labels)
    threads.push({
      key: `campaign:${campaignId}`,
      subject: labeled.label !== FALLBACK_LABEL.campaign ? labeled.label : entries[0].title,
      channel: 'email',
      count: entries.length,
      lastAt: entries[entries.length - 1].at,
      entries,
      ref: labeled,
    })
  }

  // 6. Solo entries: one thread each.
  for (const { row, ref } of soloRows) {
    const entry = interactionEntry(row, ref)
    threads.push({
      key: entry.id,
      subject: entry.title,
      channel: row.channel,
      count: 1,
      lastAt: entry.at,
      entries: [entry],
      ref: entry.ref,
    })
  }

  // 7. Newest thread first, deterministic tiebreak, capped.
  threads.sort((a, b) => {
    const d = ts(b.lastAt) - ts(a.lastAt)
    if (d !== 0) return d
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0
  })
  const capped = threads.slice(0, MAX_THREADS)

  let latest: PathEntry | null = null
  for (const t of capped) {
    const last = t.entries[t.entries.length - 1]
    if (!latest || ts(last.at) > ts(latest.at)) latest = last
  }

  return {
    threads: capped,
    totalEntries: capped.reduce((n, t) => n + t.count, 0),
    latest,
  }
}
