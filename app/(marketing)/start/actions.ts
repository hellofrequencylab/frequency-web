'use server'

// Lead-flow capture (ADR-125, docs/LEAD-FLOWS.md). Records WHO a visitor said they
// were — their persona — as a `contacts` lead the moment they pick, so we have the
// marketing signal even if they bounce before signing up. Email is optional: a
// route-only lead flow (captureEmail:false) just carries the persona into the
// induction via the URL, and there's nothing to write here. Mirrors the contacts
// upsert in (marketing)/beta/actions.ts but does NOT send an email (no persona
// nurture series exists yet — see ADR-125 follow-ups), so we never mis-mail.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { isPersonaId, type PersonaId } from '@/lib/onboarding/personas'

export type LeadResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function captureLead(input: {
  persona: PersonaId
  /** The lead flow slug they came through (lib/onboarding/lead-flows.ts). */
  flow: string
  /** Attribution source for the lead (the flow's `source`). */
  source: string
  /** Optional — only present for capture-style flows. */
  email?: string
  name?: string
}): Promise<LeadResult> {
  const persona = isPersonaId(input.persona) ? input.persona : 'visitor'
  const flow = (input.flow || '').trim().slice(0, 60)
  const source = (input.source || '').trim().slice(0, 60) || 'lead_flow'
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null

  // No email → nothing to persist as a contact; the persona rides into the
  // induction on the URL and is stamped on the member at signup. Not an error.
  if (!email) return { ok: true }

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  // Never re-touch a hard-bounced / complained address.
  if (await isSuppressed(email)) return { ok: true }

  // `contacts` isn't in the generated DB types yet (untyped view, repo convention —
  // see (marketing)/beta/actions.ts + lib/studio/contacts.ts). Cast to the generic.
  const admin = createAdminClient() as unknown as SupabaseClient
  const nowIso = new Date().toISOString()

  const { data: existing } = await admin
    .from('contacts')
    .select('id, display_name, meta')
    .ilike('email', email)
    .maybeSingle()

  const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
  // First-touch acquisition wins (ADR-095) — only resolve if we don't have one.
  const acquisition = existingMeta.acquisition ?? (await resolveAcquisition())

  const meta = {
    ...existingMeta,
    persona,
    lead_flow: flow,
    persona_captured_at: nowIso,
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
        source,
        meta,
        last_seen_at: nowIso,
      })
    }
  } catch (err) {
    console.error('[lead] failed to upsert contact:', err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  return { ok: true }
}
