import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import type { RisingMember } from '@/lib/dashboard/scores'

// The "about to resonate" card (Resonance Engine Phase 2 · ADR-383). Members with high
// activation propensity who are not yet resonant: the overlooked pool worth a reach-out. Each
// row drills to the person timeline (the one front door). Semantic tokens only; copy in voice
// (no em or en dashes).

export function RisingMembers({ members }: { members: RisingMember[] }) {
  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No rising members yet"
        description="When a member shows room to move but has not resonated yet, they show here, so you can reach out before the moment passes."
      />
    )
  }

  return (
    <ul className="grid gap-2 @2xl:grid-cols-2">
      {members.map((m) => {
        // Drill to the member inline on the CRM home (the one front door; no separate member page).
        const href = `/admin/crm?member=${m.profileId}`
        const inner = (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">{m.name}</p>
              <p className="text-xs text-muted">
                Propensity {Math.round(m.activationPropensity)} · Health {Math.round(m.resonanceHealth)}
              </p>
            </div>
            <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            {href && <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />}
          </>
        )
        return (
          <li key={m.profileId}>
            {href ? (
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm transition-colors hover:bg-surface-elevated/60"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
