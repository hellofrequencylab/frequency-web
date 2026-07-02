import { Trophy } from 'lucide-react'
import { getCircleContext } from '@/lib/circles/active-circle'
import { getCircleChallenges } from '@/lib/circles/challenges'

// The movable "Challenges" block (the `circle-challenges` layout module, paired with the Engage
// editor). A zero-prop self-fetching RSC reading the active circle from the request-scoped context
// (lib/circles/active-circle.ts). It shows the shared season challenges the circle has taken on
// together, each with the circle's COLLECTIVE progress ("N of M done"). Read-only and member-facing;
// it returns null when the circle has adopted nothing, so it never leaves an empty slot. DAWN tokens
// only; container-query friendly.

export const CircleChallengesBlock = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null

  const challenges = await getCircleChallenges(ctx.circle.id)
  if (challenges.length === 0) return null

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
        <Trophy className="h-4 w-4 shrink-0 text-primary-strong" />
        Challenges we&apos;re taking on
      </h3>
      <ul className="space-y-3">
        {challenges.map((c) => {
          const pct =
            c.memberCount > 0 ? Math.min(100, Math.round((c.membersCompleted / c.memberCount) * 100)) : 0
          return (
            <li key={c.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-text">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {c.membersCompleted} of {c.memberCount} done
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
