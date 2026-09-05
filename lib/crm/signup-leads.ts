// Abandoned signup leads: the READ side of `signup_leads` (ADR-959, migration 20270215000000).
//
// The induction at /join writes this table on every beat through three SECURITY DEFINER RPCs
// (app/join/(induction)/lead-actions.ts) and, until 2026-09-05 (scan2 L9-03), nothing read it back:
// no page, no export, no cron. This module is the reader. It lists the rows that never converted,
// says which beat each visitor stopped at, and shapes them for the operator page and its CSV
// export. Server-only (service-role client; the table is fail-closed to anon and authenticated).
//
// The "recovery job" the table was built for (one transactional "finish setting up your account"
// note) is NOT here; that is a cron with its own consent rules and lives in a separate change.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

/** How far the visitor got before they left. `step_reached` is written by the induction:
 *  1 = gave an email on the tour beat, 2 = picked a core feature, 3 and 4 = filled in identity
 *  (4 is the path where the email is first captured at the identity beat). 0 = row opened by a
 *  funnel that never sent a step. */
export const SIGNUP_STEP_LABELS: Readonly<Record<number, string>> = {
  0: 'Started',
  1: 'Email',
  2: 'Feature pick',
  3: 'Identity',
  4: 'Identity',
}

export function signupStepLabel(step: number): string {
  return SIGNUP_STEP_LABELS[step] ?? `Step ${step}`
}

export interface AbandonedSignupLead {
  id: string
  email: string
  /** Best available name: display name, else "first last", else null. */
  name: string | null
  handle: string | null
  source: string
  stepReached: number
  stepLabel: string
  /** One line of what the funnel had already learned (personas, interests, location, feature). */
  summary: string
  createdAt: string
  updatedAt: string
  /** Whole days since the row was last touched. */
  ageDays: number
}

export interface SignupLeadRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  handle: string | null
  source: string
  step_reached: number
  payload: Json
  created_at: string
  updated_at: string
}

const SELECT = 'id, email, first_name, last_name, display_name, handle, source, step_reached, payload, created_at, updated_at'

const DAY_MS = 24 * 60 * 60 * 1000

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (typeof value === 'string' && value) return [value]
  return []
}

/** Flatten the funnel payload (personas, interests, location, sequence, core_feature) to one line. */
export function summarizeSignupPayload(payload: Json): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  const p = payload as Record<string, unknown>
  const parts: string[] = []
  const personas = asStringList(p.personas)
  if (personas.length) parts.push(personas.join('/'))
  const interests = asStringList(p.interests)
  if (interests.length) parts.push(interests.join(', '))
  if (typeof p.core_feature === 'string' && p.core_feature) parts.push(`wants ${p.core_feature}`)
  if (typeof p.location === 'string' && p.location) parts.push(p.location)
  if (typeof p.sequence === 'string' && p.sequence) parts.push(`via ${p.sequence}`)
  return parts.join(' · ')
}

export function mapSignupLeadRow(row: SignupLeadRow, now: number = Date.now()): AbandonedSignupLead {
  const first = (row.first_name ?? '').trim()
  const last = (row.last_name ?? '').trim()
  const display = (row.display_name ?? '').trim()
  const name = display || [first, last].filter(Boolean).join(' ') || null
  const touched = Date.parse(row.updated_at)
  const ageDays = Number.isFinite(touched) ? Math.max(0, Math.floor((now - touched) / DAY_MS)) : 0
  return {
    id: row.id,
    email: row.email,
    name,
    handle: row.handle,
    source: row.source,
    stepReached: row.step_reached,
    stepLabel: signupStepLabel(row.step_reached),
    summary: summarizeSignupPayload(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ageDays,
  }
}

export interface ListAbandonedSignupLeadsOptions {
  /** Only rows created within this many days. Default 30. */
  sinceDays?: number
  /** Cap on rows returned, newest activity first. Default 200. */
  limit?: number
}

/**
 * Every lead that opened a row and never converted, newest activity first.
 *
 * Fail-safe: a read error logs (structured, never interpolated) and returns an empty list, so the
 * operator page renders its empty state rather than a 500.
 */
export async function listAbandonedSignupLeads(
  opts: ListAbandonedSignupLeadsOptions = {},
): Promise<AbandonedSignupLead[]> {
  const sinceDays = Math.max(1, Math.floor(opts.sinceDays ?? 30))
  const limit = Math.min(1000, Math.max(1, Math.floor(opts.limit ?? 200)))
  const now = Date.now()
  const since = new Date(now - sinceDays * DAY_MS).toISOString()

  const { data, error } = await createAdminClient()
    .from('signup_leads')
    .select(SELECT)
    .is('converted_at', null)
    .gte('created_at', since)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[signup-leads] list failed', { message: error.message, sinceDays, limit })
    return []
  }
  return ((data ?? []) as SignupLeadRow[]).map((row) => mapSignupLeadRow(row, now))
}

/** Counts by the beat the visitor stopped at, for the page's stat row. */
export function countByStep(leads: readonly AbandonedSignupLead[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of leads) out[l.stepLabel] = (out[l.stepLabel] ?? 0) + 1
  return out
}

function csvEscape(value: string): string {
  // RFC 4180: quote when the value holds a comma, quote, or newline; double embedded quotes.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export const SIGNUP_LEAD_CSV_HEADER = ['email', 'name', 'handle', 'source', 'step', 'step_label', 'summary', 'created_at', 'updated_at'] as const

/** The export the operator downloads. One row per lead; header first; CRLF line ends. */
export function abandonedSignupLeadsToCsv(leads: readonly AbandonedSignupLead[]): string {
  const lines = [SIGNUP_LEAD_CSV_HEADER.join(',')]
  for (const l of leads) {
    lines.push(
      [
        l.email,
        l.name ?? '',
        l.handle ?? '',
        l.source,
        String(l.stepReached),
        l.stepLabel,
        l.summary,
        l.createdAt,
        l.updatedAt,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
