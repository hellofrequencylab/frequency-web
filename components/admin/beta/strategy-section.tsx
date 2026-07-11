import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'

// WAVE 2: STRATEGY — the narrative brief behind the launch (the why, the bets, the
// guardrails), editable in place.
//
// CONTRACT (for the Wave-2 strategy agent):
//   • Export `BetaStrategySection` from THIS file (the page switch imports it by name).
//   • Plugs into page.tsx at `tab === 'strategy'`.
//   • Data: the phase goals already live in beta_phases (lib/beta/phases.ts — goal /
//     summary). Render the strategy as the phase goals plus an editable brief; if you
//     add a store, prefer a single `beta_settings`-style row over a new table, and gate
//     writes on writerGate (lib/beta/guard.ts). No sends originate here.
export function BetaStrategySection() {
  return (
    <AdminSection title="Strategy">
      <EmptyState
        variant="first-use"
        title="The strategy brief lands in Wave 2"
        description="The why behind the launch, the bets, and the guardrails, editable in place."
      />
    </AdminSection>
  )
}
