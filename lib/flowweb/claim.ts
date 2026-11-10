// FlowWeb lead hunts: the claim-link builder (FlowWeb rows FW-C-041 and FW-C-044, this repo's LIVE-2251).
// FlowWeb sends hunt messages itself, one at a time from the founder's own mailbox; Frequency never mails
// them (Resend's rules ban cold outreach). For a hunt with build on, FlowWeb's sender POSTs the finished
// item here first, signed with FLOWWEB_CLAIM_SECRET. Frequency posts the found event on behalf of its
// organizer through the existing poster-events claim spine (lib/events/event-drafts.ts) and answers its
// one-time claim link, which the sender puts in the {{claim_url}} slot. Gates:
//   • the switch FLOWWEB_CLAIM_ENABLED is off by default (envFlag),
//   • the address must not be suppressed (global or the root Space's own opt-outs),
//   • the item must carry FlowWeb's "reply no" line, the page the address came from and the claim slot.
// The pure parts are exported for the probe; all IO is injected.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const CLAIM_SLOT = '{{claim_url}}'
// Domain labels hold no dot, so every character has one place to match: linear time on any input.
const EMAIL_RE = /^[^@\s<>"]+@[^@\s<>".]+(?:\.[^@\s<>".]+)+$/
const MAX_SKEW_MS = 5 * 60_000

export interface ClaimItem {
  id: string
  to: string
  name: string | null
  sourceUrl: string
  event: { title: string; startsAt: string | null; url: string }
  huntId: string | null
}

type ClaimResult =
  | { status: 'built'; claimUrl: string; eventUrl: string }
  | { status: 'suppressed' | 'off' }
  | { status: 'refused'; reason: string }

/** True when `sig` is the hex HMAC-SHA256 of `${ts}.${body}` under the secret, and ts is fresh. */
export function verifySignature(secret: string, ts: string, body: string, sig: string, now = Date.now()): boolean {
  if (!secret || !/^\d{10,13}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false
  const t = ts.length === 13 ? Number(ts) : Number(ts) * 1000
  if (Math.abs(now - t) > MAX_SKEW_MS) return false
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isHttp = (s: string) => /^https?:\/\/\S+$/i.test(s) && URL.canParse(s)

/** FlowWeb's outbox item, checked: only a build item with its opt-out, source page and claim slot. */
export function parseItem(raw: unknown): ClaimItem | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'the body is not a JSON object' }
  const o = raw as Record<string, unknown>
  const lead = (o.lead && typeof o.lead === 'object' ? o.lead : {}) as Record<string, unknown>
  const ev = (lead.event && typeof lead.event === 'object' ? lead.event : {}) as Record<string, unknown>
  const id = str(o.id)
  const to = str(lead.to).toLowerCase()
  const body = typeof o.body === 'string' ? o.body : ''
  const sourceUrl = str(lead.source_url)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return { error: 'id must be 1-100 letters, digits, _ or -' }
  if (to.length > 254 || !EMAIL_RE.test(to)) return { error: 'lead.to is not an email address' }
  if (!isHttp(sourceUrl)) return { error: 'lead.source_url must be the public page the address came from' }
  if (lead.build !== true || !body.includes(CLAIM_SLOT)) return { error: 'only a build item with a {{claim_url}} slot gets a claim link' }
  if (!/reply "?no"?/i.test(body)) return { error: 'body has no "reply no" opt-out line' }
  if (!body.includes(sourceUrl)) return { error: 'body does not say where the address came from' }
  return {
    id,
    to,
    name: str(lead.name) || null,
    sourceUrl,
    event: { title: str(ev.title), startsAt: str(ev.starts_at) || null, url: str(ev.url) },
    huntId: str(lead.hunt_id) || null,
  }
}

export interface ClaimDeps {
  enabled: () => boolean
  isSuppressed: (email: string) => Promise<boolean>
  /** Posts the event for its organizer and returns its claim and public links, or null on failure. */
  buildEvent: (item: ClaimItem) => Promise<{ claimUrl: string; eventUrl: string } | null>
}

/** One item through the gates, in order: switch, suppression, build. Retries reuse the same event. */
export async function buildClaim(item: ClaimItem, d: ClaimDeps): Promise<ClaimResult> {
  if (!d.enabled()) return { status: 'off' }
  if (await d.isSuppressed(item.to)) return { status: 'suppressed' }
  const built = await d.buildEvent(item)
  if (!built) return { status: 'refused', reason: 'the event page could not be built' }
  return { status: 'built', ...built }
}
