// FlowWeb leads in the CRM (LIVE-2256). FlowWeb's lead hunts find event organizers' public addresses and
// draft one personal note each; the founder sends it from his own mailbox and marks in FlowWeb what
// happened (sent, they replied, they said no). FlowWeb's daemon POSTs each draft's whole state to
// /api/webhooks/flowweb-crm, signed with FLOWWEB_OUTCOMES_SECRET (the flowweb-claim scheme). Frequency
// keeps it as one root-Space contact per address (source 'flowweb', consent 'unknown') with one CRM
// conversation per lead: every draft is an internal note, every sent note an outbound message, a reply an
// inbound message or a note, and the thread status says where the lead is (open: drafted, waiting: sent,
// in progress: replied, resolved: signed up, closed: said no). Frequency never sends any of it.
//
// Every write is idempotent on the draft's tag, so FlowWeb can post the same draft again after each mark
// and once a day. PURE: no Supabase / Next imports. The IO lives in crm-io.ts.

const EMAIL_RE = /^[^@\s<>"]+@[^@\s<>".]+(?:\.[^@\s<>".]+)+$/
const TAG_RE = /^[a-z0-9_-]{1,48}$/
const MAX_BODY = 20_000
const MAX_LINE = 300

export type LeadStatus = 'open' | 'waiting' | 'in_progress' | 'resolved' | 'closed'

export interface CrmItem {
  flow: string
  tag: string
  email: string
  name: string | null
  org: string | null
  sourceUrl: string | null
  region: string | null
  hunt: string | null
  subject: string | null
  body: string
  createdAt: string | null
  sentAt: string | null
  repliedAt: string | null
  declinedAt: string | null
  reply: string | null
}

/** One message the thread should hold, keyed so a repeat post is a no-op. */
export interface PlannedMessage {
  key: string
  step: 'drafted' | 'sent' | 'replied' | 'declined' | 'signed_up'
  direction: 'outbound' | 'inbound' | 'internal'
  authorKind: 'staff' | 'contact' | 'system'
  body: string
  internal: boolean
  at: string | null
}

const str = (v: unknown, max = MAX_LINE) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const when = (v: unknown) => {
  const s = str(v, 40)
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null
}

/** FlowWeb's draft, checked. Only an email lead can be a CRM contact; other routes are refused. */
export function parseCrmItem(raw: unknown): CrmItem | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'the body is not a JSON object' }
  const o = raw as Record<string, unknown>
  const lead = (o.lead && typeof o.lead === 'object' ? o.lead : {}) as Record<string, unknown>
  const draft = (o.draft && typeof o.draft === 'object' ? o.draft : {}) as Record<string, unknown>
  const email = str(lead.email, 320)?.toLowerCase() ?? ''
  if (!EMAIL_RE.test(email) || /[\x00-\x1f\x7f]/.test(email)) return { error: 'lead.email is not an email address' }
  const tag = str(draft.tag, 48) ?? ''
  if (!TAG_RE.test(tag)) return { error: 'draft.tag must be 1-48 of a-z 0-9 _ -' }
  const body = typeof draft.body === 'string' ? draft.body.slice(0, MAX_BODY) : ''
  if (!body.trim()) return { error: 'draft.body is empty' }
  const url = str(lead.source_url, 2000)
  return {
    flow: str(o.flow, 60) ?? 'flowweb',
    tag,
    email,
    name: str(lead.name),
    org: str(lead.org),
    sourceUrl: url && /^https?:\/\/\S+$/i.test(url) && URL.canParse(url) ? url : null,
    region: str(lead.region, 80),
    hunt: str(lead.hunt, 80),
    subject: str(draft.subject),
    body,
    createdAt: when(draft.created_at),
    sentAt: when(draft.sent_at),
    repliedAt: when(draft.replied_at),
    declinedAt: when(draft.declined_at),
    reply: typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim().slice(0, MAX_BODY) : null,
  }
}

/** Where the lead is. Said no beats everything, then signed up, then replied, then sent. */
export function leadStatus(item: CrmItem, signedUp: boolean): LeadStatus {
  if (item.declinedAt) return 'closed'
  if (signedUp) return 'resolved'
  if (item.repliedAt) return 'in_progress'
  if (item.sentAt) return 'waiting'
  return 'open'
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : 'an unknown day')

/** The messages one draft puts on the lead's thread. Keys are unique per draft and step. */
export function planMessages(item: CrmItem, signedUp: boolean): PlannedMessage[] {
  const key = (step: string) => `<flowweb.${item.tag}.${step}@flowweb.app>`
  const out: PlannedMessage[] = [
    {
      key: key('drafted'),
      step: 'drafted',
      direction: 'internal',
      authorKind: 'system',
      internal: true,
      at: item.createdAt,
      body: `FlowWeb drafted a note${item.hunt ? ` from the hunt "${item.hunt}"` : ''}${item.sourceUrl ? `. Address found on ${item.sourceUrl}` : ''}. Not sent yet.\n\n${item.subject ? `Subject: ${item.subject}\n\n` : ''}${item.body}`,
    },
  ]
  if (item.sentAt)
    out.push({
      key: key('sent'),
      step: 'sent',
      direction: 'outbound',
      authorKind: 'staff',
      internal: false,
      at: item.sentAt,
      body: item.body,
    })
  if (item.repliedAt)
    out.push(
      item.reply
        ? { key: key('replied'), step: 'replied', direction: 'inbound', authorKind: 'contact', internal: false, at: item.repliedAt, body: item.reply }
        : {
            key: key('replied'),
            step: 'replied',
            direction: 'internal',
            authorKind: 'system',
            internal: true,
            at: item.repliedAt,
            body: `They replied (marked in FlowWeb on ${day(item.repliedAt)}). Their answer is in the founder's mailbox.`,
          },
    )
  if (item.declinedAt)
    out.push({
      key: key('declined'),
      step: 'declined',
      direction: 'internal',
      authorKind: 'system',
      internal: true,
      at: item.declinedAt,
      body: `They said no (marked in FlowWeb on ${day(item.declinedAt)}). They are on FlowWeb's do-not-contact list and Frequency's opt-outs.`,
    })
  if (signedUp && !item.declinedAt)
    out.push({
      key: key('signed_up'),
      step: 'signed_up',
      direction: 'internal',
      authorKind: 'system',
      internal: true,
      at: null,
      body: 'They signed up for Frequency.',
    })
  return out
}

/** The contact's FlowWeb record (contacts.meta.flowweb): where FlowWeb found them and its newest draft. */
export function flowwebMeta(item: CrmItem, prior: unknown): Record<string, unknown> {
  const p = prior && typeof prior === 'object' && !Array.isArray(prior) ? (prior as Record<string, unknown>) : {}
  const tags = Array.isArray(p.drafts) ? p.drafts.filter((x): x is string => typeof x === 'string') : []
  return {
    ...p,
    flow: item.flow,
    org: item.org ?? p.org ?? null,
    source_url: item.sourceUrl ?? p.source_url ?? null,
    region: item.region ?? p.region ?? null,
    hunt: item.hunt ?? p.hunt ?? null,
    drafts: tags.includes(item.tag) ? tags : [...tags, item.tag].slice(-50),
    last_draft: item.tag,
  }
}

const RANK: Record<string, number> = { open: 0, snoozed: 0, waiting: 1, in_progress: 2, resolved: 3, closed: 3 }

/** The status to write, or null to keep the thread as it is. FlowWeb only moves a thread forward, so a
 *  status someone set by hand in the Conversations workspace is never pulled back. */
export function nextStatus(current: string, target: LeadStatus): LeadStatus | null {
  if (current === target) return null
  if (target === 'closed' && current !== 'closed') return 'closed'
  return (RANK[target] ?? 0) > (RANK[current] ?? 0) ? target : null
}
