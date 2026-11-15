import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

/** Bounded, server-only bulk purge; membership is never permanent profile history. */
export async function purgeExpiredExperimentAssignments(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString()
  try {
    const db = createAdminClient()
    const invoke = (db.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>).bind(db)
    const { data, error } = await invoke('analytics_experiment_purge', { _cutoff: cutoff })
    if (error || typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) throw new Error('Experiment retention unavailable')
    return data
  } catch {
    log.error('cron.enforce_retention.experiments_purge_failed', { cutoff })
    return 0
  }
}
