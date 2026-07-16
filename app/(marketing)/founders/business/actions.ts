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

// FOUNDING BUSINESS reservation (the fee-buydown cohort, ADR-599). WAITLIST MODE: this writes a
// `contacts` lead (consent stays pending until the double opt-in confirm) tagged as a founding
// BUSINESS reservation, and queues the confirm email. It performs NO charge, no Stripe, no card,
// by construction: the only side effects are a `contacts` upsert and the confirm email. It mirrors
// reserveFoundingSpot (app/(marketing)/founders/actions.ts); the durable founding_members grant
// (lib/founding/status.ts) is written at graduation, not here, so a reservation can never charge.

export type ReserveBusinessResult =
  | { ok: true; already?: boolean }
  | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// authz-ok: intentionally PUBLIC + anonymous (a business owner reserving a founding spot, no caller to
// authorize), exactly like reserveFoundingSpot / the allowlisted /beta double opt-in capture. The only
// writes are a contacts lead + the confirm email; rate-limited per IP and suppression-checked; no
// privileged data is read or returned.
export async function reserveFoundingBusiness(input: {
  email: string
  businessName?: string
  city?: string
}): Promise<ReserveBusinessResult> {
  const email = (input.email || '').trim().toLowerCase()
  const businessName = (input.businessName || '').trim() || null
  const city = (input.city || '').trim() || null

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  // Throttle this open, unauthenticated endpoint per IP (abuse / enumeration guard). No-ops when
  // Upstash isn't configured (lib/rate-limit.ts).
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('founders_business', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many requests. Please try again in a few minutes.' }
  }

  // `contacts` isn't in the generated DB types yet (untyped client view, same as reserveFoundingSpot).
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // ROOT-scoped: this waitlist inserts to the root hub (→ root via the contacts_default_space_id trigger),
  // and per-space tenancy (ADR-624) makes an unscoped email lookup a multi-row throw hazard.
  const rootId = await loadRootSpaceId()
  const { data: existing } = rootId
    ? await admin
        .from('contacts')
        .select('id, consent_state, display_name, meta')
        .eq('space_id', rootId)
        .ilike('email', email)
        .maybeSingle()
    : { data: null }

  const alreadyConfirmed = existing?.consent_state === 'subscribed'

  // Never re-mail a hard-bounced / complained address.
  if (await isSuppressed(email)) {
    return { ok: true }
  }

  const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
  const acquisition = existingMeta.acquisition ?? (await resolveAcquisition())

  const meta = {
    ...existingMeta,
    founders_waitlist: true,
    founding_business: true,
    founder_kind: 'business',
    founder_business_name: businessName,
    cohort_city: city,
    double_optin: alreadyConfirmed ? (existingMeta.double_optin ?? 'confirmed') : 'pending',
    requested_at: nowIso,
    acquisition,
  } as unknown as Json

  try {
    if (existing?.id) {
      await admin
        .from('contacts')
        .update({
          display_name: existing.display_name ?? businessName,
          source: 'founders_business_waitlist',
          meta,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
    } else {
      await admin.from('contacts').insert({
        email,
        display_name: businessName,
        consent_state: 'unknown',
        source: 'founders_business_waitlist',
        meta,
        last_seen_at: nowIso,
      })
    }
  } catch (err) {
    console.error('[founders-business] failed to upsert contact:', err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  if (alreadyConfirmed) {
    return { ok: true, already: true }
  }

  try {
    const confirmUrl = buildBetaConfirmUrl(SITE_URL, email)
    await sendBetaConfirmEmail({ to: email, confirmUrl })
  } catch (err) {
    console.error('[founders-business] failed to queue confirm email:', err)
    return { ok: false, error: 'We saved your spot but could not send the email. Please try again.' }
  }

  return { ok: true }
}
