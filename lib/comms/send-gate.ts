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
  getFrequency,
  isFrequencyDeferred,
  isSubjectTopicMuted,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationTopic,
  type PreferenceSubject,
} from '@/lib/notification-preferences'

// Marketing is not a notification-preference category (campaigns use the consent
// ledger, not the per-category toggle) and `transactional` is account/security mail
// that always sends (Phase 6 carve-out), so the gate accepts both alongside the
// preference categories.
export type SendCategory = NotificationCategory | 'marketing' | 'transactional'

// Account / security / transactional mail (password resets, receipts, verification
// codes, legal notices). It ALWAYS sends regardless of marketing prefs, consent, or
// frequency — only the hard suppression list (bounce/complaint = undeliverable) can
// stop it. Enforced here in code so a broken preference read can never silence a
// security email. Stated in the settings UI too.
export const TRANSACTIONAL_CATEGORY = 'transactional' as const

export function isTransactional(category: SendCategory): boolean {
  return category === TRANSACTIONAL_CATEGORY
}

/** Why a send was allowed or blocked — in precedence order. One reason per decision. */
export type SendGateReason =
  | 'ok'
  | 'suppressed' // email on the hard suppression list (bounce/complaint/manual)
  | 'no_consent' // member has not granted the consent scope this category needs
  | 'pref_off' // member turned this channel×category off in their preferences
  | 'subject_muted' // member muted this topic for THIS Space/circle (global pref still on)
  | 'frequency_deferred' // member chose a digest for this category; realtime send deferred to the batch
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
  /** Account/security/transactional mail: bypasses consent + preference + frequency
   *  (only suppression can stop it). Defaults false. */
  transactional?: boolean
  /** The member muted this topic for the specific Space/circle in context. Defaults false. */
  subjectMuted?: boolean
  /** The member chose a digest cadence for this category, so a realtime send is deferred
   *  to the digest batch. Defaults false (realtime). */
  frequencyDeferred?: boolean
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
  // Suppression is the one hard legal/deliverability block — it overrides EVERYTHING,
  // including transactional mail (a bounced/complained address is undeliverable).
  if (input.suppressed) return { allowed: false, reason: 'suppressed' }
  // Transactional/account/security carve-out: past suppression it always sends,
  // ignoring consent, per-category prefs, subject mutes, and frequency.
  if (input.transactional) return { allowed: true, reason: 'ok' }
  if (!input.consentGranted) return { allowed: false, reason: 'no_consent' }
  if (!input.prefEnabled) return { allowed: false, reason: 'pref_off' }
  if (input.subjectMuted) return { allowed: false, reason: 'subject_muted' }
  if (input.frequencyDeferred) return { allowed: false, reason: 'frequency_deferred' }
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
      // dispatches / events / mentions / comments — preference-governed.
      // transactional — no scope (carved out; always sends).
      return null
  }
}

export interface ResolveSendOptions {
  /** The recipient's email — required to check suppression on the `email` channel. */
  email?: string | null
  /** Sends already made in the window + the hard cap. Omit for an uncapped send. */
  frequency?: { sentInWindow: number; cap: number }
  /** The Space/circle this send is about. When set, the gate also honours a per-subject
   *  topic mute (the member quieted THIS Space/circle without muting the platform). */
  subject?: PreferenceSubject
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
    const transactional = isTransactional(category)

    // Suppression is an email-only, address-level block — and the ONE gate even a
    // transactional send respects, so check it first.
    const suppressed =
      channel === 'email' && options.email ? await isSuppressed(options.email) : false

    // Transactional/account/security mail short-circuits every preference read: past
    // suppression it always sends. Avoids a broken pref/consent lookup silencing a
    // security email, and skips the extra IO.
    if (transactional) {
      return evaluateSendGate({
        channel,
        category,
        prefEnabled: true,
        consentGranted: true,
        suppressed,
        transactional: true,
        sentInWindow: options.frequency?.sentInWindow ?? 0,
        cap: options.frequency?.cap ?? Infinity,
      })
    }

    const scope = consentScopeForCategory(category)

    // Marketing has no per-category preference toggle; consent governs it. Only the
    // five preference categories (NotificationCategory) have a per-category toggle +
    // frequency; marketing skips both.
    const isPrefCategory = category !== 'marketing'
    const prefCategory = category as NotificationCategory

    const prefEnabled = isPrefCategory ? await shouldSend(profileId, channel, prefCategory) : true

    const consentGranted = scope === null ? true : await hasConsent(profileId, scope)

    // Per-subject mute: the member quieted THIS Space/circle for this topic+channel.
    const subjectMuted =
      options.subject != null
        ? await isSubjectTopicMuted(profileId, options.subject, category as NotificationTopic, channel)
        : false

    // Frequency deferral: a digest choice suppresses the realtime send (email only).
    const frequencyDeferred = isPrefCategory
      ? isFrequencyDeferred(channel, await getFrequency(profileId, prefCategory))
      : false

    return evaluateSendGate({
      channel,
      category,
      prefEnabled,
      consentGranted,
      suppressed,
      subjectMuted,
      frequencyDeferred,
      sentInWindow: options.frequency?.sentInWindow ?? 0,
      cap: options.frequency?.cap ?? Infinity,
    })
  } catch {
    return { allowed: false, reason: 'pref_off' }
  }
}
