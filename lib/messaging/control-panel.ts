// The MESSAGING CONTROL PANEL view-model (CRM Master Build Plan §Phase 5, ask #10 — the unified
// "who-got-what"). Four ledgers already record every outbound touch, unassembled:
//   • outreach_sends     — per-recipient email status for a Space campaign send.
//   • dispatch_recipients— per-recipient send-gate outcome for a broadcast Dispatch (CRM Phase 5).
//   • email_events       — opens / clicks / bounces (the Resend webhook ledger).
//   • notification_queue — the in-flight async lane (queued / processing jobs).
// This composes them into ONE recipient ledger + KPI counts + an in-flight summary, so an operator
// can answer "what is going / went to whom" in one place. READ-ONLY and FAIL-SAFE: every read
// returns an empty result on any error (a missing table before a migration applies, a transient
// failure) so the panel never throws. Server-only. No new tables of its own.

import { createAdminClient } from '@/lib/supabase/admin'
import { listCampaigns } from '@/lib/studio/campaigns'

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────────────

/** The unified per-recipient status the panel shows, most-engaged last. `queued` is an in-flight job;
 *  `opened` / `clicked` / `bounced` are upgraded from email_events; the rest are send-gate outcomes. */
export type TouchStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'skipped'
  | 'suppressed'
  | 'failed'

export const TOUCH_STATUSES: readonly TouchStatus[] = [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'skipped',
  'suppressed',
  'failed',
]

/** One recipient touch: who got what, through which surface, and where it landed. */
export interface RecipientTouch {
  id: string
  /** Which surface sent it: a Campaign (Space email) or a Dispatch (place-tree broadcast). */
  source: 'campaign' | 'dispatch'
  /** email | push. */
  channel: string
  /** The person: their email, or a member display name for a push-only row. */
  recipient: string
  status: TouchStatus
  /** The gate reason / error note, when the status carries one. */
  reason: string | null
  /** The campaign / dispatch this touch belongs to (for the "by campaign" filter + grouping). */
  refId: string | null
  refLabel: string | null
  /** ISO timestamp the touch was recorded. */
  at: string
}

/** The filters the panel supports, all optional. */
export interface ControlPanelFilters {
  /** A campaign or dispatch id to scope to (the "by campaign" filter). */
  ref?: string | null
  /** A person / email substring (the "by person" filter). */
  q?: string | null
  /** A single status to scope to, or 'all' / null for every status (the "by status" filter). */
  status?: TouchStatus | 'all' | null
}

export interface ControlPanelCounts {
  recipients: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  skipped: number
  inFlight: number
}

export interface ControlPanelData {
  touches: RecipientTouch[]
  counts: ControlPanelCounts
  inFlight: { pending: number; processing: number; byKind: { kind: string; count: number }[] }
  /** The campaigns + dispatches available in the "by campaign" filter. */
  refOptions: { id: string; label: string; kind: 'campaign' | 'dispatch' }[]
  filters: ControlPanelFilters
}

// How many recent recipient rows the ledger scans/shows. A recency window, not an attribution rule.
const LEDGER_LIMIT = 250

// ── Fail-safe readers over the untyped admin client (ADR-246 for not-yet-typed tables) ───────────

function db(): ReturnType<typeof createAdminClient> {
  return createAdminClient()
}

interface OutreachRow {
  id: string
  campaign_id: string | null
  email: string
  status: string
  error: string | null
  created_at: string
}

/** Recent per-recipient Space campaign sends. FAIL-SAFE to []. */
async function readOutreachSends(limit: number): Promise<OutreachRow[]> {
  try {
    const { data, error } = await db()
      .from('outreach_sends')
      .select('id, campaign_id, email, status, error, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data as unknown as OutreachRow[]
  } catch {
    return []
  }
}

interface DispatchRecipientRow {
  id: string
  dispatch_id: string
  profile_id: string | null
  channel: string
  status: string
  reason: string | null
  email: string | null
  created_at: string
}

/** Recent per-recipient Dispatch fan-out rows. FAIL-SAFE to [] (incl. before the table exists). */
async function readDispatchRecipients(limit: number): Promise<DispatchRecipientRow[]> {
  try {
    const handle = db() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: DispatchRecipientRow[] | null; error: unknown }> }
        }
      }
    }
    const { data, error } = await handle
      .from('dispatch_recipients')
      .select('id, dispatch_id, profile_id, channel, status, reason, email, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** The composite key for exact engagement attribution: `<campaignId>|<lowercased email>`. Keying by
 *  campaign id AND email (not email alone) prevents a different campaign's open from cross-attributing
 *  here, the same doctrine as lib/email-studio/analytics.ts. Pure. */
export function engagementKey(campaignId: string | null | undefined, email: string): string {
  return `${campaignId ?? ''}|${email.trim().toLowerCase()}`
}

/**
 * `<campaignId>|<email>` -> the strongest engagement event (bounced > clicked > opened > delivered)
 * from the webhook ledger. EXACT: only events carrying this campaign's id upgrade its row. FAIL-SAFE
 * to an empty map (e.g. before the campaign_id column exists), so touches simply keep their send
 * status.
 */
async function readEngagement(emails: string[]): Promise<Map<string, TouchStatus>> {
  const out = new Map<string, TouchStatus>()
  const unique = [...new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return out
  // Rank so a later, weaker event never downgrades a stronger one already seen.
  const rank: Record<string, number> = { delivered: 1, opened: 2, clicked: 3, bounced: 4 }
  try {
    const { data, error } = await (
      db() as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              col: string,
              vals: string[],
            ) => {
              limit: (
                n: number,
              ) => Promise<{ data: { email: string | null; event_type: string; campaign_id: string | null }[] | null; error: unknown }>
            }
          }
        }
      }
    )
      .from('email_events')
      .select('email, event_type, campaign_id')
      .in('email', unique)
      .limit(5000)
    if (error || !data) return out
    for (const row of data) {
      if (!row.email) continue
      const et = row.event_type
      if (!(et in rank)) continue
      const key = engagementKey(row.campaign_id, row.email)
      const prev = out.get(key)
      if (!prev || rank[et] > rank[prev]) out.set(key, et as TouchStatus)
    }
    return out
  } catch {
    return out
  }
}

/** display-name map for a set of profile ids. FAIL-SAFE to an empty map. */
async function readProfileNames(profileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(profileIds.filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const { data, error } = await db()
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)
    if (error || !data) return out
    for (const r of data as unknown as { id: string; display_name: string | null }[]) {
      out.set(r.id, r.display_name ?? 'Member')
    }
    return out
  } catch {
    return out
  }
}

/** id -> title for recent published dispatches (labels + the filter dropdown). FAIL-SAFE. */
async function readDispatchLabels(limit = 100): Promise<{ id: string; label: string }[]> {
  try {
    const { data, error } = await db()
      .from('dispatches')
      .select('id, title, published_at')
      .order('published_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return (data as unknown as { id: string; title: string }[]).map((d) => ({ id: d.id, label: d.title }))
  } catch {
    return []
  }
}

/** The in-flight async lane: pending + processing counts, grouped by job kind. FAIL-SAFE. */
async function readInFlight(): Promise<ControlPanelData['inFlight']> {
  const empty = { pending: 0, processing: 0, byKind: [] as { kind: string; count: number }[] }
  try {
    const { data, error } = await db()
      .from('notification_queue')
      .select('kind, status')
      .in('status', ['pending', 'processing'])
      .limit(5000)
    if (error || !data) return empty
    let pending = 0
    let processing = 0
    const byKind = new Map<string, number>()
    for (const r of data as unknown as { kind: string; status: string }[]) {
      if (r.status === 'pending') pending++
      else if (r.status === 'processing') processing++
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1)
    }
    return {
      pending,
      processing,
      byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    }
  } catch {
    return empty
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────────────────────────

/** Normalize a raw outreach_sends status onto the unified TouchStatus. Pure. */
export function normalizeOutreachStatus(raw: string): TouchStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'delivered') return 'delivered'
  if (s === 'bounced' || s === 'bounce') return 'bounced'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'queued' || s === 'pending' || s === 'processing') return 'queued'
  if (s === 'suppressed') return 'suppressed'
  if (s === 'skipped') return 'skipped'
  return 'sent'
}

/** Normalize a raw dispatch_recipients status onto the unified TouchStatus. Pure. */
export function normalizeDispatchStatus(raw: string): TouchStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'suppressed') return 'suppressed'
  if (s === 'skipped') return 'skipped'
  if (s === 'failed') return 'failed'
  return 'sent'
}

/** Apply the in-memory filters (person substring + status) to the assembled ledger. Pure + tested. */
export function applyTouchFilters(touches: RecipientTouch[], filters: ControlPanelFilters): RecipientTouch[] {
  const q = typeof filters.q === 'string' ? filters.q.trim().toLowerCase() : ''
  const status = filters.status && filters.status !== 'all' ? filters.status : null
  const ref = typeof filters.ref === 'string' && filters.ref.trim() ? filters.ref.trim() : null
  return touches.filter((t) => {
    if (ref && t.refId !== ref) return false
    if (status && t.status !== status) return false
    if (q) {
      const hay = `${t.recipient} ${t.refLabel ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

// ── Public: assemble the panel ────────────────────────────────────────────────────────────────────

/**
 * Assemble the control panel: the unified recipient ledger (campaign sends + dispatch fan-outs,
 * engagement-upgraded from email_events), KPI counts, the in-flight async lane, and the filter
 * options. Read-only + fail-safe throughout. The CALLER (a staff-gated admin page) has authorized
 * the read; this composes service-role ledgers, never widening what an operator can see.
 */
export async function getControlPanel(filters: ControlPanelFilters = {}): Promise<ControlPanelData> {
  const [outreach, dispatchRows, campaigns, dispatchLabels, inFlight] = await Promise.all([
    readOutreachSends(LEDGER_LIMIT),
    readDispatchRecipients(LEDGER_LIMIT),
    listCampaigns(100).catch(() => []),
    readDispatchLabels(100),
    readInFlight(),
  ])

  const campaignLabel = new Map(campaigns.map((c) => [c.id, c.subject]))
  const dispatchLabel = new Map(dispatchLabels.map((d) => [d.id, d.label]))

  // Upgrade campaign email rows with engagement (opened/clicked/bounced) from the webhook ledger.
  const engagement = await readEngagement(outreach.map((o) => o.email))

  const campaignTouches: RecipientTouch[] = outreach.map((o) => {
    const base = normalizeOutreachStatus(o.status)
    const upgraded = engagement.get(engagementKey(o.campaign_id, o.email))
    // Only ever UPGRADE (a real bounce/click/open beats "sent"); never downgrade a delivered row.
    const status: TouchStatus = upgraded ?? base
    return {
      id: `os_${o.id}`,
      source: 'campaign',
      channel: 'email',
      recipient: o.email,
      status,
      reason: o.error,
      refId: o.campaign_id,
      refLabel: o.campaign_id ? campaignLabel.get(o.campaign_id) ?? 'Campaign' : null,
      at: o.created_at,
    }
  })

  const names = await readProfileNames(
    dispatchRows.map((d) => d.profile_id).filter((p): p is string => Boolean(p)),
  )

  const dispatchTouches: RecipientTouch[] = dispatchRows.map((d) => ({
    id: `dr_${d.id}`,
    source: 'dispatch',
    channel: d.channel,
    recipient: d.email ?? (d.profile_id ? names.get(d.profile_id) ?? 'Member' : 'Member'),
    status: normalizeDispatchStatus(d.status),
    reason: d.reason,
    refId: d.dispatch_id,
    refLabel: dispatchLabel.get(d.dispatch_id) ?? 'Dispatch',
    at: d.created_at,
  }))

  const all = [...campaignTouches, ...dispatchTouches].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
  const touches = applyTouchFilters(all, filters).slice(0, LEDGER_LIMIT)

  // KPI counts over the FILTERED ledger, so the tiles agree with what the table shows.
  const counts: ControlPanelCounts = {
    recipients: touches.length,
    delivered: touches.filter((t) => t.status === 'delivered' || t.status === 'opened' || t.status === 'clicked').length,
    opened: touches.filter((t) => t.status === 'opened' || t.status === 'clicked').length,
    clicked: touches.filter((t) => t.status === 'clicked').length,
    bounced: touches.filter((t) => t.status === 'bounced').length,
    skipped: touches.filter((t) => t.status === 'skipped' || t.status === 'suppressed').length,
    inFlight: inFlight.pending + inFlight.processing,
  }

  const refOptions = [
    ...campaigns.map((c) => ({ id: c.id, label: c.subject, kind: 'campaign' as const })),
    ...dispatchLabels.map((d) => ({ id: d.id, label: d.label, kind: 'dispatch' as const })),
  ]

  return { touches, counts, inFlight, refOptions, filters }
}
