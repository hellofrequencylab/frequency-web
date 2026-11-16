import 'server-only'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { growthSnapshotSchema, type GrowthReading } from './growth'

/** Self-guarded because the snapshot is platform-wide. Failure is never a synthetic zero. */
export async function getGrowthReading(): Promise<GrowthReading> {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })
  try {
    const db = createAdminClient()
    const rpc = (db.rpc as unknown as (name: string, args: { _days: number }) => Promise<{ data: unknown; error: unknown }>).bind(db)
    const { data, error } = await rpc('analytics_growth_snapshot', { _days: 30 })
    if (error) return { state: 'unavailable', message: 'The growth reading is unavailable. Check the analytics migration and database access.' }
    const parsed = growthSnapshotSchema.safeParse(data)
    if (!parsed.success) return { state: 'unavailable', message: 'The growth reading is incomplete. Check the analytics database contract.' }
    return { state: 'available', data: parsed.data }
  } catch {
    return { state: 'unavailable', message: 'The growth reading could not be loaded. Check the database connection.' }
  }
}
