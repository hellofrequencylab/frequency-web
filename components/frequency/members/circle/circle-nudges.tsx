import { createAdminClient } from '@/lib/supabase/admin'
import { loadMatesAtRisk } from '@/components/widgets/leaderboard/leaderboard-consistency'
import { FqNudgeButton } from './nudge-button'

// "Keep someone's streak going" (circleMatesToNudge, lib/circles/social-fuel.ts): up to three Circle-mates
// whose streak is alive, at risk today and worth saving, from THIS Circle's roster. Members only. Renders
// nothing when nobody needs one: an empty box would teach the eye the section is skippable.
export async function FqCircleNudges({ circleId, viewerId }: { circleId: string; viewerId: string }) {
  const mates = await loadMatesAtRisk(createAdminClient(), viewerId, circleId)
  if (mates.length === 0) return null
  return (
    <section className="panel fqc-nudges" aria-label="Keep someone's streak going">
      <div>
        <h2 className="h3">Keep someone&apos;s streak going</h2>
        <p className="fqc-sec-sub">They haven&apos;t logged today. One nudge from someone in the circle often does it.</p>
      </div>
      <ul>
        {mates.map((m) => (
          <li key={m.profileId}>
            <span>
              <span className="t1 fqm-block">{m.name}</span>
              <span className="t2">{m.current}-day streak · not logged today</span>
            </span>
            <FqNudgeButton mateProfileId={m.profileId} mateName={m.name} />
          </li>
        ))}
      </ul>
    </section>
  )
}
