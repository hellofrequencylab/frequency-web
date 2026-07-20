// The SMS send-gate (EVENTS-REWORK §5 / ADR-256) — sibling of `send-gate.ts`.
//
// "Text the group" (ADR-255) is SMS, the single hardest-gated channel we have.
// Sending a text without every legal box ticked is not a bug, it is statutory
// damages ($500-1500 per message under the TCPA). So this module is built
// REFUSE-FIRST: `sendSms()` returns a "gated" result and sends nothing today,
// and will keep refusing until ALL of the following are simultaneously true:
//
//   1. The member's SMS consent is `opted_in` (the append-only `sms_consent`
//      ledger — express written consent, captured against a verified phone).
//   2. The member's `notification_preferences.sms_enabled` is on (the master
//      channel switch) AND the per-category toggle for this category is on.
//   3. The current local time (the member's `home_timezone`) is inside quiet
//      hours (default 8am-9pm; the legal bound, clamped regardless of prefs).
//   4. The brand/campaign env flags are set — i.e. a registered A2P 10DLC brand
//      and campaign exist and the provider is wired (see ENV below). They are
//      NOT set today, so this guard ALWAYS no-ops for now.
//   5. The platform `sms_enabled` operator switch is ON (platform_flags, flipped
//      at /admin/sms). This is the app-configurable kill-switch, ADDITIVE to the
//      env lock: both must be true. Defaults OFF.
//
// Like the unified send-gate, the policy is one PURE decision (`evaluateSmsGate`)
// over explicit state, plus a thin async resolver (`sendSms`) that gathers the
// state and runs it. Precedence (most fundamental first): registration (the legal
// lock, overrides everything) -> platform switch -> consent -> preference -> quiet
// hours. Fail-closed: any read error refuses the send.
//
// ───────────────────────────────────────────────────────────────────────────
// REQUIRED ENV FLAGS (none set today -> always gated):
//   SMS_PROVISIONING_ENABLED  — "true" once the A2P 10DLC legal track is cleared.
//                               The master kill-switch; absent/anything-else = off.
//   SMS_A2P_BRAND_ID          — the registered A2P 10DLC brand id (EIN-backed).
//   SMS_A2P_CAMPAIGN_ID       — the approved A2P 10DLC campaign/use-case id.
//   TWILIO_MESSAGING_SERVICE_SID — the Twilio Messaging Service the campaign maps to.
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN — provider credentials (for the eventual sender).
// When these exist AND the per-member gates pass, the send path is wired here
// (today it is intentionally absent — there is no provider call in this file).
// ───────────────────────────────────────────────────────────────────────────

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationCategory } from '@/lib/notification-preferences'
import { isSmsEnabled, smsQuietHours } from '@/lib/notification-preferences'
import { smsEnabledFlag } from '@/lib/platform-flags'

// sms_consent is a genuinely-new table, not in database.types yet — route reads
// through an untyped admin client (same helper-function pattern as
// lib/consent/consent.ts and lib/events/dispatch.ts; ADR-246-clean).
function untypedDb(): SupabaseClient {
  return createAdminClient()
}

// SMS only carries the two host-driven event categories today (ADR-255: "text the
// group" is an Event Dispatch channel). Lifecycle/mentions never go to SMS.
export type SmsCategory = Extract<NotificationCategory, 'dispatches' | 'events'>

/** Why an SMS send was allowed or refused — in precedence order. One per decision. */
export type SmsGateReason =
  | 'ok' // every gate passed — only reachable once the legal track is live
  | 'not_provisioned' // A2P 10DLC brand/campaign env flags are not set (the default today)
  | 'platform_disabled' // the operator sms_enabled platform flag is OFF (the default)
  | 'no_consent' // member is not `opted_in` in the sms_consent ledger
  | 'pref_off' // member has SMS disabled (master switch or this category)
  | 'quiet_hours' // current local time is outside the allowed 8am-9pm window

export interface SmsGateState {
  /** A registered A2P 10DLC brand + campaign exist and the provider is wired (env). */
  provisioned: boolean
  /** The operator `sms_enabled` platform flag is ON (platform_flags; app-configurable). */
  platformEnabled: boolean
  /** The member is `opted_in` in the sms_consent ledger (verified + express consent). */
  consentOptedIn: boolean
  /** `notification_preferences.sms_enabled` AND the per-category SMS toggle are on. */
  prefEnabled: boolean
  /** The current local time is inside the member's quiet-hours window. */
  insideQuietHours: boolean
}

export interface SmsGateDecision {
  /** Always false today (env flags unset). True only when EVERY gate passes. */
  allowed: boolean
  reason: SmsGateReason
  /** Honest flag: the call was received and recorded intent, but nothing was sent. */
  gated: boolean
}

/**
 * The whole SMS policy as one pure function. Precedence (most fundamental first):
 * provisioning (legal registration — the hard lock, overrides everything) -> platform
 * switch (the operator sms_enabled flag) -> consent -> preference -> quiet hours.
 * Deterministic and unit-testable. Today `provisioned` is false, so this returns
 * `not_provisioned` for every real call.
 */
export function evaluateSmsGate(state: SmsGateState): SmsGateDecision {
  if (!state.provisioned) return { allowed: false, reason: 'not_provisioned', gated: true }
  if (!state.platformEnabled) return { allowed: false, reason: 'platform_disabled', gated: true }
  if (!state.consentOptedIn) return { allowed: false, reason: 'no_consent', gated: true }
  if (!state.prefEnabled) return { allowed: false, reason: 'pref_off', gated: true }
  if (!state.insideQuietHours) return { allowed: false, reason: 'quiet_hours', gated: true }
  return { allowed: true, reason: 'ok', gated: false }
}

/**
 * Are the A2P 10DLC brand/campaign env flags set? This is the legal kill-switch:
 * until the EIN -> A2P 10DLC -> Twilio Messaging Service track is complete and
 * these are populated, EVERY send is refused. Today it returns false.
 */
export function isSmsProvisioned(): boolean {
  return (
    process.env.SMS_PROVISIONING_ENABLED === 'true' &&
    !!process.env.SMS_A2P_BRAND_ID &&
    !!process.env.SMS_A2P_CAMPAIGN_ID &&
    !!process.env.TWILIO_MESSAGING_SERVICE_SID
  )
}

/**
 * Does the `sms_consent` relation actually exist in this database yet? The SMS
 * groundwork migration (20260626010000) is UNAPPLIED in some environments (prod
 * today), so every surface that reads the ledger must degrade gracefully when the
 * table is absent rather than surfacing a Postgres "relation does not exist" error.
 *
 * Probes once with a cheap `select ... limit 1` on the RLS-bypassing service-role
 * client and caches the answer for the request (React `cache`). Any error — a
 * missing relation or anything else — resolves to false (fail-safe: treat SMS as
 * not provisioned). This is DISTINCT from `isSmsProvisioned()`, which reads the
 * A2P 10DLC env flags; SMS is only truly live when BOTH are true.
 */
export const isSmsConsentTableReady = cache(async (): Promise<boolean> => {
  try {
    const { error } = await untypedDb().from('sms_consent').select('id').limit(1)
    return !error
  } catch {
    return false
  }
})

/**
 * Whether a member is currently `opted_in` in the append-only sms_consent ledger.
 * Latest row per (profile_id, phone) wins; absent -> not opted in (SMS is opt-IN,
 * never a default). Fail-closed on error. sms_consent is not in database.types yet
 * (repo cast convention).
 */
export async function hasSmsConsent(profileId: string): Promise<boolean> {
  try {
    const { data } = await untypedDb()
      .from('sms_consent')
      .select('status')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return false
    return (data as { status: string }).status === 'opted_in'
  } catch {
    return false
  }
}

/**
 * The phone number a member is currently `opted_in` on, or null when they are not
 * opted in (or on any error — fail-closed). The latest sms_consent row per member
 * wins; we only return its phone when that latest row is `opted_in`, so a member who
 * texted STOP (latest row `opted_out`) yields null and nothing can be addressed to
 * them. Read through the untyped admin client (sms_consent is not in the generated
 * types yet, ADR-246).
 */
export async function consentedSmsPhone(profileId: string): Promise<string | null> {
  try {
    const { data } = await untypedDb()
      .from('sms_consent')
      .select('status, phone')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const row = data as { status: string; phone: string | null }
    return row.status === 'opted_in' && row.phone ? row.phone : null
  } catch {
    return null
  }
}

/**
 * Pure: is `hour` (0-23, the member's LOCAL hour) inside the inclusive-start,
 * exclusive-end quiet-hours window? Handles a normal same-day window (8 <= h < 21).
 * Unit-testable; the resolver derives `hour` from the member's home_timezone.
 */
export function isInsideQuietHours(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false // zero-width window allows nothing
  if (startHour < endHour) return hour >= startHour && hour < endHour
  // wrap-around window (e.g. 21..8) — outside the night gap
  return hour >= startHour || hour < endHour
}

/** The member's current local hour (0-23) in their home timezone. Defaults to UTC. */
function localHourInZone(timeZone: string | null | undefined): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timeZone || 'UTC',
    }).format(new Date())
    // Intl can emit "24" for midnight in some locales; normalise to 0-23.
    return Number(hour) % 24
  } catch {
    // Bad/unknown tz -> fall back to UTC rather than throwing (the gate refuses
    // anyway today; this only matters once the channel is live).
    return new Date().getUTCHours()
  }
}

export interface SendSmsArgs {
  profileId: string
  category: SmsCategory
  /** The message body (recorded as intent; never sent while gated). */
  body: string
  /** The member's home timezone for the quiet-hours check (e.g. profiles.home_timezone). */
  timeZone?: string | null
  /**
   * The destination phone (E.164). Optional: when omitted, the send path resolves the
   * member's consented number from the sms_consent ledger, so a caller never has to
   * carry the phone around. A send is refused if neither this nor a consented number
   * is available (fail-closed).
   */
  to?: string | null
}

/**
 * The single call every "text the group" path routes through — the structural seam
 * an autonomous send cannot route around (same posture as resolveSendGate). It
 * gathers the live SMS gate state and runs the pure policy. It NEVER sends today:
 * the env flags are unset, so it returns `{ allowed: false, gated: true }` and only
 * records intent. Fail-closed: any read error refuses the send.
 *
 * When the legal track is live (env flags set) AND every per-member gate passes,
 * the provider send is wired in below the gate — there is intentionally NO provider
 * call in this file today.
 */
export async function sendSms(args: SendSmsArgs): Promise<SmsGateDecision> {
  try {
    const provisioned = isSmsProvisioned()

    // Short-circuit the per-member reads while we are not provisioned (the common
    // case today) — there is nothing to look up and nothing to send. The env lock is
    // the hardest gate, so it is checked first and overrides the platform switch.
    if (!provisioned) {
      console.info(
        `[sms] send requested for profile ${args.profileId} (${args.category}) — SMS is gated (ADR-256: A2P 10DLC not provisioned), not sent`,
      )
      return { allowed: false, reason: 'not_provisioned', gated: true }
    }

    // The operator kill-switch (platform_flags.sms_enabled). Additive to the env lock:
    // even once the legal track is live, an operator can hold the channel closed. Also
    // short-circuits the per-member reads — nothing to send while it is OFF.
    const platformEnabled = await smsEnabledFlag()
    if (!platformEnabled) {
      console.info(
        `[sms] send requested for profile ${args.profileId} (${args.category}) — SMS is gated (platform sms_enabled flag OFF), not sent`,
      )
      return { allowed: false, reason: 'platform_disabled', gated: true }
    }

    const [consentOptedIn, prefEnabled, quiet] = await Promise.all([
      hasSmsConsent(args.profileId),
      isSmsEnabled(args.profileId, args.category),
      smsQuietHours(args.profileId),
    ])

    const insideQuietHours = isInsideQuietHours(
      localHourInZone(args.timeZone),
      quiet.startHour,
      quiet.endHour,
    )

    const decision = evaluateSmsGate({
      provisioned,
      platformEnabled,
      consentOptedIn,
      prefEnabled,
      insideQuietHours,
    })

    // The send path lives here, BELOW the gate, and only when allowed. It runs only
    // once the legal track is live (env flags set) AND every per-member gate passed.
    if (!decision.allowed) return decision

    // Resolve the destination: an explicit `to`, else the member's consented number.
    // If neither exists we cannot address the message, so refuse rather than guess
    // (fail-closed; consentOptedIn was true, so a consented number should exist).
    const to = (args.to && args.to.trim()) || (await consentedSmsPhone(args.profileId))
    if (!to) return { allowed: false, reason: 'no_consent', gated: true }

    // Send via the durable outbox (kind 'sms'), drained by /api/cron/process-queue,
    // which calls the Twilio Messaging Service (TWILIO_MESSAGING_SERVICE_SID) and
    // records the contact_interaction. Dynamic import breaks the sms ⇄ sms-send cycle
    // (sms-send imports isSmsProvisioned from here) and keeps this module IO-light.
    const { enqueueSms } = await import('@/lib/comms/sms-send')
    await enqueueSms({ to, body: args.body, profileId: args.profileId })
    return decision
  } catch {
    return { allowed: false, reason: 'pref_off', gated: true }
  }
}
