import { Avatar } from '@/components/ui/avatar'
import type { Health } from '@/lib/calendar/planner/board'
import type { PlanStage } from '@/lib/calendar/planner/types'
import { KINDS } from '@/lib/calendar/planner/kinds'
import { PartnerRing } from './suite-chip'
import type { SuiteContext } from './suite-types'

// THE PARTS A PLAN IS DRAWN WITH, shared by the List, the Kanban and the Timeline: its health pill,
// its stage pill, and the people and Spaces on it. Server-safe; the click is the caller's.

/** The health of a Plan as a pill. The word is always printed, so colour is never the only signal. */
export function HealthPill({ health }: { health: Health }) {
  return (
    <span className="cal-pill" data-health={health.key} style={{ background: health.bg, color: health.fg }}>
      {health.label}
    </span>
  )
}

/** The stage a Plan is in as a pill, in the stage's own colours. `label` is the word a person reads. */
export function StagePill({ stage, label }: { stage: PlanStage; label: string }) {
  const look = KINDS[stage]
  return (
    <span className="cal-pill" style={{ background: look.bg, border: look.bd, color: look.fg }}>
      {label}
    </span>
  )
}

/** The team on a Plan as stacked avatars (four at most), then a ring for each partner Space. */
export function PlanPeople({ team, partnerSpaceIds, ctx }: { team: readonly string[]; partnerSpaceIds: readonly string[]; ctx: SuiteContext }) {
  const people = team.map((id) => ctx.teamById.get(id)).filter((m): m is NonNullable<typeof m> => !!m)
  const shown = people.slice(0, 4)
  const partners = partnerSpaceIds.map((id) => ctx.spaceNames[id]).filter((n): n is string => !!n)
  if (!shown.length && !partners.length) return null
  return (
    <span className="cal-people">
      {shown.length ? (
        <span className="cal-stack" role="img" aria-label={people.map((m) => m.name).join(', ')}>
          {shown.map((m) => (
            <Avatar key={m.id} src={m.avatarUrl} name={m.name} size="xs" />
          ))}
        </span>
      ) : null}
      {partners.map((name) => (
        <PartnerRing key={name} name={name} />
      ))}
    </span>
  )
}
