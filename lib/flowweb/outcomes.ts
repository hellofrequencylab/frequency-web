// FlowWeb outcomes (LIVE-2255): what became of the people FlowWeb's messages reached, counted per tag, so
// FlowWeb's weekly review can tell which hunt, message and region worked. A FlowWeb link carries
// utm_source=flowweb, utm_campaign (a hunt or region id) and utm_content (the draft id); /start pages store
// them on the lead (contacts.meta.funnel) and the induction copies them onto the member (profiles.meta.funnel).
//
// Counts only. No name, email or profile id leaves Frequency through this module: a row is a tag pair and
// four numbers. PURE (no Supabase / Next imports); the route reads the rows.

const MAX_WINDOW_DAYS = 365
const DEFAULT_WINDOW_DAYS = 90
const DAY = 86_400_000

interface OutcomeLead {
  meta: unknown
}
interface OutcomeMember {
  id: string
  meta: unknown
  membership_tier: string | null
}

/** One tag pair's numbers. `content` is null for links sent before drafts were tagged. */
interface OutcomeRow {
  campaign: string | null
  content: string | null
  medium: string | null
  src: string | null
  /** People who left their details on a /start page. */
  leads: number
  /** People who finished signing up. */
  members: number
  /** Members who have hosted at least one published event. */
  hosts: number
  /** Members on any paid plan. */
  paid: number
}

type Tag = { campaign: string | null; content: string | null; medium: string | null; src: string | null }

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** The FlowWeb tag a lead or member carries, or null when FlowWeb did not bring them. */
function flowwebTagOf(meta: unknown): Tag | null {
  if (!meta || typeof meta !== 'object') return null
  const f = (meta as Record<string, unknown>).funnel
  if (!f || typeof f !== 'object') return null
  const r = f as Record<string, unknown>
  if (r.utm_source !== 'flowweb') return null
  return { campaign: str(r.utm_campaign), content: str(r.utm_content), medium: str(r.utm_medium), src: str(r.src) }
}

export function computeOutcomes(input: {
  leads: readonly OutcomeLead[]
  members: readonly OutcomeMember[]
  hostIds: ReadonlySet<string>
}): OutcomeRow[] {
  const rows = new Map<string, OutcomeRow>()
  const rowFor = (t: Tag) => {
    const key = `${t.campaign ?? ''}\u0000${t.content ?? ''}`
    let row = rows.get(key)
    if (!row) {
      row = { ...t, leads: 0, members: 0, hosts: 0, paid: 0 }
      rows.set(key, row)
    }
    row.medium ??= t.medium
    row.src ??= t.src
    return row
  }
  for (const l of input.leads) {
    const t = flowwebTagOf(l.meta)
    if (t) rowFor(t).leads++
  }
  for (const m of input.members) {
    const t = flowwebTagOf(m.meta)
    if (!t) continue
    const row = rowFor(t)
    row.members++
    if (input.hostIds.has(m.id)) row.hosts++
    if ((m.membership_tier ?? 'free') !== 'free') row.paid++
  }
  return [...rows.values()].sort(
    (a, b) => (a.campaign ?? '').localeCompare(b.campaign ?? '') || (a.content ?? '').localeCompare(b.content ?? ''),
  )
}

/** FlowWeb's request: `{ "since": ISO date }`, optional, at most a year back. Defaults to 90 days. */
export function parseOutcomesRequest(raw: unknown, now = new Date()): { since: Date } | { error: string } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return { error: 'the body is not a JSON object' }
  if (o.since === undefined) return { since: new Date(now.getTime() - DEFAULT_WINDOW_DAYS * DAY) }
  const since = typeof o.since === 'string' ? new Date(o.since) : new Date(Number.NaN)
  if (Number.isNaN(since.getTime())) return { error: 'since must be an ISO date' }
  if (since.getTime() > now.getTime()) return { error: 'since is in the future' }
  if (now.getTime() - since.getTime() > MAX_WINDOW_DAYS * DAY) return { error: `since is more than ${MAX_WINDOW_DAYS} days back` }
  return { since }
}
