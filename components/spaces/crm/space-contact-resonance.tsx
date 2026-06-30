import Link from 'next/link'
import { Sparkles, Users } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getResonanceMatchesForPerson, matchStrengthLabel, matchWhyLine } from '@/lib/resonance/surface'

// SPACE PERSON-DETAIL RESONANCE (Altitude 3 · Resonance Engine Phase 4 · ADR-385). The top reciprocal,
// consent-first matches for one contact, shown on the Space CRM contact detail. Mirrors the platform
// Person view's resonance tab but scoped to the Space surface (the same fail-safe reader, which already
// respects the matched person's last-mile opt-out). Reads the PERSISTED edges, never recomputes the
// graph on a request, and is member-only: a lead (no profile) shows the calm "not a member yet" state.
// Composes kit primitives only; copy in voice (no em or en dashes, the WHY is shared belonging only).
//
// authz-delegated: read-only; the gate is the Space CRM board page that mounts the detail (entitlement
// + owner/admin). The profileId is the binding scope.

export async function SpaceContactResonance({ profileId }: { profileId: string | null }) {
  if (!profileId) {
    return (
      <section>
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
    <section>
      <SectionHeader title="Resonance" count={matches.length} />
      {matches.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No matches yet"
          description="People this member shares a Circle, Journey, practice, or Pillar with, who would also gain from meeting them, show up here. Both sides have to opt in before any intro is sent."
        />
      ) : (
        <ul className="space-y-2">
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
