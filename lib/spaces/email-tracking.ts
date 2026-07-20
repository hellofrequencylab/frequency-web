// Per-Space EMAIL ENGAGEMENT tracking: the WRITE seam behind opens / clicks / replies.
//
// Three responsibilities, all FAIL-SAFE (a tracking failure must NEVER block or corrupt a send):
//   1. TOKEN — an opaque, non-enumerable token that maps a tracking URL back to ONE outreach_sends
//      row. encodeSendToken(sendId) => a 48-hex string (the send uuid's 32 hex chars + a 16-hex HMAC
//      tag); decodeSendToken(token) => the send uuid, or null if the tag does not verify. The HMAC
//      (same secret as the unsubscribe tokens) makes the token unforgeable: an attacker cannot mint a
//      token for an arbitrary send id, so the open/click endpoints can trust a decoded id.
//   2. INJECT — injectTracking(html, token, baseUrl) is a PURE helper: it appends a 1x1 transparent
//      tracking pixel and rewrites http(s) <a href> links to route through the click endpoint carrying
//      the original URL. It touches nothing else (mailto/tel/anchors, the unsubscribe link, and our own
//      endpoints are left alone), and on any surprise it is wrapped by the caller so the ORIGINAL html
//      always sends.
//   3. RECORD — recordEmailEvent(...) writes one space_email_events row (service-role, best-effort void),
//      and the resolve/reply helpers look up the send row so the public endpoints + the inbound webhook
//      can attribute an event to a Space without trusting client input.
//
// The send row (outreach_sends) is the source of truth for "which Space + which address"; the endpoints
// only ever carry a token, never a raw space/email, so a crafted URL can only ever log against a real
// send it already knows the id of.

import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeHttpUrl } from '@/lib/safe-url'

// ── Token (HMAC, non-enumerable) ─────────────────────────────────────────────────────────────────

// Mirrors lib/unsubscribe-tokens.ts: a dedicated secret in production, a dev fallback to the service
// role key prefix so local + tests work. Fail-closed in production so a misconfig is caught, not
// silently degraded to a guessable token.
function getSecret(): string {
  const explicit = process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[email-tracking] UNSUBSCRIBE_SECRET must be set in production. Refusing to sign tracking tokens with the service-role key.',
    )
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[email-tracking] No UNSUBSCRIBE_SECRET and no SUPABASE_SERVICE_ROLE_KEY to sign with.')
  }
  return fallback
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TOKEN_RE = /^[0-9a-f]{48}$/

/** The 16-hex HMAC tag over a send uuid — the unforgeable half of the token. */
function tagFor(sendId: string): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`space-email-track:${sendId}`)
  return hmac.digest('hex').slice(0, 16)
}

/** Encode a send uuid into an opaque tracking token (32 hex of the uuid + a 16-hex HMAC tag). Throws
 *  only on a non-uuid input or a missing signing secret; the send loop wraps the call so a throw falls
 *  back to the original, untracked html. */
export function encodeSendToken(sendId: string): string {
  const id = (sendId ?? '').trim().toLowerCase()
  if (!UUID_RE.test(id)) throw new Error('[email-tracking] encodeSendToken: not a uuid')
  return id.replace(/-/g, '') + tagFor(id)
}

/** Decode + VERIFY a tracking token back to its send uuid, or null on any bad length / tag mismatch.
 *  Constant-time tag compare. Public endpoints trust the returned id only because the tag verified. */
export function decodeSendToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null
  const t = token.trim().toLowerCase()
  if (!TOKEN_RE.test(t)) return null
  const hex = t.slice(0, 32)
  const tag = t.slice(32)
  const sendId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  try {
    const expected = tagFor(sendId)
    if (!timingSafeEqual(Buffer.from(tag, 'hex'), Buffer.from(expected, 'hex'))) return null
  } catch {
    return null
  }
  return sendId
}

// ── Inject (PURE) ────────────────────────────────────────────────────────────────────────────────

// A 1x1 transparent GIF, hidden. Kept out of the layout (display:none + 1px) so it never shows.
function pixelTag(base: string, token: string): string {
  return `<img src="${base}/e/o/${token}" width="1" height="1" alt="" style="display:none;max-width:1px;max-height:1px;" />`
}

/**
 * PURE: append an open-tracking pixel and rewrite http(s) <a href> links to route through the click
 * endpoint carrying the original URL. Deterministic, no IO, unit-reasonable. FAIL-SAFE by construction:
 * an empty html / token / baseUrl returns the input unchanged, and only recognizable http(s) links are
 * touched. Skips mailto:/tel:/#anchors (safeHttpUrl rejects them), the one-click unsubscribe link (so
 * RFC 8058 semantics are preserved), and our own click endpoint (no self-loop). The caller still wraps
 * this in try/catch so any surprise falls back to the original html.
 */
export function injectTracking(html: string, token: string, baseUrl: string): string {
  if (!html || !token || !baseUrl) return html
  const base = baseUrl.replace(/\/+$/, '')
  if (!base) return html
  const clickBase = `${base}/e/c/${token}`

  // Rewrite each <a ... href="URL"> to the click endpoint. [^>]*? stays within one tag (never crosses
  // '>'), and (.*?) is non-greedy up to the matching quote, so this is linear, not catastrophic.
  let out = html.replace(
    /(<a\b[^>]*?\shref=)(["'])(.*?)\2/gi,
    (whole: string, pre: string, quote: string, rawUrl: string) => {
      const safe = safeHttpUrl(rawUrl)
      if (!safe) return whole // mailto:/tel:/#/javascript: etc. — leave untouched
      // Never wrap the unsubscribe link (one-click semantics) or our own tracker (self-loop).
      if (safe.includes('/e/c/') || safe.includes('/unsubscribe')) return whole
      return `${pre}${quote}${clickBase}?u=${encodeURIComponent(safe)}${quote}`
    },
  )

  const pixel = pixelTag(base, token)
  out = /<\/body\s*>/i.test(out) ? out.replace(/<\/body\s*>/i, `${pixel}$&`) : out + pixel
  return out
}

// ── Record (service-role, best-effort void) ──────────────────────────────────────────────────────

type EventKind = 'open' | 'click' | 'reply'
const EVENT_KINDS: readonly EventKind[] = ['open', 'click', 'reply']

/**
 * Write one space_email_events row. Service-role, FAIL-SAFE void: any error is logged and swallowed so a
 * tracking write can never throw into an endpoint or the send loop. A click carries the original URL
 * (bounded); open/reply carry none. A missing space/send id or unknown kind is a no-op.
 */
export async function recordEmailEvent(evt: {
  spaceId: string
  sendId: string
  email: string | null
  kind: EventKind
  url?: string | null
}): Promise<void> {
  try {
    if (!evt?.spaceId || !evt?.sendId) return
    if (!EVENT_KINDS.includes(evt.kind)) return
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }> }
    }
    await db.from('space_email_events').insert([
      {
        space_id: evt.spaceId,
        send_id: evt.sendId,
        contact_email: evt.email ? evt.email.trim().toLowerCase() : null,
        kind: evt.kind,
        url: evt.kind === 'click' && evt.url ? evt.url.slice(0, 2048) : null,
      },
    ])
  } catch (err) {
    console.error('[spaces/email-tracking] recordEmailEvent failed:', err instanceof Error ? err.message : String(err))
  }
}

/** Resolve the { spaceId, email } of a send row by id, so an endpoint can attribute a decoded token's
 *  event without trusting any client input. FAIL-SAFE to null on any miss/error. */
export async function resolveSendForTracking(
  sendId: string,
): Promise<{ spaceId: string; email: string | null } | null> {
  if (!sendId) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { space_id?: string; email?: string | null } | null }>
          }
        }
      }
    }
    const { data } = await db.from('outreach_sends').select('space_id, email').eq('id', sendId).maybeSingle()
    if (!data?.space_id) return null
    return { spaceId: data.space_id, email: data.email ?? null }
  } catch {
    return null
  }
}

/**
 * Attribute an inbound REPLY to a Space send: find the most recent outreach_sends row for this address
 * (optionally within a Space) and log a 'reply' event against it. Called best-effort by the inbound-email
 * webhook seam (lib/crm/inbox.ts). FAIL-SAFE void: no matching send => nothing recorded, never throws.
 */
export async function recordInboundReplyEvent(email: string, spaceId?: string | null): Promise<void> {
  try {
    const addr = (email ?? '').trim().toLowerCase()
    if (!addr) return
    type SendLookup = {
      eq: (col: string, val: string) => SendLookup
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: { id: string; space_id: string }[] | null }>
      }
    }
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => SendLookup }
    }
    let q = db.from('outreach_sends').select('id, space_id').eq('email', addr)
    if (spaceId) q = q.eq('space_id', spaceId)
    const { data } = await q.order('created_at', { ascending: false }).limit(1)
    const row = data?.[0]
    if (!row?.id || !row?.space_id) return
    await recordEmailEvent({ spaceId: row.space_id, sendId: row.id, email: addr, kind: 'reply' })
  } catch (err) {
    console.error(
      '[spaces/email-tracking] recordInboundReplyEvent failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}
