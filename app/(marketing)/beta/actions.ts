'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { sendBetaConfirmEmail } from '@/lib/email'
import { buildBetaConfirmUrl } from '@/lib/beta-tokens'
import { SITE_URL } from '@/lib/site'

export type BetaResult =
  | { ok: true; already?: boolean }
  | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Double opt-in beta lead capture. Writes a `contacts` lead (consent stays
// 'unknown'/pending until they click the confirm link) and queues a confirm
// email through the spine. Confirming flips consent_state -> 'subscribed'.
export async function requestBetaAccess(input: {
  email: string
  name?: string
  /** Attribution tag for where the lead came from (e.g. 'discover_inline'). */
  source?: string
}): Promise<BetaResult> {
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null
  const source = (input.source || '').trim() || 'beta_waitlist'

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  // `contacts` isn't in the generated DB types yet (untyped client view, same as
  // lib/studio/contacts.ts). Cast to the generic client.
  const admin = createAdminClient() as unknown as SupabaseClient
  const nowIso = new Date().toISOString()

  // Look up any existing contact (case-insensitive; email is stored lowercased
  // on insert, and there's a unique index on lower(email)).
  const { data: existing } = await admin
    .from('contacts')
    .select('id, consent_state, display_name, meta')
    .ilike('email', email)
    .maybeSingle()

  // Already confirmed — nothing to do, just reassure them.
  if (existing?.consent_state === 'subscribed') {
    return { ok: true, already: true }
  }

  // Never re-mail a hard-bounced / complained address.
  if (await isSuppressed(email)) {
    // Don't leak suppression status; report success without sending.
    return { ok: true }
  }

  // How this lead first reached us (ADR-095) — first-touch wins, so only record it
  // if we don't already have one for this contact.
  const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
  const acquisition = existingMeta.acquisition ?? (await resolveAcquisition())

  const meta = {
    ...existingMeta,
    beta_waitlist: true,
    double_optin: 'pending',
    requested_at: nowIso,
    acquisition,
  }

  try {
    if (existing?.id) {
      await admin
        .from('contacts')
        .update({
          display_name: existing.display_name ?? name,
          source,
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
        source: 'beta_waitlist',
        meta,
        last_seen_at: nowIso,
      })
    }
  } catch (err) {
    console.error('[beta] failed to upsert contact:', err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  // Queue the double opt-in confirmation email (through the spine).
  try {
    const confirmUrl = buildBetaConfirmUrl(SITE_URL, email)
    await sendBetaConfirmEmail({ to: email, confirmUrl })
  } catch (err) {
    console.error('[beta] failed to queue confirm email:', err)
    return { ok: false, error: 'We saved your spot but couldn’t send the email. Please try again.' }
  }

  return { ok: true }
}
