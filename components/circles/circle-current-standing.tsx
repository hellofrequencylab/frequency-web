import { Sparkles } from 'lucide-react'
import { getCircleCurrentStanding } from '@/lib/events/circle-current'
import { ModuleCard } from '@/components/modules/module-card'
import { StatCard } from '@/components/ui/stat-card'

// Circle Current — the circle's *collective* seasonal standing (EVENTS-SYSTEM §6.2).
//
// Collaborative voice only: "our circle has built N Current this season" — never
// a ranking against other circles (that dynamic is harmful per §4, Law 2). The
// caller decides visibility: show to members, and publicly only when the circle
// has opted in (circles.resonance_public). This component renders nothing until
// the circle has actually built some Current, so a brand-new circle never shows
// an empty/low "0" that would read as a deficit.
//
// Server Component (reads the running total via getCircleCurrentStanding). Composes
// the kit (ModuleCard + StatCard) + DAWN semantic tokens only.

export async function CircleCurrentStanding({
  circleId,
  circleName,
}: {
  circleId: string
  circleName: string
}) {
  const { seasonCurrent } = await getCircleCurrentStanding(circleId)

  // No deficit-framing for a circle that hasn't built any Current yet.
  if (seasonCurrent <= 0) return null

  return (
    <ModuleCard title="Circle Current">
      <StatCard
        label="Built this season"
        value={seasonCurrent.toLocaleString()}
        icon={Sparkles}
      />
      <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
        Every time someone from {circleName} shows up to a circle gathering, the
        Current builds. This is what we&apos;ve built together this season.
      </p>
    </ModuleCard>
  )
}
