import { Flame, Shield, ShieldOff } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// The streak + shields strip (docs/JOURNEYS.md §7, §10). The daily practice streak is the
// headline retention metric (profiles.current_streak / longest_streak); shields are earned
// freeze-tokens (streaks.freeze_tokens, cap 2) that save a streak on a missed day. Async
// Server Component — self-fetches, best-effort, sits behind its own <Suspense>.

const SHIELD_CAP = 2

async function loadStreak(profileId: string) {
  try {
    const admin = createAdminClient()
    const [{ data: profile }, { data: streakRows }] = await Promise.all([
      admin.from('profiles').select('current_streak, longest_streak').eq('id', profileId).maybeSingle(),
      admin.from('streaks').select('freeze_tokens').eq('profile_id', profileId),
    ])
    const p = profile as { current_streak?: number; longest_streak?: number } | null
    const shields = Math.min(
      SHIELD_CAP,
      ((streakRows as { freeze_tokens: number }[] | null) ?? []).reduce((n, r) => Math.max(n, r.freeze_tokens ?? 0), 0),
    )
    return { current: p?.current_streak ?? 0, longest: p?.longest_streak ?? 0, shields }
  } catch {
    return { current: 0, longest: 0, shields: 0 }
  }
}

export async function StreakStrip({ profileId }: { profileId: string }) {
  const { current, longest, shields } = await loadStreak(profileId)

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Flame className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold tabular-nums text-text">
            {current}-day streak
            {current > 0 && current >= longest && longest > 0 && (
              <span className="ml-1.5 text-xs font-medium text-success">personal best</span>
            )}
          </p>
          <p className="text-xs text-subtle">
            {longest > 0 ? `Longest ${longest} days` : 'Log a practice to start your streak'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5" aria-label={`${shields} of ${SHIELD_CAP} shields`}>
        {Array.from({ length: SHIELD_CAP }, (_, i) =>
          i < shields ? (
            <Shield key={i} className="h-5 w-5 text-signal" aria-hidden />
          ) : (
            <ShieldOff key={i} className="h-5 w-5 text-subtle/50" aria-hidden />
          ),
        )}
        <span className="ml-1 text-xs font-medium text-subtle">
          {shields} {shields === 1 ? 'shield' : 'shields'}
        </span>
      </div>
    </section>
  )
}
