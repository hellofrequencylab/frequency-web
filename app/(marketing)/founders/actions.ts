'use server'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { sendBetaConfirmEmail } from '@/lib/email'
import { buildBetaConfirmUrl } from '@/lib/beta-tokens'
import { SITE_URL } from '@/lib/site'
import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { loadRootSpaceId } from '@/lib/spaces/store'

// The three founding tiers (Page 2 / The Offer). A reservation only records the
// chosen tier in the lead's meta; it NEVER charges. Live checkout is a separate,
// flag-gated path (lib/pricing/settings.ts `billingLive()`), not this action.
export type FounderTier = 'supporter' | 'member' | 'patron'

const FOUNDER_TIERS: readonly FounderTier[] = ['supporter', 'member', 'patron']

export type ReserveResult =
  | { ok: true; already?: boolean }
  | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Reserve a founding spot. WAITLIST MODE: this writes a `contacts` lead (consent
// stays 'unknown'/pending until they click the confirm link) and queues a double
// opt-in confirm email through the spine. It performs NO charge, no Stripe, no
// payment, no billing, by construction: the only side effects are a `contacts`
// upsert and the confirm email. Mirrors requestBetaAccess (app/(marketing)/beta/
// actions.ts); the founding tier is recorded in `meta.founder_tier`.
//
// authz-ok: intentionally PUBLIC + anonymous (a visitor reserving a founding spot, no
// caller to authorize), exactly like the allowlisted /beta double opt-in capture. The
// only writes are a contacts lead + the confirm email; rate-limited per IP and
// suppression-checked; no privileged data is read or returned.
export async function reserveFoundingSpot(input: {
  email: string
  name?: string
  tier: FounderTier
}): Promise<ReserveResult> {
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null
  const tier: FounderTier = FOUNDER_TIERS.includes(input.tier) ? input.tier : 'member'

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  // Throttle this open, unauthenticated endpoint per IP (abuse / address
  // enumeration guard). No-ops when Upstash isn't configured (lib/rate-limit.ts).
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('founders', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many requests. Please try again in a few minutes.' }
  }

  // `contacts` isn't in the generated DB types yet (untyped client view, same as
  // lib/studio/contacts.ts). Cast to the generic client.
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // Look up any existing contact (case-insensitive). ROOT-scoped: this waitlist inserts to the root hub
  // (→ root via the contacts_default_space_id trigger), and per-space tenancy (ADR-624) makes an unscoped
  // email lookup a multi-row throw hazard, so scope to root so `.maybeSingle()` is safe.
  const rootId = await loadRootSpaceId()
  const { data: existing } = rootId
    ? await admin
        .from('contacts')
        .select('id, consent_state, display_name, meta')
        .eq('space_id', rootId)
        .eq('email', email)
        .maybeSingle()
    : { data: null }

  // Already confirmed, keep their existing record, just update the founding
  // intent below and reassure them.
  const alreadyConfirmed = existing?.consent_state === 'subscribed'

  // Never re-mail a hard-bounced / complained address.
  if (await isSuppressed(email)) {
    // Don't leak suppression status; report success without sending.
    return { ok: true }
  }

  // How this lead first reached us (ADR-095), first-touch wins, so only record it
  // if we don't already have one for this contact.
  const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
  const acquisition = existingMeta.acquisition ?? (await resolveAcquisition())

  const meta = {
    ...existingMeta,
    founders_waitlist: true,
    founder_tier: tier,
    double_optin: alreadyConfirmed ? (existingMeta.double_optin ?? 'confirmed') : 'pending',
    requested_at: nowIso,
    acquisition,
  } as unknown as Json

  try {
    if (existing?.id) {
      await admin
        .from('contacts')
        .update({
          display_name: existing.display_name ?? name,
          source: 'founders_waitlist',
          meta,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
    } else {
      await admin.from('contacts').insert({
        email,
        display_name: name,
        consent_state: 'unknown',
        source: 'founders_waitlist',
        meta,
        last_seen_at: nowIso,
      })
    }
  } catch (err) {
    console.error('[founders] failed to upsert contact:', err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  // Already-confirmed contacts don't need the double opt-in email again; their
  // spot is reserved with the new founding tier recorded.
  if (alreadyConfirmed) {
    return { ok: true, already: true }
  }

  // Queue the double opt-in confirmation email (through the spine). Reuses the
  // beta confirm token + email, clicking it flips consent_state -> 'subscribed'.
  try {
    const confirmUrl = buildBetaConfirmUrl(SITE_URL, email)
    await sendBetaConfirmEmail({ to: email, confirmUrl })
  } catch (err) {
    console.error('[founders] failed to queue confirm email:', err)
    return { ok: false, error: 'We saved your spot but could not send the email. Please try again.' }
  }

  return { ok: true }
}
