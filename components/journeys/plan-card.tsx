import Image from 'next/image'
import { Globe, Link2, Lock, Users } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import type { JourneyPlan } from '@/lib/journey-plans'

// The shared Journey browse card (lifted out of app/(main)/journeys/page.tsx so the member-page
// layout modules — journeys-mine, journeys-library — render an identical card). Presentational.

export function PlanFace({ plan }: { plan: JourneyPlan }) {
  if (plan.cover_image) {
    return (
      <Image src={plan.cover_image} alt={plan.title} width={44} height={44} className="h-11 w-11 rounded-2xl object-cover" />
    )
  }
  const Icon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-2xl"
      style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}

export function PlanCard({ plan, mine }: { plan: JourneyPlan; mine: boolean }) {
  return (
    <EntityCard
      href={`/journeys/${plan.slug}`}
      anchor={<PlanFace plan={plan} />}
      title={plan.title}
      badge={
        mine ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
            {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : plan.visibility === 'unlisted' ? <Link2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
          </span>
        ) : undefined
      }
      description={plan.summary ?? undefined}
      meta={
        !mine && plan.adopt_count > 0 ? (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {plan.adopt_count} {plan.adopt_count === 1 ? 'person' : 'people'}
          </span>
        ) : undefined
      }
    />
  )
}
