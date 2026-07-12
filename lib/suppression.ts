// Deliverability: the central email suppression list + event log (COMMS-CRM §2).
// The send path checks isSuppressed() before every send; the Resend webhook calls
// recordEmailEvent()/suppress(). Server-only. Tables land in 20240220000000;
// untyped client view until types are regenerated.
//
// PER-SPACE SCOPE (ENTITY-SPACES-BUILD Phase 3): email_suppressions gained a nullable
// space_id (20260714000000_space_email.sql). A row with space_id NULL is a GLOBAL
// suppression that applies to ALL Spaces (hard bounce / complaint / manual); a row with
// a space_id is scoped to that ONE Space (a per-Space unsubscribe / per-Space bounce).
// The spaceId params here are OPTIONAL and additive:
//   • isSuppressed(email)            -> global-only check (UNCHANGED behavior for every
//                                       existing caller, e.g. sendRawEmail).
//   • isSuppressed(email, spaceId)   -> true if a GLOBAL row OR a row for THIS Space exists.
//   • suppress(email, reason)        -> records a GLOBAL suppression (UNCHANGED).
//   • suppress(email, reason, spaceId) -> records a suppression scoped to that Space.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

const norm = (email: string) => email.trim().toLowerCase()

/**
 * True if the address must never be emailed.
 * - Without `spaceId`: only GLOBAL suppressions count (space_id IS NULL). This is the exact
 *   behavior every existing caller relied on (sendRawEmail's global guard).
 * - With `spaceId`: true if a GLOBAL suppression OR a suppression for THIS Space exists, so a
 *   per-Space send respects both the platform-wide blocklist and the Space's own opt-outs.
 * Reads the address's suppression rows and matches the scope in code (so one shape covers both
 * the global-only and global-or-space cases). FAIL-SAFE to suppressed (true) on a read error: a
 * read blip must never let us re-mail a possibly-bad address.
 */
export async function isSuppressed(email: string, spaceId?: string): Promise<boolean> {
  const addr = norm(email)
  try {
    const { data } = await db()
      .from('email_suppressions')
      .select('space_id')
      .eq('email', addr)
    const rows = (data as unknown as { space_id: string | null }[] | null) ?? []
    if (!spaceId) {
      // Global-only: a row whose space_id is NULL.
      return rows.some((r) => r.space_id === null)
    }
    // Global OR this-Space.
    return rows.some((r) => r.space_id === null || r.space_id === spaceId)
  } catch {
    return true
  }
}

/**
 * Add an address to the suppression list (idempotent).
 * - Without `spaceId`: a GLOBAL suppression (space_id NULL) the whole platform honors (UNCHANGED).
 * - With `spaceId`: a suppression scoped to that one Space.
 * Idempotent without relying on a PostgREST conflict target: a pre-check skips the insert when a
 * row already exists for this (scope, address). The DB's unique index on
 * (coalesce(space_id, <zero-uuid>), lower(email)) is the final guard against a race.
 */
export async function suppress(email: string, reason: string, spaceId?: string): Promise<void> {
  const addr = norm(email)
  try {
    // Pre-check the exact (scope, address) row so re-running is a no-op.
    const existing = await db()
      .from('email_suppressions')
      .select('space_id')
      .eq('email', addr)
    const rows = (existing.data as unknown as { space_id: string | null }[] | null) ?? []
    const wanted = spaceId ?? null
    if (rows.some((r) => r.space_id === wanted)) return

    const row: Record<string, unknown> = { email: addr, reason }
    if (spaceId) row.space_id = spaceId
    await db().from('email_suppressions').insert(row)
  } catch {
    // A unique-index race (the row was inserted concurrently) is the only expected failure here,
    // and the row we wanted now exists, so swallowing it keeps suppress() idempotent.
  }
}

/**
 * Log a Resend delivery/engagement event.
 *
 * `campaignId` (optional) is the Email Studio campaign this event belongs to, extracted by the
 * webhook from the Resend payload (the X-Campaign-Id header / campaign_id tag we stamp at send).
 * When present it is written to email_events.campaign_id so getCampaignMetrics can attribute the
 * event EXACTLY. The column is not in the generated types yet, so the row is inserted through an
 * untyped handle (ADR-246). Additive: an event without a campaign id records exactly as before.
 */
export async function recordEmailEvent(input: {
  email: string
  eventType: string
  providerId?: string | null
  payload?: Record<string, unknown>
  campaignId?: string | null
}): Promise<void> {
  const row: Record<string, unknown> = {
    email: norm(input.email),
    event_type: input.eventType,
    provider_id: input.providerId ?? null,
    payload: input.payload ?? {},
  }
  if (input.campaignId) row.campaign_id = input.campaignId

  await (
    db() as unknown as {
      from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> }
    }
  )
    .from('email_events')
    .insert(row)
}
