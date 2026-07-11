import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'

// WAVE 2: STATS — the Beta metrics dashboard (funnel, activation, retention, waves sent).
//
// CONTRACT (for the Wave-2 stats agent):
//   • Export a default-style async Server Component named `BetaStatsSection` from THIS
//     file (keep the name; the page switch imports it by name).
//   • It plugs into app/(main)/admin/beta/page.tsx at `tab === 'stats'`. No prop is
//     passed today; if you need the active phase, read `?phase=` in the page and pass it.
//   • Data: reuse lib/studio/analytics.ts (getEmailStats), lib/studio/beta.ts
//     (summarizeBeta), and lib/beta/phases.ts / lib/beta/approvals.ts (waves sent).
//     Compose StatCard + components/admin/spark-charts.tsx. Stream slow reads behind
//     per-block <Suspense> (PAGE-FRAMEWORK §5). Semantic tokens only.
export function BetaStatsSection() {
  return (
    <AdminSection title="Stats">
      <EmptyState
        variant="first-use"
        title="The stats board lands in Wave 2"
        description="Funnel, activation, retention, and the read on every wave sent will live here."
      />
    </AdminSection>
  )
}
