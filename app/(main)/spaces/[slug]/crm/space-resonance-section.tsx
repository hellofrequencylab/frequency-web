import Link from 'next/link'
import { Users, Sparkles } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getSpaceMatchSuggestions, matchStrengthLabel, matchWhyLine } from '@/lib/resonance/surface'

// ALTITUDE 2 - the Space cockpit Resonance section (Resonance Engine Phase 4 · ADR-385 ·
// docs/NEXT-GEN-CRM.md "The Resonance Graph"). "People close by with your vibe": the strongest
// reciprocal, consent-first matches among this Space's reachable, opted-in members. ADDED below the
// existing pipeline / funnel / tasks (which stay intact). Reads the PERSISTED edges (no graph
// recompute on the request); every read is fail-safe (empty state). Rendered behind its own Suspense.
//
// authz-delegated: read-only; the Space CRM board page (canUseCrm: entitlement + owner/admin) already
// authorized the caller before this renders. The spaceId is the binding scope.

export async function SpaceResonanceSection({ spaceId }: { spaceId: string }) {
  const suggestions = await getSpaceMatchSuggestions(spaceId, 5)

  return (
    <section>
      <SectionHeader title="Resonance" count={suggestions.length} />
      {suggestions.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No matches to suggest yet"
          description="When your members turn on matching, the people in your space who share a Circle, Journey, practice, or Pillar and would gain from meeting show up here. Both sides opt in before any intro is sent."
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {suggestions.map((s) => (
            <li
              key={`${s.anchorProfileId}:${s.match.profileId}`}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text">{s.anchorName}</span>
                <span className="text-sm text-subtle">and</span>
                {s.match.handle ? (
                  <Link href={`/people/${s.match.handle}`} className="font-semibold text-primary-strong hover:underline">
                    {s.match.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-text">{s.match.name}</span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
                  <Sparkles className="h-3 w-3" aria-hidden /> {matchStrengthLabel(s.match.score)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{matchWhyLine(s.match.reasons)}</p>
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
