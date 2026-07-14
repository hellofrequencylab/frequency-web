'use server'

// Persona selection log (ADR-125 funnel instrumentation). Owner directive: "in the general splash
// funnel, it needs to log what they selected, and cue them up for future onboarding sequences." Today a
// persona pick lives ONLY in client cookies (fq_persona / fq_personas) and reaches the DB solely at full
// completion (writeBetaInduction), so abandoners and cross-device losses are never captured. This records
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

import { track } from '@/lib/analytics/track'
import { resolveAcquisition } from '@/lib/attribution/server'
import { isPersonaId } from '@/lib/onboarding/personas'

/**
 * Record the visitor's current persona selection (best-effort, anonymous-safe). Called from the picker
 * when a persona is toggled. Never throws; never blocks the UI.
 */
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
    await track(
      'feature.used',
      {
        feature: 'onboarding_persona_select',
        persona,
        personas: personas.join(','),
        count: personas.length,
        sequence: input.sequence ?? '',
        channel: acq.channel,
      },
      null, // no actor: the visitor is anonymous at selection time
    )
  } catch {
    // Selection logging is best-effort; it must never block or break onboarding.
  }
}
