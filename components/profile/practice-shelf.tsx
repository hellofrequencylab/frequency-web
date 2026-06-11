// The Practice Shelf (Rewards Economy v2) — the profile module listing every
// practice the member has earned an award on, from either per-practice ladder:
// consistency (In Motion → Full Cycle) and depth (10 → 100 Deep). Full Cycle
// adds the permanent ring treatment. Sorted deepest-first by the lib read.
// Server Component; render inside <Suspense> from the profile page.

import { Flame, Repeat } from 'lucide-react'
import { getPracticeShelf } from '@/lib/practice-shelf'
import { listWitnessedAwards } from '@/lib/awards/witnessed'
import { SectionHeader } from '@/components/ui/section-header'

export async function PracticeShelf({ profileId, isOwner, firstName }: {
  profileId: string
  isOwner: boolean
  firstName: string
}) {
  const [shelf, witnessed] = await Promise.all([
    getPracticeShelf(profileId),
    listWitnessedAwards(profileId),
  ])
  if (shelf.length === 0 && witnessed.length === 0) return null

  return (
    <div className="mb-6">
      <SectionHeader title="Practice Shelf" count={shelf.length || undefined} />
      {shelf.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {shelf.map((e) => (
            <div
              key={e.practiceId}
              className={`flex items-center gap-3 rounded-2xl border bg-surface-elevated/60 px-3 py-2.5 ${
                e.fullCycle ? 'border-primary ring-1 ring-primary/40' : 'border-border'
              }`}
            >
              <Repeat className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{e.title}</p>
                <p className="text-xs text-subtle">
                  {e.tier ? e.tier.label : 'Building'}
                  {e.depthMark ? ` · ${e.depthMark} Deep` : ''}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-muted">
                <Flame className="h-3.5 w-3.5 text-primary" />
                {e.lifetimeLogs.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {witnessed.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {witnessed.map((w) => (
            <span
              key={`${w.slug}-${w.grantedAt}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-primary"
              title={`Season ${w.season}`}
            >
              {w.label}
              <span className="text-subtle">
                · from {w.grantedBy.displayName ?? 'a member'}
              </span>
            </span>
          ))}
        </div>
      )}

      {isOwner && shelf.length === 0 && witnessed.length === 0 ? null : !isOwner && (
        <p className="mt-2 text-xs text-subtle">
          What {firstName} keeps showing up for.
        </p>
      )}
    </div>
  )
}
