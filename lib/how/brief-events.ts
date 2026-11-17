// The /how advisor brief's engagement events. A link-only, noindex page whose readers are mostly
// signed out, so the member-tied sinks (/api/track, /api/observe) would drop every event. These
// go through /api/how/beacon instead: anonymous, cookie-free (a per-tab random sid), consent-gated
// by the same request policy as the rest of the site, and written to engagement_events via track().
// Pure + shared by the client tracker and the server route.
//
// ALL PRIVATE PAGES (owner 2026-11-17: "track every reader and click on the private pages"). The same
// how.* events now come from every link-only partner page in PRIVATE_PAGES; each batch names its page,
// and the beacon only accepts a page on this list. The ?r= reader code carries across them in one tab.

export const BRIEF_EVENT_NAMES = [
  'how.view',          // page opened (ref, utm_*, referrer_host, device, vw, vh, returning, visit)
  'how.section_view',  // a section reached 40% visibility (section, idx, at_s)
  'how.section_dwell', // time a section was on screen, sent when it leaves (section, ms)
  'how.scroll_depth',  // 25 / 50 / 75 / 90 / 100 (pct, at_s)
  'how.heartbeat',     // every 15s of visible, engaged time (engaged_s)
  'how.calc_input',    // a slider settled (calc, key, value, total) debounced
  'how.appendix_open', // an appendix item opened (item)
  'how.link_click',    // any link, button or form submit on a private page (kind, target, label)
  'how.copy',          // text copied (section, chars)
  'how.complete',      // reached the closing section (engaged_s, sections)
  'how.exit',          // page hidden or left (engaged_s, max_pct, sections, calc_touches)
] as const

export type BriefEventName = (typeof BRIEF_EVENT_NAMES)[number]
const NAMES = new Set<string>(BRIEF_EVENT_NAMES)

/** The link-only partner pages that send these events (lib/seo/link-only.ts carries their noindex). */
export const PRIVATE_PAGES = ['/how', '/facilities', '/lab'] as const
export type PrivatePage = (typeof PRIVATE_PAGES)[number]
const PAGES = new Set<string>(PRIVATE_PAGES)

const BRIEF_MAX_BATCH = 40
const SID = /^[a-z0-9]{8,32}$/
const REF = /^[a-z0-9-]{1,40}$/

interface BriefEvent { name: BriefEventName; props: Record<string, string | number | boolean>; t: number }
interface BriefBatch { sid: string; ref: string | null; page: PrivatePage; events: BriefEvent[] }

function cleanProps(raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 16)) {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(k)) continue
    if (typeof v === 'string') out[k] = v.slice(0, 120)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
  }
  return out
}

/** Validate a client batch. Returns null when nothing usable is left (never throws). */
export function cleanBriefBatch(body: unknown): BriefBatch | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { sid?: unknown; ref?: unknown; page?: unknown; events?: unknown }
  if (typeof b.sid !== 'string' || !SID.test(b.sid)) return null
  const ref = typeof b.ref === 'string' && REF.test(b.ref) ? b.ref : null
  // A batch with no page is the /how tracker before this field existed; an unknown page is refused.
  if (b.page !== undefined && (typeof b.page !== 'string' || !PAGES.has(b.page))) return null
  const page = (typeof b.page === 'string' ? b.page : '/how') as PrivatePage
  if (!Array.isArray(b.events)) return null
  const now = Date.now()
  const events: BriefEvent[] = []
  for (const e of b.events.slice(0, BRIEF_MAX_BATCH)) {
    const ev = e as { name?: unknown; props?: unknown; t?: unknown }
    if (typeof ev?.name !== 'string' || !NAMES.has(ev.name)) continue
    const t = typeof ev.t === 'number' && Number.isFinite(ev.t) ? Math.min(now, Math.max(now - 6 * 3600_000, ev.t)) : now
    events.push({ name: ev.name as BriefEventName, props: cleanProps(ev.props), t })
  }
  return events.length ? { sid: b.sid, ref, page, events } : null
}

/** Normalise a recipient code from ?r= so each advisor link can be told apart. */
export function cleanRef(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return v && REF.test(v) ? v : null
}
