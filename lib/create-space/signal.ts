// THE CREATE A SPACE SIGNALS (LIVE-1970, ADR-1933): what the signed-out builder records about itself. First-party
// only, into the engagement ledger through the one sink (lib/analytics/track.ts), never a pixel of its own, and never
// anything a person typed: every event carries a closed set of props, each checked against a closed list here before
// it is written, so the route cannot be made to store text. The nine events are the handoff's (README section 5).
//
// PURE and client-safe: the studio builds a payload with it, the route (app/api/create-space/signal) checks the same
// payload with it, and a probe runs it under node. The funnel the events make is lib/create-space/funnel.ts.
//
// ANONYMOUS BY DESIGN. There is no account yet, so the ledger row has no actor. The browser mints one random key per
// tab (sessionStorage, never a cookie) and sends it with every signal; the exactly-once key is that key plus the
// event (plus the step for step_done), so a re-render, a retry or a reload never counts twice, and the funnel counts
// visits, not taps. The key is opaque and is not kept anywhere else.

import { BUILDER_MOVES } from './builder'
import { parseIntents } from '@/lib/spaces/create-wizard'
import { isPreviewKit } from './preview-site'

export const CREATE_SPACE_SIGNALS = [
  'createspace.view',
  'createspace.name_started',
  'createspace.accent_picked',
  'createspace.step_done',
  'createspace.offer',
  'createspace.lead',
  'createspace.photos',
  'createspace.resume',
  'createspace.dock_click',
] as const
export type CreateSpaceSignal = (typeof CREATE_SPACE_SIGNALS)[number]

/** The per-tab key: 16 to 32 url-safe characters, minted by the browser. */
const VISITOR_RE = /^[A-Za-z0-9_-]{16,32}$/
/** Where the browser sends a signal. */
export const SIGNAL_URL = '/api/create-space/signal'
/** The longest step the funnel believes: a day. */
const MAX_SECONDS = 86_400
const ACCENTS = 12

type Props = Record<string, string | number | boolean>

function isCreateSpaceSignal(v: unknown): v is CreateSpaceSignal {
  return typeof v === 'string' && (CREATE_SPACE_SIGNALS as readonly string[]).includes(v)
}

export function isVisitorKey(v: unknown): v is string {
  return typeof v === 'string' && VISITOR_RE.test(v)
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The props an event may carry, from whatever the browser sent, or null when the event is malformed. Total. */
export function signalProps(event: CreateSpaceSignal, raw: unknown): Props | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  switch (event) {
    case 'createspace.view': {
      const chosen = bool(r.chosen)
      if (!isPreviewKit(r.kit) || chosen === null) return null
      return { kit: r.kit, chosen }
    }
    case 'createspace.accent_picked': {
      const accent = int(r.accent, ACCENTS - 1)
      return accent === null ? null : { accent }
    }
    case 'createspace.step_done': {
      const seconds = int(r.seconds, MAX_SECONDS)
      if (!(BUILDER_MOVES as readonly string[]).includes(str(r.step)) || seconds === null) return null
      return { step: str(r.step), seconds }
    }
    case 'createspace.offer': {
      const exampleUsed = bool(r.example_used)
      if (exampleUsed === null) return null
      return { example_used: exampleUsed, intents: parseIntents(str(r.intents).split(',')).slice(0, 3).join(',') }
    }
    case 'createspace.lead': {
      const phone = bool(r.has_phone)
      const where = bool(r.has_where)
      return phone === null || where === null ? null : { has_phone: phone, has_where: where }
    }
    case 'createspace.photos': {
      const uploaded = bool(r.uploaded)
      const kept = bool(r.kept_theme)
      return uploaded === null || kept === null ? null : { uploaded, kept_theme: kept }
    }
    case 'createspace.resume':
      return r.source === 'local' || r.source === 'email' ? { source: r.source } : null
    case 'createspace.name_started':
    case 'createspace.dock_click':
      return {}
  }
}

/** The exactly-once key: one per visitor and event, and per step for step_done. */
export function signalKey(visitor: string, event: CreateSpaceSignal, props: Props): string {
  const part = event === 'createspace.step_done' ? String(props.step) : ''
  return `create_space:${visitor}:${event}:${part}`
}

/** One signal as the browser posts it. */
interface SignalBody {
  v: string
  event: CreateSpaceSignal
  props: Props
}

/** Read a posted body. Null when any part is not what it must be. Total. */
export function parseSignalBody(raw: unknown): SignalBody | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (!isVisitorKey(b.v) || !isCreateSpaceSignal(b.event)) return null
  const props = signalProps(b.event, b.props)
  return props ? { v: b.v, event: b.event, props } : null
}

/** The browser's per-tab key, minted once and kept for the tab. `store` is sessionStorage or null when blocked. */
export function visitorKeyFrom(store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null, random: () => string): string {
  const KEY = 'fq-create-space-visitor'
  try {
    const had = store?.getItem(KEY)
    if (isVisitorKey(had)) return had
  } catch { /* storage blocked */ }
  const fresh = random().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32).padEnd(16, '0')
  try { store?.setItem(KEY, fresh) } catch { /* storage blocked: a key per render is still a key */ }
  return fresh
}
