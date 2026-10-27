import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { bucketCircleWeeks, CIRCLE_WEEKS_SHOWN, type CircleWeekCell } from './circle-weeks-pure'

// THE CIRCLE'S WEEKS TOGETHER (Circle Stats): for each of the last ten weeks, how many of the Circle's
// members logged a practice here, against how many were on the roster that week. The rule that turns
// a week into a kept week is `circleWeekMetQuorum` (lib/circles/social-fuel.ts), unchanged. The roster
// size per week is read off today's active memberships by `joined_at`; a member who has since left is
// not counted, which can only make a past week look slightly smaller, never larger.
// FAIL-SAFE to no weeks: the stats tab simply leaves the block out.
export const loadCircleWeeks = cache(async (circleId: string): Promise<CircleWeekCell[]> => {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - (CIRCLE_WEEKS_SHOWN + 1) * 7 * 24 * 60 * 60 * 1000).toISOString()
    const [logs, roster] = await Promise.all([
      admin.from('practice_logs').select('profile_id, created_at').eq('circle_id', circleId).gte('created_at', since).limit(5000),
      admin.from('memberships').select('joined_at').eq('circle_id', circleId).eq('status', 'active').limit(2000),
    ])
    return bucketCircleWeeks(
      (logs.data ?? []) as { profile_id: string; created_at: string }[],
      ((roster.data ?? []) as { joined_at: string | null }[]).map((r) => r.joined_at).filter((d): d is string => !!d),
      new Date(),
    )
  } catch (e) {
    console.error('[circle-weeks] read failed; Circle Stats leaves the weeks block out:', e instanceof Error ? e.message : e)
    return []
  }
})
