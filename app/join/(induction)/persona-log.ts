'use server'

// Persona selection log (ADR-125 funnel instrumentation). Owner directive: "in the general splash
// funnel, it needs to log what they selected, and cue them up for future onboarding sequences." Today a
// persona pick lives ONLY in client cookies (fq_persona / fq_personas) and reaches the DB solely at full
// completion (writeInduction), so abandoners and cross-device losses are never captured. This records
// the pick at SELECTION time.
//
// The visitor is usually ANONYMOUS here (no profile / email yet), so this logs an anonymous-safe
// engagement event (actor = null, keyed by first-touch attribution) into the engagement ledger, NOT a
// profile write. Best-effort and fail-safe: it swallows every error and returns void, so a logging hiccup
// can never block or break the induction. Debounced on the client (induction.tsx).
//
// Taxonomy note: this rides the registered `feature.used` event (lib/analytics/events) with a
// `feature: 'onboarding_persona_select'` discriminator, because the analytics taxonomy is a governed
// registry we do not edit from here. A dedicated `onboarding.persona_selected` event would be cleaner but
// needs a one-line taxonomy registry edit (a shared seam) — see the handoff report.

import { sanitizeProps } from '@/lib/analytics/sanitize'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { resolveAcquisition } from '@/lib/attribution/server'
import { isPersonaId } from '@/lib/onboarding/personas'

/**
 * Record the visitor's current persona selection (best-effort, anonymous-safe). Called from the picker
 * when a persona is toggled. Never throws; never blocks the UI.
 */
// authz-ok: anonymous by design. The only write is an actor-less engagement event (track with a
// null actor), an append-only ledger row keyed by first-touch attribution; no profile is read or
// written, and the persona value is validated against the registry before it is recorded.
export async function logPersonaSelection(input: {
  persona: string
  personas: string[]
  sequence?: string
}): Promise<void> {
  try {
    const persona = isPersonaId(input.persona) ? input.persona : null
    if (!persona) return
    const personas = (Array.isArray(input.personas) ? input.personas : []).filter(isPersonaId)
    // Anonymous-safe attribution key: the first-touch channel + any beta-sequence signal, so an
    // abandoned selection is still tied to how the visitor arrived without any profile write.
    const acq = await resolveAcquisition()
    // LIVE-810: a persona is who someone says they are, so it is first-party only. This writes
    // the engagement ledger directly instead of going through track(), which would also mirror
    // the event to Google Analytics. Same row shape track() writes (source web, feature.used).
    await recordEngagementEvent({
      idempotencyKey: `track:feature.used:anon:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      source: 'web',
      eventType: 'feature.used',
      actorProfileId: null, // no actor: the visitor is anonymous at selection time
      context: sanitizeProps({
        feature: 'onboarding_persona_select',
        persona,
        personas: personas.join(','),
        count: personas.length,
        sequence: input.sequence ?? '',
        channel: acq.channel,
      }),
    })
  } catch {
    // Selection logging is best-effort; it must never block or break onboarding.
  }
}
