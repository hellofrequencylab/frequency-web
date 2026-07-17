// The inbound double-opt-in funnel — server-only store logic.
//
// This is an INBOUND subscription funnel (CRM-MASTER-BUILD-PLAN; docs/DECISIONS.md ADR for the
// consent-clean opt-in). The imported `dt-seed` list lives in the Frequency ROOT space `contacts`
// with consent_state='unknown', and we deliberately never mass-mail it. Instead a person enters
// their own email on a public page; we send ONE transactional confirm email (a permission request,
// so it legitimately bypasses the marketing consent gate); clicking the link flips their consent to
// 'subscribed'. CAN-SPAM / GDPR clean, and it protects deliverability.
//
// Mirrors the beta double-opt-in shapes (app/(marketing)/beta): `contacts` isn't in the generated
// types, so the service-role admin client is used untyped. The pure decision helpers here are unit-
// tested; the thin async parts do the IO.

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/crm/import/store'
import { recordConsent } from '@/lib/consent/consent'
import { logTouchpoint } from '@/lib/crm/lead-capture'

/** The address-level marketing-consent state on the `contacts` hub (matches lib/crm/contact-consent.ts). */
export type ContactConsentState = 'unknown' | 'subscribed' | 'unsubscribed'

/** What to do with an opt-in REQUEST, given the contact's current state. Pure + tested. */
export type OptinRequestAction =
  | 'send_confirm' // unknown / new — issue a confirm email
  | 'skip_unsubscribed' // hard opt-out — do nothing, never resurrect on a passive request
  | 'skip_suppressed' // bounced/complained address — never re-mail
  | 'skip_subscribed' // already confirmed — nothing to do

/**
 * PURE: decide what an opt-in request should do. Precedence mirrors the send-gate/contact-consent
 * policy: suppression (hard) → hard opt-out → already subscribed → otherwise send the confirm.
 * The caller returns the SAME "check your inbox" success for every branch (anti-enumeration); this
 * only governs whether an email actually goes out.
 */
export function decideOptinRequest(input: {
  consentState: ContactConsentState | null
  suppressed: boolean
}): OptinRequestAction {
  if (input.suppressed) return 'skip_suppressed'
  if (input.consentState === 'unsubscribed') return 'skip_unsubscribed'
  if (input.consentState === 'subscribed') return 'skip_subscribed'
  return 'send_confirm'
}

/** The result of a CONFIRM click. Pure + tested. */
export type OptinConfirmStatus =
  | 'confirmed' // flipped (or already) subscribed
  | 'kept_unsubscribed' // honored a prior hard opt-out — did not resurrect
  | 'invalid' // bad/expired token or no email

/**
 * PURE: what a confirm click should WRITE, given the contact's current consent. A confirm click is
 * an affirmative action, so unknown → subscribed and an already-subscribed row stays subscribed
 * (idempotent). A prior hard opt-out is HONORED: we never let a stale confirm link resurrect an
 * `unsubscribed` contact (mirrors consentStateForDoor's permanence rule in lead-capture.ts).
 */
export function optinConfirmTarget(current: ContactConsentState | null): {
  write: boolean
  consentState: ContactConsentState
  status: Extract<OptinConfirmStatus, 'confirmed' | 'kept_unsubscribed'>
} {
  if (current === 'unsubscribed') {
    return { write: false, consentState: 'unsubscribed', status: 'kept_unsubscribed' }
  }
  return { write: true, consentState: 'subscribed', status: 'confirmed' }
}

interface ExistingContact {
  id: string
  consent_state: ContactConsentState | null
  display_name: string | null
  profile_id: string | null
  meta: Record<string, unknown>
}

/** Look up a contact by email (case-insensitive) in the ROOT space. The opt-in funnel is a
 *  platform/root flow (it creates + confirms contacts in the root space), so the lookup is scoped
 *  to root — under per-space tenancy (ADR-624) an email may exist as a separate row in other Spaces,
 *  and an unscoped `.maybeSingle()` would throw on that. Returns null on miss, no-root, or error. */
async function findContactByEmail(email: string): Promise<ExistingContact | null> {
  try {
    const rootId = await getRootSpaceId()
    if (!rootId) return null
    const { data } = await createAdminClient()
      .from('contacts')
      .select('id, consent_state, display_name, profile_id, meta')
      .eq('space_id', rootId)
      .eq('email', email.toLowerCase())
      .maybeSingle()
    if (!data) return null
    const meta = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>
    return {
      id: String(data.id),
      consent_state: (data.consent_state as ContactConsentState) ?? null,
      display_name: (data.display_name as string) ?? null,
      profile_id: (data.profile_id as string) ?? null,
      meta,
    }
  } catch (err) {
    console.error('[optin] findContactByEmail failed:', err)
    return null
  }
}

/** The public shape returned to the funnel action so it can enqueue the confirm email. */
export interface OptinRequestOutcome {
  action: OptinRequestAction
  /** Set only for `send_confirm`: the normalized email to send the confirm link to. */
  emailToConfirm: string | null
}

/**
 * Find-or-create the contact in the Frequency ROOT space and decide whether to send a confirm email.
 * - Existing `unsubscribed` → left untouched (hard opt-out honored).
 * - Existing `subscribed` → left untouched (already in).
 * - Existing `unknown` or brand-new → stamped `subscribe_optin: 'pending'` (consent_state stays
 *   'unknown' until they click the link) and flagged for a confirm email.
 * Never throws; a write failure resolves to a no-send outcome so the caller still shows the generic
 * success (we do not surface DB errors to an anonymous visitor beyond a generic retry).
 */
export async function requestOptin(input: {
  email: string
  name: string | null
  suppressed: boolean
  /** How the lead reached us (attribution), e.g. 'subscribe_page'. */
  source: string
  /** First-touch acquisition snapshot (opaque), recorded only when absent. */
  acquisition?: unknown
}): Promise<OptinRequestOutcome> {
  const email = input.email.trim().toLowerCase()
  const nowIso = new Date().toISOString()
  const existing = await findContactByEmail(email)

  const action = decideOptinRequest({
    consentState: existing?.consent_state ?? null,
    suppressed: input.suppressed,
  })

  if (action !== 'send_confirm') {
    return { action, emailToConfirm: null }
  }

  const rootId = await getRootSpaceId()
  const admin = createAdminClient()
  const existingMeta = existing?.meta ?? {}
  const acquisition = existingMeta.acquisition ?? input.acquisition ?? null

  const meta = {
    ...existingMeta,
    subscribe_optin: 'pending',
    optin_requested_at: nowIso,
    ...(acquisition ? { acquisition } : {}),
  } as unknown as Json

  try {
    if (existing?.id) {
      await admin
        .from('contacts')
        .update({
          // Never clobber a name we already have; fill it if we were missing one.
          display_name: existing.display_name ?? input.name,
          meta,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
    } else {
      await admin.from('contacts').insert({
        email,
        display_name: input.name,
        consent_state: 'unknown',
        source: input.source,
        ...(rootId ? { space_id: rootId } : {}),
        meta,
        last_seen_at: nowIso,
      })
    }
  } catch (err) {
    console.error('[optin] requestOptin upsert failed:', err)
    // Treat a write failure as "nothing sent" — the caller shows a generic retry, and we never
    // enqueue a confirm email for a row we could not persist.
    return { action: 'skip_suppressed', emailToConfirm: null }
  }

  return { action, emailToConfirm: email }
}

/**
 * Confirm a double-opt-in click. Idempotent. Validates NOTHING about the token (the caller does that);
 * this only performs the consent flip once the token is proven. On success:
 *   - flips `contacts.consent_state` → 'subscribed' (unless a hard opt-out is in force),
 *   - grants the `email_marketing` consent scope in the ledger for the linked profile (if any), so
 *     resolveSendGate('marketing') passes for that member,
 *   - logs an `optin_confirmed` touchpoint (best-effort),
 *   - returns the linked profile id + display name so the caller can enqueue the welcome email.
 * If no contact row exists (e.g. purged), it creates one already-subscribed (edge case, mirrors beta).
 */
export async function confirmOptin(email: string): Promise<{
  status: OptinConfirmStatus
  /** True only when THIS click flipped them to subscribed (not a reload of an already-in contact).
   *  The caller uses it to send the welcome email exactly once. */
  firstConfirmation: boolean
  profileId: string | null
  displayName: string | null
}> {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) return { status: 'invalid', firstConfirmation: false, profileId: null, displayName: null }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const existing = await findContactByEmail(clean)
  const target = optinConfirmTarget(existing?.consent_state ?? null)
  // Was this a brand-new confirmation? (An already-subscribed row re-confirming is idempotent and
  // must NOT re-send the welcome. A missing row also counts as first-time.)
  const firstConfirmation = existing?.consent_state !== 'subscribed'

  // Honor a prior hard opt-out — never resurrect it from a confirm click.
  if (!target.write) {
    return { status: 'kept_unsubscribed', firstConfirmation: false, profileId: existing?.profile_id ?? null, displayName: existing?.display_name ?? null }
  }

  const meta = {
    ...(existing?.meta ?? {}),
    subscribe_optin: 'confirmed',
    optin_confirmed_at: nowIso,
  } as unknown as Json

  try {
    if (existing?.id) {
      const { error } = await admin
        .from('contacts')
        .update({ consent_state: 'subscribed', meta, last_seen_at: nowIso, updated_at: nowIso })
        .eq('id', existing.id)
      if (error) return { status: 'invalid', firstConfirmation: false, profileId: null, displayName: null }
    } else {
      // Edge case: valid token but no row (record purged) — create it confirmed, in the root space.
      const rootId = await getRootSpaceId()
      const { error } = await admin.from('contacts').insert({
        email: clean,
        consent_state: 'subscribed',
        source: 'subscribe_optin',
        ...(rootId ? { space_id: rootId } : {}),
        meta,
        last_seen_at: nowIso,
      })
      if (error) return { status: 'invalid', firstConfirmation: false, profileId: null, displayName: null }
    }
  } catch (err) {
    console.error('[optin] confirmOptin update failed:', err)
    return { status: 'invalid', firstConfirmation: false, profileId: null, displayName: null }
  }

  const profileId = existing?.profile_id ?? null

  // Grant the marketing consent scope in the ledger for the linked member, so the unified send-gate
  // (resolveSendGate('marketing')) passes. A pure lead with no profile is reachable via the contact
  // hub's consent_state alone (a future lead-based send path); the contact flip above covers them.
  if (profileId) {
    try {
      await recordConsent(profileId, 'email_marketing', true, 'optin_confirm')
    } catch (err) {
      console.error('[optin] recordConsent failed for profile', profileId, err)
    }
  }

  // Log the opt-in touchpoint (best-effort; never blocks the confirm).
  const rootId = await getRootSpaceId()
  if (rootId && existing?.id) {
    await logTouchpoint({
      spaceId: rootId,
      contactId: existing.id,
      kind: 'optin_confirmed',
      channel: 'email',
      note: 'Confirmed double opt-in subscription',
    })
  }

  return { status: 'confirmed', firstConfirmation, profileId, displayName: existing?.display_name ?? null }
}
