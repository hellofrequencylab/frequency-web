// First-touch attribution capture — runs at the edge (proxy.ts), so the very first
// thing we learn about an anonymous visitor (the campaign / referrer / landing page
// that brought them) is recorded before anything else and survives the whole
// sign-in round-trip. Best practice: capture on arrival, never overwrite.
//
// Edge-safe: pure, no server-only imports. Returns the cookie value to set; the
// caller (proxy) writes it onto the response.

export const FIRST_TOUCH_COOKIE = 'fq_attr'
/** High-level channel hint dropped by entry routes (qr/referral/event). */
export const CHANNEL_COOKIE = 'fq_src'
/** First-touch is immutable for the member's life of the cookie. */
export const FIRST_TOUCH_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

/** The compact first-touch record we persist (keys kept short for the cookie). */
export interface FirstTouch {
  /** ISO timestamp of the first visit. */
  ts: string
  /** Landing path (no query) — the entry route. */
  landing: string
  /** Referrer URL, if any. */
  ref?: string
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
  }
  /** Ad-click identifiers (Google / Meta) — proof of paid arrival. */
  gclid?: string
  fbclid?: string
  /** The dynamic-code slug that brought them, when arrival was a /q scan (ADR-107). */
  code?: string
}

const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'] as const

function clip(v: string | null, max = 200): string | undefined {
  if (!v) return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

/**
 * Build the first-touch record from a request URL + referrer, or return null when
 * there's nothing worth a cookie write (cookie already exists is checked by the
 * caller). Always returns a record for a genuine first visit — even a "direct" one
 * — so we always have a landing + timestamp baseline.
 */
export function buildFirstTouch(params: URLSearchParams, pathname: string, referrer: string | null): FirstTouch {
  const utm: NonNullable<FirstTouch['utm']> = {}
  for (const k of UTM_KEYS) {
    const v = clip(params.get(`utm_${k}`))
    if (v) utm[k] = v
  }
  const touch: FirstTouch = { ts: new Date().toISOString(), landing: pathname.slice(0, 200) }
  if (Object.keys(utm).length) touch.utm = utm
  const ref = clip(referrer, 300)
  if (ref) touch.ref = ref
  const gclid = clip(params.get('gclid'), 200)
  if (gclid) touch.gclid = gclid
  const fbclid = clip(params.get('fbclid'), 200)
  if (fbclid) touch.fbclid = fbclid
  return touch
}

/** Serialize for the cookie (URL-encoded JSON). */
export function encodeFirstTouch(touch: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(touch))
}

/** Parse a first-touch cookie value back to a record (best-effort). */
export function decodeFirstTouch(value: string | undefined | null): FirstTouch | null {
  if (!value || value.length > 8192) return null
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(value))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const record = raw as Record<string, unknown>
    if (typeof record.ts !== 'string' || record.ts.length > 40 || !Number.isFinite(Date.parse(record.ts))) return null
    if (typeof record.landing !== 'string' || !record.landing.startsWith('/') || record.landing.startsWith('//') || record.landing.length > 200) return null
    const touch: FirstTouch = { ts: record.ts, landing: record.landing.split(/[?#]/, 1)[0] }
    for (const key of ['ref', 'gclid', 'fbclid', 'code'] as const) {
      const v = record[key]
      if (v === undefined || v === null) continue
      if (typeof v !== 'string' || v.length > (key === 'ref' ? 300 : 200)) return null
      if (v.trim()) touch[key] = v.trim()
    }
    if (record.utm !== undefined && record.utm !== null) {
      if (typeof record.utm !== 'object' || Array.isArray(record.utm)) return null
      const rawUtm = record.utm as Record<string, unknown>
      const utm: NonNullable<FirstTouch['utm']> = {}
      for (const key of UTM_KEYS) {
        const v = rawUtm[key]
        if (v === undefined || v === null) continue
        if (typeof v !== 'string' || v.length > 200) return null
        if (v.trim()) utm[key] = v.trim()
      }
      if (Object.keys(utm).length) touch.utm = utm
    }
    return touch
  } catch {
    return null
  }
}
