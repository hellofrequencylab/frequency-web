'use server'

// Lead-flow capture (ADR-125, docs/LEAD-FLOWS.md). Records WHO a visitor said they
// were — their persona — as a `contacts` lead the moment they pick, so we have the
// marketing signal even if they bounce before signing up. Email is optional: a
// route-only lead flow (captureEmail:false) just carries the persona into the
// induction via the URL, and there's nothing to write here. Mirrors the contacts
// upsert in (marketing)/beta/actions.ts but does NOT send an email (no persona
// nurture series exists yet — see ADR-125 follow-ups), so we never mis-mail.

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { isPersonaId, type PersonaId } from '@/lib/onboarding/personas'
import { resolveArchetype } from '@/lib/audience/archetypes'
import { enrollInNurture } from '@/lib/nurture/enroll'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { findSubject } from '@/lib/taxonomy/subjects'
import { funnelRecord, hasFunnelSignal, parseFunnelContext } from '@/lib/onboarding/funnel-context'

export type LeadResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function captureLead(input: {
  persona: PersonaId
  /** The arrival follow-up answer (ADR-1715). Optional; validated against the persona's own list. */
  archetype?: string | null
  /** The lead flow slug they came through (lib/onboarding/lead-flows.ts). */
  flow: string
  /** Attribution source for the lead (the flow's `source`). */
  source: string
  /** Optional — only present for capture-style flows. */
  email?: string
  name?: string
  /** The invite link's raw params (LIVE-2233). Re-read here: the client's copy is never trusted. */
  funnel?: Record<string, string>
  /** The host form's answers (/start/host): what they host, where, and a link to their page. */
  host?: { subject?: string; area?: string; link?: string }
}): Promise<LeadResult> {
  const persona = isPersonaId(input.persona) ? input.persona : 'visitor'
  const archetype = resolveArchetype(persona, input.archetype)
  const flow = (input.flow || '').trim().slice(0, 60)
  const source = (input.source || '').trim().slice(0, 60) || 'lead_flow'
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim().slice(0, 120) || null
  const funnel = input.funnel ? funnelRecord(parseFunnelContext(input.funnel)) : null
  const host = input.host ? cleanHost(input.host) : null

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
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // ROOT-scoped: this lead-flow capture inserts to the root hub (→ root via the contacts_default_space_id
  // trigger), and per-space tenancy (ADR-624) makes an unscoped email lookup a multi-row throw hazard.
  const rootId = await loadRootSpaceId()
  const { data: existing } = rootId
    ? await admin.from('contacts').select('id, display_name, meta').eq('space_id', rootId).eq('email', email).maybeSingle()
    : { data: null }

  const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
  // First-touch acquisition wins (ADR-095) — only resolve if we don't have one.
  const acquisition = existingMeta.acquisition ?? (await resolveAcquisition())

  const meta = {
    ...existingMeta,
    persona,
    // Internal (ADR-1715): never shown to the lead, never sent to a pixel. Never blanks a prior answer.
    archetype: archetype ?? (existingMeta.archetype ?? null),
    lead_flow: flow,
    persona_captured_at: nowIso,
    acquisition,
    // The invite link's attribution, latest link wins (first-touch stays in `acquisition`).
    ...(funnel && hasFunnelSignal(funnel) ? { funnel, lead_source: funnel.src ?? existingMeta.lead_source ?? null } : {}),
    ...(host ? { host } : {}),
  } as unknown as Json

  let contactId: string | null = existing?.id ?? null
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
      const { data: inserted } = await admin
        .from('contacts')
        .insert({
          email,
          display_name: name,
          consent_state: 'unknown',
          source,
          meta,
          last_seen_at: nowIso,
        })
        .select('id')
        .maybeSingle()
      contactId = (inserted as { id: string } | null)?.id ?? null
    }
  } catch (err) {
    console.error('[lead] failed to upsert contact:', err)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  // Enroll the lead in their persona's nurture sequence (ADR-131). Fire-safe — a
  // missing/disabled sequence is a no-op, and it never throws into capture.
  if (contactId) await enrollInNurture({ contactId, email, persona })

  return { ok: true }
}

const LINK_RE = /^https?:\/\/[^\s]{3,300}$/i

/** Keep only what the host form may store: a known subject, a known area (which names its region), and
 *  an http(s) link. The area is editable on the form, so it may differ from the link's region. */
function cleanHost(raw: { subject?: string; area?: string; link?: string }) {
  const subject = findSubject((raw.subject || '').trim())?.key ?? null
  const picked = parseFunnelContext({ area: (raw.area || '').trim() })
  let link: string | null = (raw.link || '').trim().slice(0, 300) || null
  if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`
  if (link && !LINK_RE.test(link)) link = null
  return { subject, area: picked.area?.id ?? null, region: picked.region?.id ?? null, link }
}
