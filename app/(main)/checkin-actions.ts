'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { recordStreakActivity } from '@/lib/achievements'

// Daily check-in — the return loop that gets members coming back (BACKLOG §F).
// First authenticated visit each day: pay the daily-login gems + tick the login
// streak. Idempotent — guarded by profiles.meta.daily_checkin_date, so it fires
// at most once per day no matter how many pages load.

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // UTC day
}

export interface DailyCheckInResult {
  gems: number
  streak: number | null
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
  const today = todayKey()
  if (meta.daily_checkin_date === today) return null // already checked in today

  // Stamp the date FIRST (idempotency guard) so a double-load can't double-pay.
  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({ meta: { ...meta, daily_checkin_date: today } })
    .eq('id', profile.id)

  const gem = await awardGems(profile.id, 'daily_login')
  const streak = await recordStreakActivity(profile.id, 'login').catch(() => null)

  return { gems: gem.awarded ? gem.amount : 0, streak: streak?.current ?? null }
}
