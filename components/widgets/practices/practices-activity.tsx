import { getMyProfileId } from '@/lib/auth'
import { getMemberActivity } from '@/lib/practice-activity'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityChart } from '@/components/widgets/practices/activity-chart'

// Practices layout module (ADR-270/294): "Your activity" — the member's practice as an
// Insight-Timer-style bar chart with Days / Weeks / Months views (components/widgets/practices/
// activity-chart.tsx). Self-fetching RSC: it loads all three series once and hands them to the
// client chart; renders nothing for a logged-out viewer or one with no practices and no logs yet.
// Keeps the id="practices-activity".

export async function PracticesActivity() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const activity = await getMemberActivity(profileId)
  if (!activity.hasAny) return null

  return (
    <section id="practices-activity" className="scroll-mt-20">
      <SectionHeader title="Your activity" />
      <ActivityChart activity={activity} />
    </section>
  )
}
