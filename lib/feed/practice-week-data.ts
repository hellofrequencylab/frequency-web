import { createClient } from '@/lib/supabase/server'
import { buildPracticeWeek } from './practice-week'
/** Called only for the authenticated viewer's own Feed. Bounded ten-day read covers the local week. */
export async function loadPracticeWeek(profileId: string) {
  const supabase = await createClient()
  const now = new Date()
  const since = new Date(now.getTime() - 10 * 86400000).toISOString()
  const [profile, sessions, logs] = await Promise.all([
    supabase.from('profiles').select('home_timezone').eq('id', profileId).maybeSingle(),
    supabase.from('practice_sessions').select('practice_id, seconds, ended_at').eq('profile_id', profileId).gte('ended_at', since).lte('ended_at', now.toISOString()),
    supabase.from('practice_logs').select('practice_id, logged_for, completed, seconds_done, seconds_target').eq('profile_id', profileId).gte('logged_for', since.slice(0, 10)),
  ])
  if (profile.error || sessions.error || logs.error) return null
  return buildPracticeWeek(sessions.data ?? [], logs.data ?? [], profile.data?.home_timezone ?? null, now)
}
