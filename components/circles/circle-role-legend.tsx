import { CircleRoleChip } from '@/components/circles/circle-role-chip'
import { CIRCLE_ROLE_SUMMARY, type CircleRole } from '@/lib/core/circle-roles'

// "What each one can do" — the read-only half of the role control (ADR-1014).
//
// The picker asks a question about one person; this answers the question the Host asks once,
// the first time they use it. So it is a DISCLOSURE, collapsed by default, sitting under the
// roster rather than beside every row: four rungs printed four times would be noise on a
// roster of four people.
//
// Read-only on purpose. Every line here is `CIRCLE_ROLE_SUMMARY` from lib/core/circle-roles,
// the same source the picker's labels come from, so the explanation and the capability
// mapping cannot drift into disagreeing about what an Admin does.

const RUNGS: readonly CircleRole[] = ['host', 'admin', 'moderator', 'member'] as const

export function CircleRoleLegend() {
  return (
    <details className="mt-6 rounded-card border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-body-sm font-semibold text-text">
        What each role can do
      </summary>
      <dl className="space-y-3 border-t border-border px-4 py-3">
        {RUNGS.map((rung) => (
          <div key={rung} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
            <dt className="shrink-0 sm:w-28">
              <CircleRoleChip role={rung} />
            </dt>
            <dd className="text-body-sm leading-relaxed text-muted">{CIRCLE_ROLE_SUMMARY[rung]}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border px-4 py-3 text-meta text-subtle">
        Only the Host sets roles. Roles stay with the circle, so leaving the circle ends the role.
      </p>
    </details>
  )
}
