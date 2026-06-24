import Link from 'next/link'
import { Users, Sparkles } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getResonanceMatchesForPerson, matchStrengthLabel, matchWhyLine } from '@/lib/resonance/surface'

// ALTITUDE 3 - the Person view Resonance tab (Resonance Engine Phase 4 · ADR-385 ·
// docs/NEXT-GEN-CRM.md "The Resonance Graph"). The top reciprocal, consent-first matches for this
// person, each with the plain WHY (shared belonging only, never a stalking-adjacent signal). Reads
// the PERSISTED edges (no graph recompute on the request); every read is fail-safe (empty state).
// Rendered behind its own Suspense on the Person page, so it never blocks the timeline.
//
// authz-delegated: read-only; the page is staff-gated by the /admin/marketing layout. A profileId of
// null (a lead with no login) shows the calm "not a member yet" empty state.

export async function ResonanceSection({ profileId }: { profileId: string | null }) {
  if (!profileId) {
    return (
      <section className="mt-8">
        <SectionHeader title="Resonance" />
        <EmptyState
          icon={Users}
          title="No matches yet"
          description="Once this person becomes a member and turns on matching, the people they would gain from meeting show up here."
        />
      </section>
    )
  }

  const matches = await getResonanceMatchesForPerson(profileId, 5)

  return (
    <section className="mt-8">
      <SectionHeader title="Resonance" count={matches.length} />
      {matches.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No matches yet"
          description="People this member shares a Circle, Journey, practice, or Pillar with, who would also gain from meeting them, show up here. Both sides have to opt in before any intro is sent."
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {matches.map((m) => (
            <li
              key={m.profileId}
              className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {m.handle ? (
                    <Link href={`/people/${m.handle}`} className="font-semibold text-primary-strong hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-text">{m.name}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
                    <Sparkles className="h-3 w-3" aria-hidden /> {matchStrengthLabel(m.score)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{matchWhyLine(m.reasons)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-subtle">
        Matches are reciprocal and consent first. Nothing is sent until both people say yes.
      </p>
    </section>
  )
}
