import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { scoreProfileCompleteness, type CompletenessInput } from '@/lib/spaces/completeness'
import { ProgressTrack } from '@/components/ui/progress-track'

// PROFILE READINESS CARD — the operator-facing "how findable is my Space" indicator, seated at the top
// of the Basics editor (the Identity surface). It scores the SEO / answer-engine-relevant fields the
// public profile's structured data reads (spaceSchema in lib/jsonld.ts) and shows a meter + a short
// "what's left" checklist so the operator can see, and close, the gaps.
//
// A SERVER COMPONENT with NO reads of its own: the Basics page resolves the fields (off the Space, its
// central profileData, and the reviews summary) and passes the primitives in, so the scorer stays pure
// and this card just renders. It is fully additive — it registers no console module and touches no menu
// contract, it simply sits above the existing form. COPY runs CONTENT-VOICE: plain labels, no narrated
// feelings, no em/en dashes.

export function ProfileCompletenessCard({ input }: { input: CompletenessInput }) {
  const report = scoreProfileCompleteness(input)
  // Tone the meter by how far along the profile is: a full profile reads as success, a mostly-there one
  // as primary, an early one as a quiet warning nudge. Tokens only, never a hex.
  const tone =
    report.score >= 100 ? 'success' : report.score >= 50 ? 'primary' : 'warning'
  const scoreColor =
    tone === 'success' ? 'text-success' : tone === 'primary' ? 'text-primary-strong' : 'text-warning'

  const headline =
    report.score >= 100
      ? 'Your profile is search-ready.'
      : `${report.done} of ${report.total} basics done. Fill the rest to be more findable.`

  return (
    <section
      aria-labelledby="profile-readiness-heading"
      className="mb-6 rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="profile-readiness-heading" className="text-sm font-bold tracking-tight text-text">
          Search readiness
        </h2>
        <span className={cn('text-sm font-bold tabular-nums', scoreColor)}>{report.score}%</span>
      </div>

      {/* The meter. ProgressTrack carries the progressbar role and the score for a screen reader. */}
      <ProgressTrack
        value={report.score}
        tone={tone}
        size="lg"
        animate
        className="mt-3 w-full"
        label="Profile completeness"
      />

      <p className="mt-2.5 text-xs text-muted">{headline}</p>

      {/* The checklist: every tracked field, done first (a quiet check) then the still-missing ones with
          their plain "why it matters" hint. When everything is done the list still shows the finished
          set, so the operator sees the full picture rather than an empty card. */}
      <ul className="mt-4 space-y-2">
        {report.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5">
            {item.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  item.done ? 'text-subtle line-through decoration-subtle/40' : 'text-text',
                )}
              >
                {item.label}
              </p>
              {!item.done && <p className="text-xs text-muted">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
