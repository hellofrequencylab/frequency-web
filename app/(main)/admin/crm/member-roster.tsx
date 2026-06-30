import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { listMembersByFilter, type MemberFilter, type MemberListRow } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { ResonanceTier } from '@/lib/traits/compute'

// THE SHARED MEMBER ROSTER (list-first front door, docs/NEXT-GEN-CRM.md). One list, reused by the
// Resonance CRM's default Members view (?view=members, the cockpit landing) AND the standalone
// /admin/crm/members drill route, so the familiar roster looks the same wherever it lands. Reads
// through the shared listMembersByFilter (no duplicated data access); FAIL-SAFE to a calm empty
// state on an absent matview. Semantic tokens only; copy in voice (no em or en dashes).

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

/** Render the roster for a filter (the full `all` roster, or a tier / lifecycle drill). Reads
 *  lowest-health first via the shared reader. Shows the passed empty copy when nobody is scored. */
export async function MemberRoster({
  filter,
  emptyTitle,
  emptyDescription,
}: {
  filter: MemberFilter
  emptyTitle: string
  emptyDescription: string
}) {
  const rows = await listMembersByFilter(filter)
  if (rows.length === 0) {
    return <EmptyState variant="first-use" title={emptyTitle} description={emptyDescription} />
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {rows.map((row) => (
        <MemberRow key={row.profileId} row={row} />
      ))}
    </ul>
  )
}

function MemberRow({ row }: { row: MemberListRow }) {
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
  return (
    <li>
      {row.contactId ? (
        <Link
          href={`/admin/marketing/contacts/${row.contactId}`}
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
