// The unified outbound send-gate (ADR-169 — the ADR-028 verification harness).
//
// Every outbound message — lifecycle email, dispatch, campaign, *and especially
// anything an autonomous agent enqueues* — must pass ONE decision before it can be
// sent. Until now the three guardrails lived in three modules and were checked ad
// hoc at each send site: notification preferences (`shouldSend`), the consent ledger
// (`hasConsent`), and the email suppression list (`isSuppressed`). Scattered checks
// can't be verified, so ADR-028 keeps agents propose-only "until a test harness around
// spine/consent/suppression exists."
//
// This is that harness: a single PURE decision (`evaluateSendGate`) over explicit
// state — exhaustively unit-tested — plus a thin async resolver (`resolveSendGate`)
// that gathers the state from the existing readers and calls it. The guardrails are
// now one structural seam an agent cannot route around, and the truth table is a test.

import type { ConsentScope } from '@/lib/consent/scopes'
import { hasConsent } from '@/lib/consent/consent'
import { isSuppressed } from '@/lib/suppression'
import {
  shouldSend,
  type NotificationChannel,
  type NotificationCategory,
} from '@/lib/notification-preferences'

// Marketing is not a notification-preference category (campaigns use the consent
// ledger, not the per-category toggle), so the gate accepts it alongside the four
// preference categories.
export type SendCategory = NotificationCategory | 'marketing'

/** Why a send was allowed or blocked — in precedence order. One reason per decision. */
export type SendGateReason =
  | 'ok'
  | 'suppressed' // email on the hard suppression list (bounce/complaint/manual)
  | 'no_consent' // member has not granted the consent scope this category needs
  | 'pref_off' // member turned this channel×category off in their preferences
  | 'frequency_cap' // already at the hard cap for this window

export interface SendGateInput {
  channel: NotificationChannel
  category: SendCategory
  /** The member toggled this channel×category on (preferences). Marketing has no
   *  per-category toggle, so callers pass `true` and let consent govern. */
  prefEnabled: boolean
  /** The consent scope this category needs is granted (or the category needs none). */
  consentGranted: boolean
  /** Email is on the hard suppression list. Always `false` for non-email channels. */
  suppressed: boolean
  /** Sends already made to this member in the current frequency window. */
  sentInWindow: number
  /** Hard cap for the window. `Infinity` = uncapped. */
  cap: number
}

export interface SendGateDecision {
  allowed: boolean
  reason: SendGateReason
}

/**
 * The whole send policy as one pure function. Precedence (most fundamental first):
 * suppression (legal/deliverability — overrides everything) → consent → preference
 * → frequency cap. Deterministic; the exhaustive truth table lives in the test.
 */
export function evaluateSendGate(input: SendGateInput): SendGateDecision {
  if (input.suppressed) return { allowed: false, reason: 'suppressed' }
  if (!input.consentGranted) return { allowed: false, reason: 'no_consent' }
  if (!input.prefEnabled) return { allowed: false, reason: 'pref_off' }
  if (input.sentInWindow >= input.cap) return { allowed: false, reason: 'frequency_cap' }
  return { allowed: true, reason: 'ok' }
}

/**
 * The consent scope a category requires before sending, or `null` when the category
 * is governed by preferences alone (community notifications carry no separate consent
 * scope — the per-category toggle *is* the consent). Pure; tested.
 */
export function consentScopeForCategory(category: SendCategory): ConsentScope | null {
  switch (category) {
    case 'lifecycle':
      return 'email_lifecycle'
    case 'marketing':
      return 'email_marketing'
    default:
      return null // dispatches / events / mentions — preference-governed
  }
}

export interface ResolveSendOptions {
  /** The recipient's email — required to check suppression on the `email` channel. */
  email?: string | null
  /** Sends already made in the window + the hard cap. Omit for an uncapped send. */
  frequency?: { sentInWindow: number; cap: number }
}

/**
 * Gather the live guardrail state for a member and run the gate. This is the single
 * call an autonomous send (or any send site) routes through — the structural seam
 * ADR-028 requires. Fail-closed: any read error denies the send (a broken lookup
 * must never accidentally message a member).
 */
export async function resolveSendGate(
  profileId: string,
  channel: NotificationChannel,
  category: SendCategory,
  options: ResolveSendOptions = {},
): Promise<SendGateDecision> {
  try {
    const scope = consentScopeForCategory(category)

    // Marketing has no per-category preference toggle; consent governs it.
    const prefEnabled =
      category === 'marketing'
        ? true
        : await shouldSend(profileId, channel, category)

    const consentGranted = scope === null ? true : await hasConsent(profileId, scope)

    // Suppression is an email-only, address-level block.
    const suppressed =
      channel === 'email' && options.email ? await isSuppressed(options.email) : false

    return evaluateSendGate({
      channel,
      category,
      prefEnabled,
      consentGranted,
      suppressed,
      sentInWindow: options.frequency?.sentInWindow ?? 0,
      cap: options.frequency?.cap ?? Infinity,
    })
  } catch {
    return { allowed: false, reason: 'pref_off' }
  }
}
