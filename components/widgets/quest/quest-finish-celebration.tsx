import { getCrewContext } from '@/lib/quest/crew-context'
import { readUnseenCompletion } from '@/lib/quest/celebration'
import { HeroMoment } from '@/components/quest/hero-moment'
import { markJourneyCompletionSeen } from '@/app/(main)/crew/seen-actions'

// My Quest layout module (ADR-270/294): the finish / rank-up / season-complete celebration.
// Auto-fires on the next visit after a Journey completion lands, then rests (a seen-marker in
// profiles.meta). Reaching Master (the 3rd finish) fires the distinct season-complete beat that
// re-lights the next goal. The HeroMoment marks it seen on mount, so it fires once. Self-fetching
// RSC keyed to the signed-in member; renders nothing when there is no fresh finish.
export async function QuestFinishCelebration() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const finish = await readUnseenCompletion(ctx.profileId)
  if (!finish) return null

  return (
    <HeroMoment
      journeyTitle={finish.journeyTitle}
      zaps={75}
      rank={finish.rank}
      rankAdvanced={finish.rankAdvanced}
      seasonComplete={finish.seasonComplete}
      next={finish.next}
      trophiesHref="/crew/store"
      onSeen={markJourneyCompletionSeen.bind(null, finish.completionId)}
    />
  )
}
