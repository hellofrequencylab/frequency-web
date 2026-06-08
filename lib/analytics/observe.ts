// Wide interaction firehose — client buffer (PI.1, ADR-166). Unlike trackClient (one
// POST per named event), this BATCHES high-volume raw interactions and flushes them in
// bulk to /api/observe — on an interval, when the buffer fills, and on page-hide (via
// sendBeacon, which survives navigation). Fire-and-forget; never throws into the UI.
//
// Server enforces consent + membership (the endpoint drops anon / opted-out); the
// client fires freely. Sampling lets us dial down chatty kinds without touching callers.

import { MAX_BATCH } from './interaction-events'

const ENDPOINT = '/api/observe'
const FLUSH_MS = 5000
// Capture everything during the beta; dial specific kinds down later (server-bounded too).
const SAMPLE_RATE = 1

interface Buffered {
  kind: string
  props?: Record<string, unknown>
  surface?: string
  path?: string
  t: number
}

let buffer: Buffered[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let sessionId: string | null = null

/** Ephemeral per-tab visit id (sessionStorage). Random, not PII — just sessionizes a
 *  visit so a sequence of interactions can be stitched without a durable identifier. */
function getSessionId(): string {
  if (sessionId) return sessionId
  if (typeof window === 'undefined') return 'ssr'
  try {
    const KEY = 'fq_obs_sid'
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      sessionStorage.setItem(KEY, id)
    }
    sessionId = id
  } catch {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  return sessionId
}

function send(events: Buffered[]): void {
  const payload = JSON.stringify({ sessionId: getSessionId(), events })
  try {
    const ok =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))
    if (!ok) {
      void fetch(ENDPOINT, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      }).catch(() => {})
    }
  } catch {
    /* never throw from tracking */
  }
}

/** Send buffered observations now (called on interval, buffer-full, and page-hide). */
export function flushObservations(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (buffer.length === 0) return
  const batch = buffer
  buffer = []
  send(batch)
}

function scheduleFlush(): void {
  if (timer) return
  timer = setTimeout(flushObservations, FLUSH_MS)
}

/** Record one raw interaction. Buffered + flushed in batches. `surface`/`path` default
 *  to the current route. Safe to call anywhere on the client; no-op on the server. */
export function observe(
  kind: string,
  props?: Record<string, unknown>,
  opts?: { surface?: string; path?: string },
): void {
  if (typeof window === 'undefined') return
  if (SAMPLE_RATE < 1 && Math.random() > SAMPLE_RATE) return
  buffer.push({
    kind,
    props,
    surface: opts?.surface,
    path: opts?.path ?? window.location?.pathname,
    t: Date.now(),
  })
  if (buffer.length >= MAX_BATCH) flushObservations()
  else scheduleFlush()
}
