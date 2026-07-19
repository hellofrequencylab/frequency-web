import { Activity, HeartPulse, TrendingUp, Users } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { getSpaceHealth } from '@/lib/dashboard/scores'
import { healthTone } from '@/lib/dashboard/verdict'
import { ToneStat } from '@/app/(main)/admin/crm/tone-stat'

// The SPACE Resonance CRM stat row (ADR-789): the space-scoped twin of the admin `CrmHealthStatRow` —
// Members / Active this week / At risk / Resonance Health, the SAME four cards + tones, read from
// `getSpaceHealth(spaceId)` instead of the platform health. Self-fetching + fail-safe (zeros). The caller
// has already gated on space-manage, so this never re-gates. Drill hrefs are omitted (the roster below
// carries the Tier filter); everything else matches the admin row exactly.

export async function SpaceCrmHealthStatRow({ spaceId }: { spaceId: string }) {
  const summary = await getSpaceHealth(spaceId)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Members"
        value={summary.members}
        icon={Users}
        detail={summary.members === 1 ? 'scored member' : 'scored members'}
      />
      <ToneStat
        label="Active this week"
        value={summary.weeklyActive}
        icon={TrendingUp}
        tone="success"
        detail={summary.members === 0 ? 'no members scored yet' : `of ${summary.members} scored`}
      />
      <ToneStat
        label="At risk"
        value={summary.atRisk}
        icon={Activity}
        tone={summary.atRisk > 0 ? 'danger' : 'success'}
        detail="in the red tier"
      />
      <ToneStat
        label="Resonance Health"
        value={summary.members === 0 ? '–' : Math.round(summary.meanHealth)}
        icon={HeartPulse}
        tone={summary.members === 0 ? 'flat' : healthTone(summary.meanHealth)}
        detail={`across ${summary.members} scored`}
      />
    </div>
  )
}
