// Nurture reads (ADR-131). The three nurture_* tables aren't in the generated DB
// types until regen, so we read through an untyped admin handle (repo convention).
// Mutations live in the marketing/nurture actions; the cron drains via runner.ts.
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NurtureSequence, NurtureStep } from '@/lib/nurture/schedule'

function db(): SupabaseClient {
  return createAdminClient()
}

interface SeqRow { id: string; persona: string; name: string; enabled: boolean; created_at: string | null }
interface StepRow {
  id: string; sequence_id: string; step_order: number; delay_hours: number
  subject: string; body: string; enabled: boolean
}

function toSequence(r: SeqRow): NurtureSequence {
  return { id: r.id, persona: r.persona, name: r.name, enabled: r.enabled, createdAt: r.created_at ?? null }
}
function toStep(r: StepRow): NurtureStep {
  return {
    id: r.id,
    sequenceId: r.sequence_id,
    order: r.step_order,
    delayHours: r.delay_hours,
    subject: r.subject,
    body: r.body,
    enabled: r.enabled,
  }
}

export interface SequenceWithStats {
  sequence: NurtureSequence
  steps: NurtureStep[]
  /** Currently-active enrollments working through this sequence. */
  activeEnrollments: number
  /** Enrollments that have finished every step. */
  completedEnrollments: number
}

/** Every sequence with its steps + enrollment counts — powers the admin page. */
export async function listSequencesWithStats(): Promise<SequenceWithStats[]> {
  const { data: seqs } = await db()
    .from('nurture_sequences')
    .select('id, persona, name, enabled, created_at')
  const sequences = (seqs as SeqRow[] | null) ?? []
  if (sequences.length === 0) return []

  const ids = sequences.map((s) => s.id)
  const [{ data: stepRows }, { data: enrRows }] = await Promise.all([
    db().from('nurture_steps').select('id, sequence_id, step_order, delay_hours, subject, body, enabled').in('sequence_id', ids),
    db().from('nurture_enrollments').select('sequence_id, status').in('sequence_id', ids),
  ])

  const steps = (stepRows as StepRow[] | null) ?? []
  const counts = new Map<string, { active: number; completed: number }>()
  for (const e of (enrRows as { sequence_id: string; status: string }[] | null) ?? []) {
    const c = counts.get(e.sequence_id) ?? { active: 0, completed: 0 }
    if (e.status === 'active') c.active += 1
    else if (e.status === 'completed') c.completed += 1
    counts.set(e.sequence_id, c)
  }

  return sequences.map((s) => ({
    sequence: toSequence(s),
    steps: steps.filter((st) => st.sequence_id === s.id).map(toStep).sort((a, b) => a.order - b.order),
    activeEnrollments: counts.get(s.id)?.active ?? 0,
    completedEnrollments: counts.get(s.id)?.completed ?? 0,
  }))
}

/** A persona's sequence + its steps (used at enrollment time), or null. */
export async function getSequenceByPersona(persona: string): Promise<{ sequence: NurtureSequence; steps: NurtureStep[] } | null> {
  const { data } = await db()
    .from('nurture_sequences')
    .select('id, persona, name, enabled, created_at')
    .eq('persona', persona)
    .maybeSingle()
  const seq = data as SeqRow | null
  if (!seq) return null
  const { data: stepRows } = await db()
    .from('nurture_steps')
    .select('id, sequence_id, step_order, delay_hours, subject, body, enabled')
    .eq('sequence_id', seq.id)
  const steps = ((stepRows as StepRow[] | null) ?? []).map(toStep)
  return { sequence: toSequence(seq), steps }
}
