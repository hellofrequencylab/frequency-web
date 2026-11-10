// FlowWeb lead-hunt outreach: the sending half of FlowWeb's hunts (FlowWeb row FW-C-041, this repo's
// LIVE-2251). FlowWeb runs on the founder's Mac and never sends; at Autopilot its relay POSTs one
// finished message here, signed with FLOWWEB_OUTREACH_SECRET. Frequency is the sender of record, so the
// legal and deliverability rules live here, not in FlowWeb:
//   • the switch FLOWWEB_OUTREACH_ENABLED is off by default (envFlag),
//   • the address must not be suppressed (global or the root Space's own opt-outs),
//   • a daily cap (FLOWWEB_OUTREACH_DAILY_CAP, default 50),
//   • replies reach a person (FLOWWEB_OUTREACH_REPLY_TO is required: the opt-out is "reply no"),
//   • every message carries the one-click unsubscribe and the postal address,
//   • the message must already carry FlowWeb's "reply no" line and the page the address came from.
// With build on, Frequency first posts the found event on behalf of its organizer (the existing
// poster-events claim spine, lib/events/event-drafts.ts) and fills {{claim_url}} with its one-time
// claim link. The pure parts are exported for the probe; all IO is injected.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const CLAIM_SLOT = '{{claim_url}}'
// Domain labels hold no dot, so every character has one place to match: linear time on any input.
const EMAIL_RE = /^[^@\s<>"]+@[^@\s<>".]+(?:\.[^@\s<>".]+)+$/
const MAX_SKEW_MS = 5 * 60_000

export interface OutreachItem {
  id: string
  to: string
  name: string | null
  subject: string
  body: string
  sourceUrl: string
  event: { title: string; startsAt: string | null; url: string }
  region: string | null
  build: boolean
  huntId: string | null
}

type OutreachResult =
  | { status: 'sent'; claimUrl: string | null; eventUrl: string | null }
  | { status: 'suppressed' | 'capped' | 'off' }
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

/** FlowWeb's outbox item, checked. Takes either the outbox file or its `lead` folded in. */
export function parseItem(raw: unknown): OutreachItem | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'the body is not a JSON object' }
  const o = raw as Record<string, unknown>
  const lead = (o.lead && typeof o.lead === 'object' ? o.lead : {}) as Record<string, unknown>
  const ev = (lead.event && typeof lead.event === 'object' ? lead.event : {}) as Record<string, unknown>
  const id = str(o.id)
  const to = str(lead.to).toLowerCase()
  const body = typeof o.body === 'string' ? o.body.trim() : ''
  const sourceUrl = str(lead.source_url)
  const subject = str(lead.subject) || `About ${str(ev.title) || 'your event'}`
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return { error: 'id must be 1-100 letters, digits, _ or -' }
  if (!EMAIL_RE.test(to)) return { error: 'lead.to is not an email address' }
  if (!isHttp(sourceUrl)) return { error: 'lead.source_url must be the public page the address came from' }
  if (!body || body.length > 5000) return { error: 'body is empty or too long' }
  if (!/reply "?no"?/i.test(body)) return { error: 'body has no "reply no" opt-out line' }
  if (!body.includes(sourceUrl)) return { error: 'body does not say where the address came from' }
  if (subject.length > 200 || /[\r\n]/.test(subject)) return { error: 'subject is too long or has a line break' }
  const build = lead.build === true
  if (build !== body.includes(CLAIM_SLOT)) return { error: 'build and the {{claim_url}} slot disagree' }
  return {
    id,
    to,
    name: str(lead.name) || null,
    subject,
    body,
    sourceUrl,
    event: { title: str(ev.title), startsAt: str(ev.starts_at) || null, url: str(ev.url) },
    region: str(lead.region) || null,
    build,
    huntId: str(lead.hunt_id) || null,
  }
}

/** The final text: the claim link in its slot, then the unsubscribe link and the postal address. */
export function renderText(item: OutreachItem, claimUrl: string | null, unsubscribeUrl: string, postal: string): string {
  const body = item.build ? item.body.split(CLAIM_SLOT).join(claimUrl ?? '') : item.body
  return `${body}\n\nUnsubscribe: ${unsubscribeUrl}\n${postal}`
}

export interface OutreachDeps {
  enabled: () => boolean
  replyTo: () => string | null
  dailyCap: () => number
  isSuppressed: (email: string) => Promise<boolean>
  sentToday: () => Promise<number>
  /** Posts the event for its organizer and returns its claim and public links, or null on failure. */
  buildEvent: (item: OutreachItem) => Promise<{ claimUrl: string; eventUrl: string } | null>
  unsubscribeUrl: (email: string) => Promise<string | null>
  postal: string
  send: (mail: { to: string; subject: string; text: string; replyTo: string; unsubscribeUrl: string; dedupeKey: string }) => Promise<void>
  record: (item: OutreachItem, status: 'queued' | 'suppressed') => Promise<void>
}

/**
 * One item through every gate, in order: switch, reply-to, suppression, daily cap, build, send. Any
 * gate that says no returns without sending. The send is the last line and is deduped on the item id,
 * so a retried POST never mails twice.
 */
export async function sendOutreach(item: OutreachItem, d: OutreachDeps): Promise<OutreachResult> {
  if (!d.enabled()) return { status: 'off' }
  const replyTo = d.replyTo()
  if (!replyTo) return { status: 'refused', reason: 'FLOWWEB_OUTREACH_REPLY_TO is not set, so a "reply no" would reach nobody' }
  if (await d.isSuppressed(item.to)) {
    await d.record(item, 'suppressed')
    return { status: 'suppressed' }
  }
  if ((await d.sentToday()) >= d.dailyCap()) return { status: 'capped' }
  const unsubscribeUrl = await d.unsubscribeUrl(item.to)
  if (!unsubscribeUrl) return { status: 'refused', reason: 'no unsubscribe link could be made' }
  let built: { claimUrl: string; eventUrl: string } | null = null
  if (item.build) {
    built = await d.buildEvent(item)
    if (!built) return { status: 'refused', reason: 'the event page could not be built' }
  }
  const text = renderText(item, built?.claimUrl ?? null, unsubscribeUrl, d.postal)
  await d.send({ to: item.to, subject: item.subject, text, replyTo, unsubscribeUrl, dedupeKey: `flowweb:${item.id}` })
  await d.record(item, 'queued')
  return { status: 'sent', claimUrl: built?.claimUrl ?? null, eventUrl: built?.eventUrl ?? null }
}
