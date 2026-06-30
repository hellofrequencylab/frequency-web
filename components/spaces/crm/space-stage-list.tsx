import Link from 'next/link'
import { ArrowUpRight, Users } from 'lucide-react'
import { listMembersByFilter, type MemberListRow } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { ResonanceTier } from '@/lib/traits/compute'

// SPACE LIFECYCLE-STAGE DRILL (Altitude 2, Resonance Engine Phase 2 · ADR-383). The list behind a
// funnel step on the Space cockpit: this Space's members at one lifecycle stage, lowest health first,
// each linking to their on-board contact detail (?contact=<id>) so the owner stays inside their Space.
// Reuses listMembersByFilter scoped to the space_id (the SAME reader the platform members drill uses);
// no new data access. FAIL-SAFE: a member with no stitched contact id renders without a drill link
// rather than a dead one. Composes kit primitives only; copy in voice (no em or en dashes).
//
// authz-delegated: read-only; the gate is the Space CRM board page that mounts this (entitlement +
// owner/admin). The space_id is the binding scope; an unknown stage yields an empty list upstream.

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

const TONE_DOT: Record<ResonanceTier, string> = {
  resonant: 'bg-success',
  cooling: 'bg-warning',
  at_risk: 'bg-danger',
}

export async function SpaceStageList({
  spaceId,
  stage,
  boardHref,
}: {
  spaceId: string
  /** The lifecycle_stage to list (validated inside listMembersByFilter). */
  stage: string
  /** The board route the rows drill back into (?contact=<id>). */
  boardHref: string
}) {
  const label = LIFECYCLE_LABELS[stage] ?? 'Members'
  const rows = await listMembersByFilter({ kind: 'lifecycle', value: stage }, { spaceId })

  return (
    <section>
      <SectionHeader title={`${label} members`} count={rows.length} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          variant="first-use"
          title="No one at this stage yet"
          description="Once the overnight refresh scores this Space's members, the ones at this stage show here, each linking to their detail."
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
          {rows.map((row) => (
            <MemberRow key={row.profileId} row={row} boardHref={boardHref} />
          ))}
        </ul>
      )}
    </section>
  )
}

function MemberRow({ row, boardHref }: { row: MemberListRow; boardHref: string }) {
  const inner = (
    <>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[row.resonanceTier]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-text">{row.name}</p>
        <p className="text-xs text-muted">
          Health {Math.round(row.resonanceHealth)} · {tierLabel(row.resonanceTier)}
          {row.lifecycleStage ? ` · ${LIFECYCLE_LABELS[row.lifecycleStage] ?? row.lifecycleStage}` : ''}
        </p>
      </div>
      {row.contactId && (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />
      )}
    </>
  )
  // Only a member stitched to a Space contact has an on-board detail to open.
  return (
    <li>
      {row.contactId ? (
        <Link
          href={`${boardHref}?contact=${row.contactId}`}
          className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/60"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
      )}
    </li>
  )
}
