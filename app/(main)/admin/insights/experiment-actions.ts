'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import { getCapabilityOverrides } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExperimentCommand } from '@/lib/analytics/experiments'
import { parseInput } from '@/lib/validation'

/** Only a reviewed catalog entry can be created or run; no code or copy enters from the form. */
export async function manageGrowthExperiment(key: string, command: ExperimentCommand): Promise<{ error?: string }> {
  const caller = await requireAdmin('janitor', { staff: 'insights', staffLevel: 'write' })
  let input: { key: 'upcoming-next-step'; command: ExperimentCommand }
  try {
    input = parseInput(z.object({ key: z.literal('upcoming-next-step'), command: z.enum(['draft', 'start', 'pause', 'finish']) }), { key, command })
  } catch { return { error: 'Unknown experiment or command.' } }
  const db = createAdminClient()
  const invoke = (db.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>).bind(db)
  const { error } = await invoke('analytics_experiment_manage', { _key: input.key, _command: input.command, _actor: caller.profileId })
  if (error) return { error: 'The transition could not be completed. Check migration access, current state and the minimum enrollment period.' }
  revalidatePath('/admin/insights')
  return {}
}

// parse-ok: No client arguments; this authenticated read parses only the database response below.
export async function readGrowthExperiments() {
  const caller = await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  const canWrite = isJanitor(caller.webRole) || staffCan(caller.staffRole, 'insights', 'write', await getCapabilityOverrides())
  try {
    const db = createAdminClient()
    const invoke = (db.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>).bind(db)
    const { data, error } = await invoke('analytics_experiment_results', {})
    if (error) return { state: 'unavailable' as const, rows: [], canWrite: false }
    const count = z.number().int().nonnegative()
    const arm = z.object({ excluded: count, exposed: count, eligible: count, converted: count, pending: count }).refine((a) => a.converted <= a.eligible && a.eligible + a.pending === a.exposed)
    const row = z.object({
      id: z.string().uuid(), key: z.literal('upcoming-next-step'), status: z.enum(['draft','running','paused','completed']),
      startedAt: z.string().datetime({ offset: true }).nullable(), finishedAt: z.string().datetime({ offset: true }).nullable(), guardrailsReviewedAt: z.string().datetime({ offset: true }).nullable(),
      targetPerArm: count.min(30), minimumDays: count.min(7).max(90), conversionDays: count.min(1).max(28), control: arm, treatment: arm,
    })
    const parsed = z.array(row).safeParse(data)
    return parsed.success ? { state: 'available' as const, rows: parsed.data, canWrite } : { state: 'unavailable' as const, rows: [], canWrite: false }
  } catch { return { state: 'unavailable' as const, rows: [], canWrite: false } }
}
