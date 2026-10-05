// Deliverability: the central email suppression list + event log (COMMS-CRM §2).
// The send path checks isSuppressed() before every send; the Resend webhook calls
// recordEmailEvent()/suppress(). Server-only. Both tables are in the generated DB
// types, so access goes through the typed client.
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

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

function db() {
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
    const rows = data ?? []
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
  // NOT best-effort (SCAN-763). supabase-js resolves `{ error }` and never throws, and the blanket
  // try/catch this used to wear swallowed even that resolved error, so the Resend webhook could never
  // see a failed suppression: it acked 200 with the svix claim kept, Resend never redelivered, and a
  // bouncing or complaining address kept getting mail. Every caller already wraps this call, so a
  // throw here is what lets the webhook release its claim and 503, and what lets /unsubscribe tell
  // the member the truth when the row never landed.
  const existing = await db()
    .from('email_suppressions')
    .select('space_id')
    .eq('email', addr)
  if (existing.error) throw new Error(`[suppression] pre-check failed: ${existing.error.message}`)
  const rows = existing.data ?? []
  const wanted = spaceId ?? null
  if (rows.some((r) => r.space_id === wanted)) return

  const { error } = await db()
    .from('email_suppressions')
    .insert({ email: addr, reason, ...(spaceId ? { space_id: spaceId } : {}) })
  // A unique-index race (23505) means a concurrent call inserted the row we wanted, so it exists
  // and this call is still idempotent. Anything else is a real failure the caller must see.
  if (error && error.code === '23505') return
  if (error) throw new Error(`[suppression] insert failed: ${error.message}`)
}

/**
 * Log a Resend delivery/engagement event.
 *
 * `campaignId` (optional) is the Email Studio campaign this event belongs to, extracted by the
 * webhook from the Resend payload (the X-Campaign-Id header / campaign_id tag we stamp at send).
 * When present it is written to email_events.campaign_id so getCampaignMetrics can attribute the
 * event EXACTLY. Additive: an event without a campaign id records exactly as before.
 */
export async function recordEmailEvent(input: {
  email: string
  eventType: string
  providerId?: string | null
  payload?: Record<string, unknown>
  campaignId?: string | null
}): Promise<void> {
  const { error } = await db()
    .from('email_events')
    .insert({
      email: norm(input.email),
      event_type: input.eventType,
      provider_id: input.providerId ?? null,
      // jsonb payload — narrowed to Json (webhook payloads have no generated shape).
      payload: (input.payload ?? {}) as Json,
      ...(input.campaignId ? { campaign_id: input.campaignId } : {}),
    })
  // Resolved, not thrown (SCAN-763): read it, or the webhook acks an event that was never recorded.
  if (error) throw new Error(`[suppression] email_events insert failed: ${error.message}`)
}
