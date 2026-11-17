// WHO READ THE PRIVATE PAGES, and what they clicked (owner 2026-11-17: "track every reader and click on
// the private pages"). Reads the first-party how.* rows the beacon writes (app/api/how/beacon, one row
// per event in engagement_events, actor null) and folds them into one row per reader for the admin
// Private pages section of /admin/growth. A reader is the ?r= code when the link carried one, else the
// visit's random session id, so an untagged visit still shows up as its own line.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PrivateEventRow { event_type: string; created_at: string; context: Record<string, unknown> | null }

export interface ReaderSummary {
  /** The ?r= code, or 'visit:<sid>' for a link without one. */
  reader: string
  tagged: boolean
  pages: string[]
  firstSeen: string
  lastSeen: string
  visits: number
  engagedS: number
  maxPct: number
  finished: boolean
  clicks: number
  device: string
}

export interface ClickRow { at: string; reader: string; page: string; kind: string; label: string; target: string }

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

/** Fold raw how.* rows into readers and a click log, newest first. PURE. */
export function summarizePrivateReads(rows: PrivateEventRow[]): { readers: ReaderSummary[]; clicks: ClickRow[] } {
  const by = new Map<string, ReaderSummary & { sids: Set<string>; pageSet: Set<string> }>()
  const clicks: ClickRow[] = []
  for (const r of rows) {
    const c = r.context ?? {}
    const ref = str(c.ref)
    const sid = str(c.sid)
    const reader = ref || `visit:${sid.slice(0, 8) || 'unknown'}`
    const page = str(c.page) || '/how'
    let s = by.get(reader)
    if (!s) {
      s = { reader, tagged: !!ref, pages: [], pageSet: new Set(), sids: new Set(), firstSeen: r.created_at, lastSeen: r.created_at, visits: 0, engagedS: 0, maxPct: 0, finished: false, clicks: 0, device: '' }
      by.set(reader, s)
    }
    s.pageSet.add(page)
    if (sid) s.sids.add(sid)
    if (r.created_at < s.firstSeen) s.firstSeen = r.created_at
    if (r.created_at > s.lastSeen) s.lastSeen = r.created_at
    if (r.event_type === 'how.view' && !s.device) s.device = str(c.device)
    if (r.event_type === 'how.heartbeat' || r.event_type === 'how.exit' || r.event_type === 'how.complete') s.engagedS = Math.max(s.engagedS, num(c.engaged_s))
    if (r.event_type === 'how.scroll_depth') s.maxPct = Math.max(s.maxPct, num(c.pct))
    if (r.event_type === 'how.exit') s.maxPct = Math.max(s.maxPct, num(c.max_pct))
    if (r.event_type === 'how.complete') s.finished = true
    if (r.event_type === 'how.link_click') {
      s.clicks += 1
      clicks.push({ at: r.created_at, reader, page, kind: str(c.kind), label: str(c.label), target: str(c.target) })
    }
  }
  const readers = [...by.values()].map(({ sids, pageSet, ...s }) => ({ ...s, visits: Math.max(1, sids.size), pages: [...pageSet].sort() }))
  readers.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1))
  clicks.sort((a, b) => (a.at < b.at ? 1 : -1))
  return { readers, clicks }
}

/** The last 90 days of private-page events (capped), folded. Fails soft to empty. */
export async function loadPrivateReads(): Promise<{ readers: ReaderSummary[]; clicks: ClickRow[]; capped: boolean }> {
  const LIMIT = 20000
  const since = new Date(Date.now() - 90 * 86400_000).toISOString()
  const { data, error } = await createAdminClient()
    .from('engagement_events')
    .select('event_type, created_at, context')
    .like('event_type', 'how.%')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (error || !data) return { readers: [], clicks: [], capped: false }
  return { ...summarizePrivateReads(data as PrivateEventRow[]), capped: data.length >= LIMIT }
}
