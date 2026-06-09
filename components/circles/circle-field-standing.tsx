import { Sparkles } from 'lucide-react'
import { getCircleFieldStanding } from '@/lib/events/circle-field'
import { ModuleCard } from '@/components/modules/module-card'
import { StatCard } from '@/components/ui/stat-card'

// Circle Field — the circle's *collective* seasonal standing (EVENTS-SYSTEM §6.2).
//
// Collaborative voice only: "our circle has gathered N Field this season" — never
// a ranking against other circles (that dynamic is harmful per §4, Law 2). The
// caller decides visibility: show to members, and publicly only when the circle
// has opted in (circles.resonance_public). This component renders nothing until
// the circle has actually gathered some Field, so a brand-new circle never shows
// an empty/low "0" that would read as a deficit.
//
// Server Component (reads the running total via getCircleFieldStanding). Composes
// the kit (ModuleCard + StatCard) + DAWN semantic tokens only.

export async function CircleFieldStanding({
  circleId,
  circleName,
}: {
  circleId: string
  circleName: string
}) {
  const { seasonField } = await getCircleFieldStanding(circleId)

  // No deficit-framing for a circle that hasn't gathered any Field yet.
  if (seasonField <= 0) return null

  return (
    <ModuleCard title="Circle Field">
      <StatCard
        label="Gathered this season"
        value={seasonField.toLocaleString()}
        icon={Sparkles}
      />
      <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
        Every time someone from {circleName} shows up to a circle gathering, the
        Field grows. This is what we&apos;ve built together this season.
      </p>
    </ModuleCard>
  )
}
