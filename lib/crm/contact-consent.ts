// THE contact-level consent surface + GLOBAL STOP (ADR-372 · docs/CRM-OVERHAUL.md Phase 0; the CRM
// brief's "consent is first-class from line one"). The member-keyed gates already exist
// (lib/comms/send-gate.ts for email, lib/comms/sms.ts for SMS, both keyed on profiles.id). The CRM
// also touches NON-MEMBER contacts (the Phase 2 card-scan invite), which have no profile, so consent
// for them is address-level: email suppression (lib/suppression.ts) + contacts.consent_state. This
// module is the one place that answers "may we contact this person?" for a contact AND the GLOBAL STOP
// that propagates an opt-out across every channel at once, the piece the brief flags as impossible to
// bolt on later.
//
// SHAPE (mirrors lib/comms/send-gate.ts): a PURE decision (`evaluateContactConsent`) over explicit
// state, exhaustively unit-tested, plus thin async resolvers that gather the state. `contacts` is in
// the generated types (used directly, like lib/crm/person.ts); `sms_consent` is not yet (untyped cast,
// the repo convention, ADR-246).
//
// authz-delegated: recordGlobalStop is a COMPLIANCE / system write front door (a STOP reply, an
// unsubscribe click, or an operator opt-out). It has no per-caller scope by design, it propagates a
// platform-wide opt-out; the gate lives at the call site (the webhook / unsubscribe handler / gated
// operator action). Mirrors lib/consent/retention.ts and lib/suppression.ts.

import { suppress, isSuppressed } from '@/lib/suppression'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { escapeLike } from '@/lib/search-sanitize'

const norm = (s: string) => s.trim().toLowerCase()

/** The intent behind a send. A one-time transactional notification + invite (the card-scan nudge) is
 *  allowed to an `unknown` contact; an ongoing marketing stream requires an explicit opt-in. */
export type ContactPurpose = 'transactional' | 'marketing'
/** The address-level marketing-consent state on the `contacts` hub. */
export type ContactConsentState = 'unknown' | 'subscribed' | 'unsubscribed'

export type ConsentDecisionReason = 'ok' | 'suppressed' | 'unsubscribed' | 'not_opted_in'
export interface ConsentDecision {
  allowed: boolean
  reason: ConsentDecisionReason
}

/**
 * The contact-consent policy as one pure function. Precedence (most fundamental first):
 * suppression / opt-out (overrides everything) → opt-in requirement for marketing. A transactional
 * one-time invite is allowed unless the contact has been suppressed or has explicitly unsubscribed;
 * a marketing send additionally requires an explicit `subscribed`. Deterministic; tested.
 */
export function evaluateContactConsent(input: {
  purpose: ContactPurpose
  suppressed: boolean
  consentState: ContactConsentState
}): ConsentDecision {
  if (input.suppressed) return { allowed: false, reason: 'suppressed' }
  if (input.consentState === 'unsubscribed') return { allowed: false, reason: 'unsubscribed' }
  if (input.purpose === 'marketing' && input.consentState !== 'subscribed') {
    return { allowed: false, reason: 'not_opted_in' }
  }
  return { allowed: true, reason: 'ok' }
}

/** The current marketing-consent state for an email on the `contacts` hub ('unknown' when no contact
 *  row exists). Per-space tenancy (ADR-624): an address can carry a SEPARATE consent row in each Space,
 *  so scope the read to the sending Space; with no `spaceId` (platform marketing) fall back to the ROOT
 *  consent row. Scoped to a single (space_id, email) so `.maybeSingle()` is safe under the per-space
 *  unique index. Service-role read; FAIL-SAFE to 'unknown' on error (the suppression check is the hard
 *  block; this only governs the opt-in requirement). */
async function contactConsentState(email: string, spaceId?: string): Promise<ContactConsentState> {
  try {
    const scope = spaceId ?? (await loadRootSpaceId())
    if (!scope) return 'unknown'
    // Case-insensitive match on lower(email) — the column can carry a mixed-case address (an OAuth
    // signup / import path stores it un-normalized), and uniqueness is defined on lower(email), so a
    // case-sensitive `.eq` would MISS such a row and wrongly report 'unknown' (a compliance risk if it
    // hides an 'unsubscribed'). escapeLike neutralizes the `%`/`_` LIKE wildcards so the address matches
    // literally; under the per-space unique(space_id, lower(email)) index this yields at most one row, so
    // `.maybeSingle()` stays safe.
    const { data } = await createAdminClient()
      .from('contacts')
      .select('consent_state')
      .eq('space_id', scope)
      .ilike('email', escapeLike(norm(email)))
      .maybeSingle()
    const raw = (data as { consent_state?: string } | null)?.consent_state
    return raw === 'subscribed' || raw === 'unsubscribed' ? raw : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * May we email this address for this purpose? Composes the GLOBAL suppression list (and, when given,
 * the per-Space list) with the contact's marketing-consent state, then runs the pure policy.
 * FAIL-CLOSED: any read error denies the send (isSuppressed itself fails safe to suppressed).
 */
export async function canEmailContact(
  email: string,
  purpose: ContactPurpose,
  spaceId?: string,
): Promise<ConsentDecision> {
  const [suppressed, consentState] = await Promise.all([
    isSuppressed(email, spaceId),
    contactConsentState(email, spaceId),
  ])
  return evaluateContactConsent({ purpose, suppressed, consentState })
}

// ── GLOBAL STOP — propagate one opt-out across every channel at once ──────────────────────────────

export interface GlobalStopInput {
  /** The email to opt out everywhere (suppressed globally + contacts flipped to unsubscribed). */
  email?: string | null
  /** The phone to opt out (every member's sms_consent for this number flipped to opted_out). */
  phone?: string | null
  /** Why (audit): 'stop_reply' | 'unsubscribe' | 'complaint' | 'manual' | … */
  reason: string
  /** Where it came from (audit), e.g. 'sms_stop' | 'email_unsub' | 'operator'. */
  source?: string
}

export interface GlobalStopResult {
  /** The email was suppressed + any matching contacts flipped to unsubscribed. */
  emailStopped: boolean
  /** How many (profile, phone) SMS-consent rows were flipped to opted_out. */
  smsProfilesStopped: number
}

/**
 * Record a platform-wide opt-out. Honors the brief's "global STOP propagation": one STOP on a phone
 * or email immediately blocks ALL sends. Email → add to the global suppression list AND flip every
 * matching `contacts` row to `unsubscribed`. Phone → append an `opted_out` row to `sms_consent` for
 * every member who has consented on that number (the append-only ledger's latest-row-wins makes this
 * the new state). FAIL-SAFE per leg: a failure on one channel never blocks the other. Idempotent
 * (suppress() is idempotent; re-flipping consent_state / re-opting-out is a no-op on state).
 */
export async function recordGlobalStop(input: GlobalStopInput): Promise<GlobalStopResult> {
  const result: GlobalStopResult = { emailStopped: false, smsProfilesStopped: 0 }
  const source = input.source ?? 'global_stop'

  if (input.email && input.email.trim()) {
    const addr = norm(input.email)
    try {
      await suppress(addr, input.reason) // global email suppression (space_id NULL)
      // INTENTIONAL cross-space update under per-space tenancy (ADR-624): a global STOP must flip EVERY
      // Space's row for this address to unsubscribed (root + every tenant lead), so this stays unscoped by
      // space_id on purpose. CASE-INSENSITIVE match: the `contacts.email` column can carry a mixed-case
      // address (an OAuth-signup / import path stores it un-normalized) and uniqueness is on lower(email),
      // so a case-sensitive `.eq` would MISS such a row and leave it wrongly `subscribed` — a compliance
      // gap. `ilike` on the escaped, normalized address matches every casing literally (escapeLike
      // neutralizes % / _ so the address matches exactly), mirroring `contactConsentState`'s read.
      await createAdminClient()
        .from('contacts')
        .update({ consent_state: 'unsubscribed' })
        .ilike('email', escapeLike(addr))
      result.emailStopped = true
    } catch {
      // leave emailStopped false; the other leg still runs
    }
  }

  if (input.phone && input.phone.trim()) {
    const phone = input.phone.trim()
    try {
      // sms_consent is not in the generated types yet (ADR-246) — untyped cast, like lib/comms/sms.ts.
      const db = createAdminClient() as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => Promise<{ data: { profile_id: string }[] | null; error: unknown }>
          }
          insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
        }
      }
      const { data } = await db.from('sms_consent').select('profile_id').eq('phone', phone)
      const profileIds = [...new Set((data ?? []).map((r) => r.profile_id).filter(Boolean))]
      if (profileIds.length > 0) {
        await db.from('sms_consent').insert(
          profileIds.map((profileId) => ({
            profile_id: profileId,
            phone,
            status: 'opted_out',
            source,
            note: input.reason,
          })),
        )
        result.smsProfilesStopped = profileIds.length
      }
    } catch {
      // leave smsProfilesStopped at 0; the email leg already ran
    }
  }

  return result
}
