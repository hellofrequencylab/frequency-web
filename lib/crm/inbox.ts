// CRM 2-WAY INBOX — the threaded read model + the inbound-email seam behind the Resonance CRM Inbox
// module (ADR-629, docs/DECISIONS.md). Turns the ONE `contact_interactions` timeline
// (lib/crm/interactions.ts) into per-contact CONVERSATIONS (inbound + outbound, newest first), and
// scaffolds the inbound-email receive seam that lands a received email back onto that timeline.
//
// SHAPE (mirrors lib/crm/timeline.ts): the PURE shapers (`groupIntoThreads`, `parseInboundEmailPayload`)
// have no Supabase/Next imports, so they are unit-testable in isolation. The IO (`listInboxThreads`,
// `recordInboundEmail`) reaches the untyped admin client + the interaction seam.
//
// The inbox NEVER writes contact_interactions directly — every write goes through
// recordContactInteraction (the one front door, lib/crm/interactions.ts). Reads are staff-gated at the
// call site (the Studio surface / the signature-verified webhook), exactly like the rest of the CRM.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  listContactInteractions,
  recordContactInteraction,
  type ContactInteraction,
  type InteractionChannel,
} from '@/lib/crm/interactions'
import { interactionTitle } from '@/lib/crm/timeline'

// ── Conversational channels ───────────────────────────────────────────────────────────────────────
// The inbox is about MESSAGES, so it reads the channels a person and an operator actually converse on
// (email / sms / in-app DM) and drops the ambient timeline noise (notes, system updates, events, scans).
export const CONVERSATION_CHANNELS: readonly InteractionChannel[] = ['email', 'sms', 'in_app']

/** One message in a contact conversation (a slimmed timeline entry). */
export interface InboxMessage {
  id: string
  channel: InteractionChannel
  direction: 'inbound' | 'outbound' | 'internal'
  /** A short, plain one-line label (the row's summary, else the channel verb). */
  title: string
  /** The message body, when any. */
  detail: string | null
  /** ISO timestamp the touch happened. */
  at: string
}

/** One contact's conversation: the contact's identity + its messages, newest first. */
export interface InboxThread {
  contactId: string
  contactName: string | null
  contactEmail: string | null
  messages: InboxMessage[]
  /** ISO timestamp of the most recent message (the thread sort key). */
  lastAt: string
  /** True when the most recent message is inbound (a reply is owed). */
  awaitingReply: boolean
  /** Total messages in the conversation. */
  count: number
}

/** Minimal identity a thread needs for its header, keyed by contact id. */
export interface ContactIdentity {
  name: string | null
  email: string | null
}

function toMessage(i: ContactInteraction): InboxMessage {
  const summary = i.summary?.trim()
  return {
    id: i.id,
    channel: i.channel,
    direction: i.direction,
    title: summary && summary.length ? summary : interactionTitle(i.channel, i.direction),
    detail: i.body?.trim() || null,
    at: i.occurredAt,
  }
}

/**
 * Group a flat list of contact interactions into per-contact conversations, newest first. PURE and
 * deterministic: only `contact`-subject conversational rows are threaded (email/sms/in_app); everything
 * else is ignored. Within a thread, messages sort newest-first; threads sort by their most recent
 * message. A stable id tiebreak keeps equal timestamps deterministic. `identities` supplies each
 * contact's name/email (missing ⇒ nulls). Empty input yields [].
 */
export function groupIntoThreads(
  interactions: readonly ContactInteraction[],
  identities: ReadonlyMap<string, ContactIdentity>,
): InboxThread[] {
  const byContact = new Map<string, InboxMessage[]>()
  for (const i of interactions ?? []) {
    if (i.subjectKind !== 'contact') continue
    if (!CONVERSATION_CHANNELS.includes(i.channel)) continue
    const list = byContact.get(i.subjectId) ?? []
    list.push(toMessage(i))
    byContact.set(i.subjectId, list)
  }

  const threads: InboxThread[] = []
  for (const [contactId, messages] of byContact) {
    messages.sort((a, b) => {
      const ta = Date.parse(a.at) || 0
      const tb = Date.parse(b.at) || 0
      if (tb !== ta) return tb - ta
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
    const identity = identities.get(contactId)
    const latest = messages[0]
    threads.push({
      contactId,
      contactName: identity?.name ?? null,
      contactEmail: identity?.email ?? null,
      messages,
      lastAt: latest?.at ?? '',
      awaitingReply: latest?.direction === 'inbound',
      count: messages.length,
    })
  }

  threads.sort((a, b) => {
    const ta = Date.parse(a.lastAt) || 0
    const tb = Date.parse(b.lastAt) || 0
    if (tb !== ta) return tb - ta
    return a.contactId < b.contactId ? 1 : a.contactId > b.contactId ? -1 : 0
  })
  return threads
}

// ── IO: gather the threads for the operator inbox ──────────────────────────────────────────────────

/**
 * Load the operator inbox: recent contact conversations grouped by contact, newest first. Reads the
 * conversational slice of contact_interactions, then batch-loads each contact's identity (name/email)
 * from the contacts table, and threads them (groupIntoThreads). Staff-gated at the call site.
 * FAIL-SAFE: [] on any error. `spaceId` scopes to one Space's contacts; omit for the platform inbox
 * (platform touches carry a null space_id, so the default read is space-agnostic).
 */
export async function listInboxThreads(opts: { spaceId?: string | null; limit?: number } = {}): Promise<InboxThread[]> {
  const limit = Math.min(Math.max(opts.limit ?? 400, 1), 500)
  try {
    // Pull recent contact-subject interactions (the read is newest-first, capped). We over-fetch the
    // flat stream and thread it in memory so a busy contact never crowds out others' latest message.
    const interactions = await listContactInteractions({
      subjectKind: 'contact',
      ...(opts.spaceId ? { spaceId: opts.spaceId } : {}),
      limit,
    })
    const conversational = interactions.filter((i) => CONVERSATION_CHANNELS.includes(i.channel))
    const contactIds = [...new Set(conversational.map((i) => i.subjectId))]
    const identities = await loadContactIdentities(contactIds)
    return groupIntoThreads(conversational, identities)
  } catch {
    return []
  }
}

/** Batch-load { name, email } for a set of contact ids (fail-safe: empty map on error). */
async function loadContactIdentities(ids: string[]): Promise<Map<string, ContactIdentity>> {
  const map = new Map<string, ContactIdentity>()
  if (ids.length === 0) return map
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
        }
      }
    }
    const { data, error } = await db.from('contacts').select('id, display_name, email').in('id', ids)
    if (error || !data) return map
    for (const r of data) {
      map.set(String(r.id), {
        name: (r.display_name as string) ?? null,
        email: (r.email as string) ?? null,
      })
    }
    return map
  } catch {
    return map
  }
}

/** Resolve a contact's send identity (email + linked member profile + Space) for the reply gate. */
export interface ContactSendTarget {
  contactId: string
  email: string | null
  profileId: string | null
  spaceId: string | null
}

/** Load the fields the reply action needs to gate + record a send. FAIL-SAFE: null on any miss. */
export async function getContactSendTarget(contactId: string): Promise<ContactSendTarget | null> {
  const id = typeof contactId === 'string' ? contactId.trim() : ''
  if (!id) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db
      .from('contacts')
      .select('id, email, profile_id, space_id')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return {
      contactId: String(data.id),
      email: (data.email as string) ?? null,
      profileId: (data.profile_id as string) ?? null,
      spaceId: (data.space_id as string) ?? null,
    }
  } catch {
    return null
  }
}

// ── INBOUND EMAIL SEAM (scaffold) ───────────────────────────────────────────────────────────────────
// The receive half of the 2-way inbox. Today the platform sends outbound and the Resend webhook records
// DELIVERY events (opens/clicks/bounces); it does NOT receive a member's REPLY. This is the seam that
// will: a provider (Resend inbound / an inbound-parse address) POSTs a received email to
// /api/webhooks/inbound-email; we parse it, match the from-address to a contact, and land it on the
// timeline as an INBOUND email interaction — so it appears in the thread above the reply composer.
//
// NEEDS PROVIDER CONFIG TO GO LIVE (documented, not invented here):
//   • RESEND_INBOUND_WEBHOOK_SECRET  — the Svix signing secret for the inbound endpoint.
//   • CRM_INBOX_OWNER_PROFILE_ID     — the profile that OWNS a platform inbound touch when the sender is
//     a pure lead with no linked member profile (the timeline requires an owner). When a contact IS a
//     member, its own profile owns the touch.
// Until those are set, the route verifies + acknowledges but records nothing (fail-safe, logged).

/** The normalized shape we pull out of a provider's inbound-email payload. */
export interface ParsedInboundEmail {
  from: string
  subject: string | null
  text: string | null
}

/**
 * Parse a provider inbound-email payload into { from, subject, text }, or null when there is no usable
 * from-address. PURE + defensive: reads the common field shapes (Resend inbound `data.from` as a string
 * or `{ address }`, `data.subject`, `data.text`/`data.html`) without trusting any of them, and lowercases
 * + trims the from-address so it threads by the same key the contacts table stores. Deterministic; tested.
 */
export function parseInboundEmailPayload(payload: unknown): ParsedInboundEmail | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>

  const from = extractAddress(data.from) ?? extractAddress(root.from)
  if (!from) return null

  const subjectRaw = data.subject ?? root.subject
  const subject = typeof subjectRaw === 'string' && subjectRaw.trim() ? subjectRaw.trim().slice(0, 280) : null

  const textRaw = data.text ?? root.text ?? data.html ?? root.html
  const text = typeof textRaw === 'string' && textRaw.trim() ? textRaw.trim().slice(0, 20_000) : null

  return { from, subject, text }
}

/** Pull a lowercased email address out of a string or a `{ address }` / `{ email }` object. */
function extractAddress(raw: unknown): string | null {
  if (typeof raw === 'string') {
    // A raw string may be "Name <a@b.com>" or "a@b.com". Bound the input (an address is short) and pull
    // the bracketed part with linear indexOf — NOT a regex like /<([^>]+)>/, which backtracks
    // polynomially on a long unclosed "<..." (CodeQL: polynomial ReDoS on uncontrolled data).
    const s = raw.slice(0, 320)
    const lt = s.indexOf('<')
    let inner = s
    if (lt >= 0) {
      const gt = s.indexOf('>', lt + 1)
      if (gt > lt) inner = s.slice(lt + 1, gt)
    }
    const candidate = inner.trim().toLowerCase()
    // Reject control chars (CR/LF etc.) so a captured address can never inject into a log line or thread.
    if (/[\x00-\x1f\x7f]/.test(candidate)) return null
    return candidate.includes('@') ? candidate : null
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    return extractAddress(obj.address ?? obj.email ?? null)
  }
  return null
}

/**
 * Record a parsed inbound email onto the CRM timeline: match the from-address to a contact, then write
 * an INBOUND email interaction (via the one recorder, never the table directly). Returns a small status
 * so the webhook can log what happened. FAIL-SAFE: never throws.
 *
 * OWNER resolution (see the seam note above): a member contact's own profile owns the touch; a pure lead
 * falls back to CRM_INBOX_OWNER_PROFILE_ID. With neither, we skip the record (status 'no_owner') and let
 * the webhook still 200-ack — recording an inbound touch is best-effort, not integrity-critical.
 */
export async function recordInboundEmail(
  parsed: ParsedInboundEmail,
): Promise<{ status: 'recorded' | 'no_contact' | 'no_owner' | 'error'; contactId?: string }> {
  try {
    const contact = await matchContactByEmail(parsed.from)
    if (!contact) return { status: 'no_contact' }

    const owner = contact.profileId ?? process.env.CRM_INBOX_OWNER_PROFILE_ID ?? null
    if (!owner) return { status: 'no_owner', contactId: contact.contactId }

    // Idempotency: a provider may redeliver. Key on the from-address + subject + a coarse minute bucket
    // so a redelivery within the same minute is a no-op, without needing a provider message-id.
    const minute = Math.floor(Date.now() / 60_000)
    const idempotencyKey = `inbound-email:${parsed.from}:${(parsed.subject ?? '').slice(0, 40)}:${minute}`

    const res = await recordContactInteraction(
      {
        ownerProfileId: owner,
        subjectKind: 'contact',
        subjectId: contact.contactId,
        channel: 'email',
        direction: 'inbound',
        summary: parsed.subject ?? 'Email received',
        body: parsed.text,
        source: 'resend',
        metadata: { provider: 'resend', kind: 'inbound', from: parsed.from },
        idempotencyKey,
      },
      contact.spaceId,
    )
    return res ? { status: 'recorded', contactId: contact.contactId } : { status: 'error', contactId: contact.contactId }
  } catch {
    return { status: 'error' }
  }
}

/** Find the contact whose email matches a from-address (most recent wins). FAIL-SAFE: null on miss. */
async function matchContactByEmail(email: string): Promise<ContactSendTarget | null> {
  const needle = (email ?? '').trim().toLowerCase()
  if (!needle) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          ilike: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await db
      .from('contacts')
      .select('id, email, profile_id, space_id, created_at')
      .ilike('email', needle)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error || !data || data.length === 0) return null
    const r = data[0]
    return {
      contactId: String(r.id),
      email: (r.email as string) ?? null,
      profileId: (r.profile_id as string) ?? null,
      spaceId: (r.space_id as string) ?? null,
    }
  } catch {
    return null
  }
}
