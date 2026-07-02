import { Users2, Link2, HeartPulse } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { getGraphOverview } from '@/lib/resonance/graph-overview'
import { getPlatformHealth } from '@/lib/dashboard/scores'
import { healthTone } from '@/lib/dashboard/verdict'
import { ToneStat } from '@/app/(main)/admin/crm/tone-stat'

// Resonance Graph layout module (ADR-270/294): the metric row — consented members, live edges, and
// the mean resonance health. Self-fetching RSC; always renders (the counts are the signal even at
// zero). Both reads are fail-safe (degraded / zero), so it degrades to a calm zero row, never a
// crash. The page owns the staff gate, so the module never re-gates.
export async function CrmGraphMetrics() {
  const [overview, { summary }] = await Promise.all([getGraphOverview(), getPlatformHealth()])
  const scored = summary.members

  return (
    <AdminSection>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        <StatCard
          label="Consented members"
          value={overview.degraded ? '0' : overview.consentedMembers}
          icon={Users2}
          detail={overview.degraded ? 'no one opted in yet' : 'opted in to matching'}
        />
        <StatCard
          label="Live connections"
          value={overview.degraded ? '0' : overview.edges}
          icon={Link2}
          detail={overview.degraded ? 'no connections yet' : 'double opt-in ties, still fresh'}
        />
        <ToneStat
          label="Resonance Health"
          value={scored === 0 ? 'Not yet' : Math.round(summary.meanHealth)}
          icon={HeartPulse}
          tone={scored === 0 ? 'flat' : healthTone(summary.meanHealth)}
          detail={scored === 0 ? 'no members scored yet' : `mean across ${scored} scored`}
        />
      </div>
    </AdminSection>
  )
}
