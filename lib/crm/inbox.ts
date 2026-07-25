// CRM INBOUND-EMAIL SEAM — the webhook fallback that lands a received email on the CRM timeline
// when it carries NO conversation reply-token (ADR-629; the flat-inbox READ model that used to live
// here is RETIRED, ADR-820 — the Conversations workspace over the comms spine is the one operator
// inbox). What remains: the PURE payload parser (`parseInboundEmailPayload`), the from-address
// contact matcher (`matchContactByEmail`), and `recordInboundEmail`, which writes the inbound touch
// through recordContactInteraction (the one front door, lib/crm/interactions.ts). This fallback must
// stay as long as any in-the-wild mail lacks a reply-token (old campaign broadcasts, replies to
// hello@, replies to pre-migration flat-inbox sends).
//
// authz-delegated: the ONLY caller is the Svix-signature-verified inbound-email webhook
// (app/api/webhooks/inbound-email/route.ts) — the provider signature is the gate; every write goes
// through recordContactInteraction and is bound to the matched contact's own timeline.

import { createAdminClient } from '@/lib/supabase/admin'
import { escapeLike } from '@/lib/search-sanitize'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { recordInboundReplyEvent } from '@/lib/spaces/email-tracking'
import { loadRootSpaceId } from '@/lib/spaces/store'

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
    if (!res) return { status: 'error', contactId: contact.contactId }

    // SPACE EMAIL ENGAGEMENT (additive, best-effort): if this reply is from someone a Space emailed,
    // log a 'reply' engagement event against the most recent send to that address, so the Marketing
    // dashboard + member detail can show replies. FAIL-SAFE: no matching send => nothing recorded, and
    // a failure never affects the recorded inbound interaction above.
    try {
      await recordInboundReplyEvent(parsed.from, contact.spaceId)
    } catch {
      /* best-effort: the inbound interaction is already recorded */
    }

    // ALERT the owner: a reply is owed, so ping them (bell + the CRM Inbox already shows the thread).
    // Best-effort: the reply is already on the timeline, so a notification failure must never fail it.
    try {
      const admin = createAdminClient() as unknown as {
        from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }
      }
      await admin.from('notifications').insert({
        recipient_id: owner,
        type: 'crm_inbound_reply',
        reference_type: 'contact',
        reference_id: contact.contactId,
        body: `replied to your email${parsed.subject ? `: ${parsed.subject.slice(0, 80)}` : ''}`,
      })
    } catch {
      /* best-effort: the reply is recorded regardless of the alert */
    }
    return { status: 'recorded', contactId: contact.contactId }
  } catch {
    return { status: 'error' }
  }
}

/** Find the contact whose email matches a from-address. TENANCY (meta-scan CRM audit): under
 *  per-space tenancy (ADR-624) one address can be a row in SEVERAL lanes (the root membrane + any
 *  tenant Space that captured them). This fallback runs with NO reply-token context, so it cannot
 *  know which lane the reply belongs to — the old "most recent row wins" bound a platform member's
 *  reply to whichever tenant captured them last (cross-tenant timeline misattribution). The
 *  deterministic rule now: the PRIMARY (root/platform) lane wins when it exists — the Resonance CRM
 *  is the primary system of record — else the newest tenant row (a tenant-only lead still lands on
 *  that tenant's timeline). The real fix for lane-precise routing is the conversation spine's
 *  reply-token (which carries the conversation, and with it the lane); flat-inbox replies should
 *  migrate onto it. FAIL-SAFE: null on miss. */
async function matchContactByEmail(email: string): Promise<{
  contactId: string
  email: string | null
  profileId: string | null
  spaceId: string | null
} | null> {
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
      // escapeLike: `_`/`%` in an email are ILIKE wildcards — an inbound reply from `a_b@x.com` must not
      // bind to `axb@x.com` (wrong contact's timeline + wrong owner notified).
      .ilike('email', escapeLike(needle))
      .order('created_at', { ascending: false })
      .limit(20)
    if (error || !data || data.length === 0) return null
    const rows = data as Record<string, unknown>[]
    const rootId = await loadRootSpaceId()
    const primary = rows.find((r) => r.space_id == null || (rootId != null && r.space_id === rootId))
    const r = primary ?? rows[0]
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
