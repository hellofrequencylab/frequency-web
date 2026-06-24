import Link from 'next/link'
import { ArrowUpRight, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { listMembersByFilter, type MemberFilter, type MemberListRow } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { ResonanceTier } from '@/lib/traits/compute'

// The cockpit drill-down member list (Resonance Engine Phase 2 · ADR-383). Every chart point on
// the platform cockpit lands here: a tier band (?tier=at_risk) or a lifecycle step (?stage=new),
// listed lowest-health first, each member drilling on to the contact_interactions timeline (the
// one front door). STAFF-GATED like the cockpit. FAIL-SAFE: an unknown filter or an absent matview
// shows a calm empty state. Semantic tokens only; copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

const TIER_VALUES: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']
const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

/** Resolve the URL params into a validated filter + a human title. Returns null for no/invalid filter. */
function resolveFilter(tier?: string, stage?: string): { filter: MemberFilter; title: string } | null {
  if (tier && (TIER_VALUES as readonly string[]).includes(tier)) {
    return { filter: { kind: 'tier', value: tier as ResonanceTier }, title: `${tierLabel(tier as ResonanceTier)} members` }
  }
  if (stage && LIFECYCLE_LABELS[stage]) {
    return { filter: { kind: 'lifecycle', value: stage }, title: `${LIFECYCLE_LABELS[stage]} members` }
  }
  return null
}

const TONE_DOT: Record<ResonanceTier, string> = {
  resonant: 'bg-success',
  cooling: 'bg-warning',
  at_risk: 'bg-danger',
}

export default async function CockpitMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; stage?: string }>
}) {
  await requireAdmin('janitor')
  const { tier, stage } = await searchParams
  const resolved = resolveFilter(tier, stage)

  if (!resolved) {
    return (
      <AdminTemplate title="Members" eyebrow="CRM" icon={Users} back={{ href: '/admin/crm', label: 'Resonance cockpit' }} width="default">
        <EmptyState
          variant="no-results"
          title="Pick a group to view"
          description="Open this from the cockpit by tapping a tier or a lifecycle stage. That tells it which members to list."
        />
      </AdminTemplate>
    )
  }

  const rows = await listMembersByFilter(resolved.filter)

  return (
    <AdminTemplate
      title={resolved.title}
      eyebrow="CRM"
      icon={Users}
      description="Lowest health first. Tap anyone to open their full timeline."
      back={{ href: '/admin/crm', label: 'Resonance cockpit' }}
      width="default"
    >
      <AdminSection>
        {rows.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="No members in this group yet"
            description="Once the overnight refresh scores members, the ones in this group show here, each linking to their timeline."
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
            {rows.map((row) => (
              <MemberRow key={row.profileId} row={row} />
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminTemplate>
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
