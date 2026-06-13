// Enroll a captured lead into their persona's nurture sequence (ADR-131). Called
// fire-safe from captureLead — must never throw into the capture path. Idempotent via
// the unique (sequence_id, contact_id) constraint: a re-captured lead won't double
// enroll. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSequenceByPersona } from '@/lib/nurture/store'
import { firstStep, runAtFrom } from '@/lib/nurture/schedule'

export async function enrollInNurture(input: {
  contactId: string
  email: string
  persona: string
}): Promise<void> {
  try {
    const seq = await getSequenceByPersona(input.persona)
    if (!seq || !seq.sequence.enabled) return // no enabled sequence for this persona
    const start = firstStep(seq.steps)
    if (!start) return // sequence has no sendable steps yet

    const db = createAdminClient()
    await db
      .from('nurture_enrollments')
      .upsert(
        {
          sequence_id: seq.sequence.id,
          contact_id: input.contactId,
          email: input.email,
          persona: input.persona,
          status: 'active',
          next_step_order: start.order,
          next_run_at: runAtFrom(Date.now(), start.delayHours),
        },
        { onConflict: 'sequence_id,contact_id', ignoreDuplicates: true },
      )
  } catch (err) {
    console.error('[nurture] enroll failed:', err)
  }
}
