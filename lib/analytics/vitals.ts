// Core Web Vitals field capture (field RUM). ANONYMOUS BY DESIGN: a vitals row never
// carries a profile id — page performance describes the page + device, not the person —
// which is exactly what keeps it OUTSIDE the `analytics` consent scope (that scope
// governs first-party data tied to an account, lib/consent/scopes.ts). Sink:
// POST /api/vitals → interaction_events with profile_id NULL and surface NULL, so the
// member rollups (member_interaction_stats, interaction_surface_stats) ignore these
// rows by their existing filters. The 90-day retention purge already covers the table.
//
// The pure normalizer lives here (shared by the client buffer AND the API route, and
// unit-tested); the browser-only buffer is guarded by typeof window.

import { getSessionId } from './observe'

export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
export type VitalName = (typeof VITAL_NAMES)[number]
const RATINGS = ['good', 'needs-improvement', 'poor'] as const
export type VitalRating = (typeof RATINGS)[number]

/** Viewport bucket (Lift 7d). A phone and a desktop are two different products at the
 *  same URL, and a blended p75 hides whichever one is losing. Derived from the viewport
 *  WIDTH at first metric, bucketed to three values at the Tailwind md/lg breakpoints —
 *  coarse on purpose: a bucket is a property of the PAGE VIEW, never of a person, so it
 *  cannot narrow this stream toward an identity. That account-free posture is the whole
 *  reason vitals sit outside the `analytics` consent scope (ADR-922), and a bucket of
 *  three carries no more entropy than the path already does. */
export const VIEWPORT_CLASSES = ['mobile', 'tablet', 'desktop'] as const
export type ViewportClass = (typeof VIEWPORT_CLASSES)[number]

/** Pure: width in CSS px → bucket. Tailwind's md (768) and lg (1024). */
export function viewportClassForWidth(width: number): ViewportClass {
  if (!Number.isFinite(width) || width <= 0) return 'desktop'
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

/** The current viewport bucket, or null off the browser. Read at normalize time (the
 *  report callback), which is the closest we get to "the viewport this load rendered in". */
export function currentViewportClass(): ViewportClass | null {
  if (typeof window === 'undefined') return null
  return viewportClassForWidth(window.innerWidth)
}

/** ≤ the 5 metric kinds + slack for a retried metric id within one page load. */
export const MAX_VITALS_BATCH = 8

export interface CleanVital {
  name: VitalName
  /** ms for time metrics (whole), unitless 4dp for CLS. */
  value: number
  rating: VitalRating
  /** metric.id — unique per page load; dedupes retried beacons. */
  id: string
  navigationType: string | null
  /** The TEMPLATED route the page loaded on (uuids/slugs collapsed to ':id'). */
  path: string | null
  /** Viewport bucket for this page load; null when it could not be determined. */
  viewportClass: ViewportClass | null
  t: number
}

/** Collapse concrete ids so vitals group by ROUTE: uuid segments, long slugs, and
 *  purely numeric segments become ':id'. Pure. */
export function templatePath(path: string): string {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return path
    .split('/')
    .map((seg) =>
      UUID.test(seg) || /^\d+$/.test(seg) || seg.length >= 20 ? ':id' : seg,
    )
    .join('/')
    .slice(0, 300)
}

/** Validate + clamp one raw metric into a CleanVital, or null. Clamps keep a bogus
 *  client from banking absurd numbers: CLS 0..10, time metrics 0..600000ms. */
export function normalizeVital(raw: unknown): CleanVital | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = r.name as VitalName
  if (!VITAL_NAMES.includes(name)) return null
  const rating = r.rating as VitalRating
  if (!RATINGS.includes(rating)) return null
  const n = Number(r.value)
  if (!Number.isFinite(n) || n < 0) return null
  const value =
    name === 'CLS' ? Math.round(Math.min(n, 10) * 10000) / 10000 : Math.round(Math.min(n, 600_000))
  const id = typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : null
  if (!id) return null
  // Trust an explicit bucket from the caller (so the API route can re-normalize a
  // posted batch without inventing one), else read the live viewport. Never guess on
  // the server: an absent bucket stays null rather than defaulting to desktop.
  const sent = VIEWPORT_CLASSES.includes(r.viewportClass as ViewportClass)
    ? (r.viewportClass as ViewportClass)
    : null
  return {
    name,
    value,
    rating,
    id,
    navigationType:
      typeof r.navigationType === 'string' ? r.navigationType.slice(0, 24) : null,
    path: typeof r.path === 'string' ? r.path.slice(0, 300) : null,
    viewportClass: sent ?? currentViewportClass(),
    t: Number.isFinite(Number(r.t)) ? Number(r.t) : Date.now(),
  }
}

/** The `interaction_events.props` bag one vital becomes. Kept here beside the
 *  normalizer so the sink (app/api/vitals/route.ts) has exactly one place to read the
 *  wire shape from, and adding a field never means editing two files that must agree.
 *  Account-free by construction: nothing here identifies a person (ADR-922). */
export function vitalProps(v: CleanVital): Record<string, string | number> {
  const props: Record<string, string | number> = {
    metric: v.name,
    value: v.value,
    rating: v.rating,
    mid: v.id,
    nav: v.navigationType ?? 'navigate',
  }
  if (v.viewportClass) props.vp = v.viewportClass
  return props
}

export function normalizeVitalBatch(raw: unknown): CleanVital[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_VITALS_BATCH).map(normalizeVital).filter((v): v is CleanVital => v !== null)
}

// ── Browser-only buffer ─────────────────────────────────────────────────────────
// Head-based sampling decided ONCE per page load (never per metric — per-metric
// sampling desynchronizes LCP/INP/CLS for the same load). 1.0 during beta; drop to
// 0.25 once daily page loads pass ~10k (p75 over 7 days keeps ample n at that rate).
const SAMPLE_RATE = 1
const ENDPOINT = '/api/vitals'
let sampled: boolean | null = null
let buffer: CleanVital[] = []

export function bufferVital(v: CleanVital): void {
  if (typeof window === 'undefined') return
  if (sampled === null) sampled = Math.random() < SAMPLE_RATE
  if (!sampled) return
  buffer.push(v)
  // INP + CLS finalize AT page-hide; flush synchronously then rather than betting on
  // our listener running after web-vitals' own hidden handler.
  if (document.visibilityState === 'hidden' || buffer.length >= MAX_VITALS_BATCH) flushVitals()
}

export function flushVitals(): void {
  if (typeof window === 'undefined' || buffer.length === 0) return
  const events = buffer
  buffer = []
  let sessionId: string | null = null
  try {
    // Reuse the observe firehose's ephemeral per-tab id (random, sessionStorage, not
    // PII) rather than minting a second key.
    sessionId = getSessionId()
  } catch {
    /* sessionStorage unavailable → anonymous batch */
  }
  const payload = JSON.stringify({ sessionId, events })
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return
  } catch {
    /* fall through to fetch */
  }
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}
