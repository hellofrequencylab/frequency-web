import { Users, Radio } from 'lucide-react'

// The Chorus — circle-companions strip (docs/JOURNEYS.md §9.1). When other members of your
// circles also hold this journey, you're "doing it together." A Chorus forms at ≥3 active
// members on the same journey; counting the viewer, that's when `circleCompanions` reaches 2.
// This is the lightweight signal — the full shared meter is later (§9.1 Phase 2). Server
// Component, token colors only. ("Chorus", not "Resonance" — that term is the Connection
// Layer's, ADR-186.)
//
// `circleCompanions` excludes the viewer, so the chorus size including you is companions + 1.

const CHORUS_THRESHOLD = 3 // active members (incl. viewer) for a Chorus to form

export function ChorusStrip({ companions }: { companions: number }) {
  if (companions <= 0) return null
  const total = companions + 1 // include the viewer
  const forming = total >= CHORUS_THRESHOLD

  return (
    <section
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm ${
        forming ? 'border-signal-bg bg-signal-bg/40' : 'border-border bg-surface'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          forming ? 'bg-signal-bg text-signal-strong' : 'bg-surface-elevated text-muted'
        }`}
      >
        {forming ? <Radio className="h-5 w-5" /> : <Users className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">
          {forming ? 'Your circle is in chorus' : 'You’re not walking alone'}
        </p>
        <p className="text-xs leading-relaxed text-muted">
          {forming
            ? `${total} from your circles are on this journey together — a Chorus is forming.`
            : `${companions} ${companions === 1 ? 'person' : 'people'} from your circles ${
                companions === 1 ? 'is' : 'are'
              } on this journey too.`}
        </p>
      </div>
    </section>
  )
}
