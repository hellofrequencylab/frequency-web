'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { recordStreakActivity } from '@/lib/achievements'

// Daily check-in — the return loop that gets members coming back (BACKLOG §F).
// First authenticated visit each day: pay the daily-login gems + tick the login
// streak. Idempotent — guarded by profiles.meta.daily_checkin_date, so it fires
// at most once per day no matter how many pages load.

function dayKey(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10) // UTC day
}

export interface DailyCheckInResult {
  gems: number
  /** Consecutive-day visit streak (the number to chase). */
  dayStreak: number
}

export async function dailyCheckIn(): Promise<DailyCheckInResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const meta = (profile.meta ?? {}) as Record<string, unknown>
  const today = dayKey()
  if (meta.daily_checkin_date === today) return null // already checked in today

  // Consecutive-day streak: bump if yesterday was the last check-in, else restart.
  const prev = Number(meta.daily_checkin_streak ?? 0)
  const dayStreak = meta.daily_checkin_date === dayKey(1) ? prev + 1 : 1

  // Stamp date + streak FIRST (idempotency guard) so a double-load can't double-pay.
  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({ meta: { ...meta, daily_checkin_date: today, daily_checkin_streak: dayStreak } })
    .eq('id', profile.id)

  const gem = await awardGems(profile.id, 'daily_login')
  await recordStreakActivity(profile.id, 'login').catch(() => null) // weekly active streak too

  return { gems: gem.awarded ? gem.amount : 0, dayStreak }
}
