'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE FIDELITY CHOICE (docs/STUDIO.md, lib/studio/kernel/fidelity.ts).
//
// Three buttons, asked right before a Spark drafts: Exact, Edit, Rewrite. A pasted write-up used
// to come back as a few short rewritten lines, because every Spark rewrote by default. This puts
// the author in charge of how much of their own text survives.
//
// Entity-blind like the rest of the kit: it takes a value and a setter and knows nothing about
// Circles, Journeys or Events. The wizard passes the choice to its draft action.
// ─────────────────────────────────────────────────────────────────────────────

import { SegmentedControl } from '@/components/ui/segmented-control'
import { SEED_FIDELITIES, type SeedFidelity } from '@/lib/studio/kernel/fidelity'

const SEGMENTS = SEED_FIDELITIES.map((f) => ({ value: f.key, label: f.label, className: 'flex-1' }))

export interface SparkFidelityProps {
  value: SeedFidelity
  onChange: (next: SeedFidelity) => void
}

export function SparkFidelity({ value, onChange }: SparkFidelityProps) {
  const selected = SEED_FIDELITIES.find((f) => f.key === value) ?? SEED_FIDELITIES[0]

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-body-sm font-semibold text-text">What should Vera do with your words?</p>
      <SegmentedControl
        label="What should Vera do with your words?"
        value={value}
        onChange={onChange}
        segments={SEGMENTS}
        className="mt-2.5 flex w-full"
      />
      <p className="mt-2 text-2xs leading-relaxed text-muted" aria-live="polite">
        {selected.hint}
      </p>
    </div>
  )
}
