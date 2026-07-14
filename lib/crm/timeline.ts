// The personal-CRM timeline READ MODEL (ADR-372 · docs/CRM-OVERHAUL.md Phase 1). Turns the raw
// `contact_interactions` rows (lib/crm/interactions.ts) into one sorted, display-ready stream for the
// owner-facing contact detail, and FOLDS IN the legacy per-contact signals (network_contact notes +
// QR scans) at READ time so the timeline shows real history immediately, before the write adapters
// backfill those sources into the one table. As adapters land, the legacy folds become redundant and
// drop out naturally (deduped by id-prefix).
//
// PURE + framework-independent (no Supabase/Next imports) — the IO that gathers the rows lives in
// person.ts / the page; this just shapes + merges + sorts, so it is trivially unit-testable. All copy
// is plain and in voice (docs/CONTENT-VOICE.md): short verbs, sentence case, no em dashes.

import type { ContactInteraction, InteractionChannel, InteractionDirection, InteractionSource } from './interactions'

/** One entry the contact-detail timeline renders. */
export interface TimelineEntry {
  /** Stable id, prefixed by origin so a folded legacy row and its eventual adapter row can dedupe. */
  id: string
  channel: InteractionChannel
  direction: InteractionDirection
  /** A short, plain one-line label (e.g. "Emailed", "Met in person", or the row's own summary). */
  title: string
  /** Optional longer text (the body / note). */
  detail: string | null
  /** ISO timestamp the touch happened, newest first when sorted. */
  at: string
  /** The producing source (audit / icon hint): 'interaction' | 'note' | 'scan'. */
  origin: 'interaction' | 'note' | 'scan'
  /** The interaction source (drives the system/human toggle). Folded legacy notes + QR scans are
   *  human touches, so they carry 'manual' and are never hidden by the automated filter. */
  source: InteractionSource
}

/** The default verb for a channel + direction, used when an interaction carries no summary. Plain
 *  voice, no em dashes. Pure. */
export function interactionTitle(channel: InteractionChannel, direction: InteractionDirection): string {
  switch (channel) {
    case 'email':
      return direction === 'inbound' ? 'Email received' : 'Emailed'
    case 'sms':
      return direction === 'inbound' ? 'Text received' : 'Texted'
    case 'call':
      return direction === 'inbound' ? 'Call received' : 'Called'
    case 'in_person':
      return 'Met in person'
    case 'event':
      return 'At an event'
    case 'note':
      return 'Note'
    case 'in_app':
      return direction === 'inbound' ? 'Message received' : 'Messaged'
    case 'system':
      return 'Update'
    default:
      return 'Touch'
  }
}

function toEntry(i: ContactInteraction): TimelineEntry {
  const summary = i.summary?.trim()
  return {
    id: `interaction:${i.id}`,
    channel: i.channel,
    direction: i.direction,
    title: summary && summary.length ? summary : interactionTitle(i.channel, i.direction),
    detail: i.body?.trim() || null,
    at: i.occurredAt,
    origin: 'interaction',
    source: i.source,
  }
}

export interface LegacyNote {
  id: string
  body: string
  createdAt: string | null
}
export interface LegacyScan {
  id: string
  codeTitle: string | null
  scannedAt: string
}

export interface BuildTimelineInput {
  interactions: ContactInteraction[]
  /** network_contact notes folded in until the note adapter backfills them. */
  notes?: LegacyNote[]
  /** QR scans folded in as in-person touches until the capture adapter backfills them. */
  scans?: LegacyScan[]
}

/** Options for buildTimeline. */
export interface BuildTimelineOptions {
  /** When false, automated (system-generated) events are filtered OUT of the result — the
   *  "Show automated events" toggle OFF (see filterTimeline). Defaults to true (show everything). */
  includeAutomated?: boolean
}

// ── The system/human toggle (ADR-372 Phase 1) ─────────────────────────────────────────────────────
// One append-only log, read-time filtering — NEVER destructive (Customer.io / Activity Schema doctrine:
// separate "things people did" from message-lifecycle metadata via a first-class source dimension).

/** Sources that are machine-generated engagement / lifecycle noise (email opens, clicks, delivery,
 *  Resonance Engine plays, generic system updates). Hidden when the "Show automated events" toggle is
 *  off. `manual`, `crm_activity`, and `import` are human-logged and always shown. */
export const AUTOMATED_SOURCES: readonly InteractionSource[] = [
  'engagement',
  'resend',
  'twilio',
  'ai',
  'playbook',
  'system',
]

/**
 * Whether an entry is an automated, system-generated event (so the toggle can hide it). Pure.
 * ALWAYS shown (returns false) when the touch is human-logged (`manual`) or is a real in-house
 * conversation (`in_app` direct message), so the owner never loses a genuine message. Everything else
 * from an automated source (an email open, a lifecycle update) is automated noise.
 */
export function isAutomatedEntry(entry: Pick<TimelineEntry, 'source' | 'channel'>): boolean {
  if (entry.source === 'manual') return false
  if (entry.channel === 'in_app') return false // a real direct message is always a human touch
  return AUTOMATED_SOURCES.includes(entry.source)
}

/**
 * Filter a built timeline by the system/human toggle. Pure and non-destructive: `includeAutomated`
 * true returns the list unchanged; false drops only the automated-noise entries (isAutomatedEntry),
 * keeping every human-logged touch and every in-house message. The caller decides the default per
 * surface (hidden on the member-facing personal card, shown in the staff/admin console).
 */
export function filterTimeline(entries: TimelineEntry[], includeAutomated: boolean): TimelineEntry[] {
  if (includeAutomated) return entries ?? []
  return (entries ?? []).filter((e) => !isAutomatedEntry(e))
}

/**
 * Merge every source into one timeline, newest first, capped. Pure and deterministic: an empty/blank
 * input yields []. Sort is by `at` descending with a stable id tiebreak so equal timestamps keep a
 * deterministic order. Blank-bodied notes are dropped (a note must have text). `options.includeAutomated`
 * (default true) applies the system/human toggle at build time; the client can re-filter with filterTimeline.
 */
export function buildTimeline(input: BuildTimelineInput, limit = 100, options?: BuildTimelineOptions): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const i of input.interactions ?? []) entries.push(toEntry(i))

  for (const n of input.notes ?? []) {
    const body = n.body?.trim()
    if (!body) continue
    entries.push({
      id: `note:${n.id}`,
      channel: 'note',
      direction: 'internal',
      title: 'Note',
      detail: body,
      at: n.createdAt ?? '',
      origin: 'note',
      source: 'manual',
    })
  }

  for (const s of input.scans ?? []) {
    entries.push({
      id: `scan:${s.id}`,
      channel: 'in_person',
      direction: 'inbound',
      title: s.codeTitle?.trim() ? `Met via ${s.codeTitle.trim()}` : 'Met via QR',
      detail: null,
      at: s.scannedAt,
      origin: 'scan',
      source: 'manual',
    })
  }

  entries.sort((a, b) => {
    const ta = Date.parse(a.at) || 0
    const tb = Date.parse(b.at) || 0
    if (tb !== ta) return tb - ta
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })

  const filtered = filterTimeline(entries, options?.includeAutomated ?? true)
  const capped = Math.min(Math.max(limit, 1), 500)
  return filtered.slice(0, capped)
}

// ── DERIVED at READ time (pure, testable) — small shapers the owner-facing detail uses to surface the
//    existing history more usefully, without any new IO. ──────────────────────────────────────────

/** A short, human "how long ago" for a timeline timestamp, in plain voice (no em dashes). Returns ''
 *  for a blank / unparseable / future `at`. Buckets: Today, Yesterday, N days ago, N weeks ago, then
 *  the month/year. Pure: takes `now` so it is deterministic in tests. */
export function relativeTime(at: string | null | undefined, now: number = Date.now()): string {
  if (!at) return ''
  const then = Date.parse(at)
  if (Number.isNaN(then)) return ''
  const diffMs = now - then
  if (diffMs < 0) return '' // a future stamp: nothing sensible to say
  const day = 86_400_000
  const days = Math.floor(diffMs / day)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  if (months < 12) return months <= 1 ? '1 month ago' : `${months} months ago`
  const years = Math.floor(days / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

/** A one-line read of the whole timeline for the detail header: how many touches there are and when
 *  the most recent one happened (the entries are newest-first out of buildTimeline, so the first is
 *  the latest). Pure; an empty timeline yields a null `lastTouchAt`. */
export interface TimelineSummary {
  count: number
  lastTouchAt: string | null
}
export function summarizeTimeline(entries: TimelineEntry[]): TimelineSummary {
  const list = entries ?? []
  const latest = list.find((e) => !!e.at && !Number.isNaN(Date.parse(e.at)))
  return { count: list.length, lastTouchAt: latest?.at ?? null }
}
