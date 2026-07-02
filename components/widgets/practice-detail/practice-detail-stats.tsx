import { Zap, Users, Flame, Repeat, Clock } from 'lucide-react'
import { getDetailPractice } from '@/lib/practices/detail-data'
import { practiceZapValue } from '@/lib/zaps'
import { StatCard } from '@/components/ui/stat-card'

// Practice-detail layout module: the headline stats band (reward · cadence · time · practising
// now · times logged). Container-query sizing so it reflows to the column it lands in.
export async function PracticeDetailStats() {
  const practice = await getDetailPractice()
  if (!practice) return null
  return (
    <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-5">
      <StatCard bordered size="sm" icon={Zap} label="Reward per log" value={`+${practiceZapValue(practice)} Zaps`} />
      <StatCard bordered size="sm" icon={Repeat} label="Cadence" value={practice.cadence ?? 'Your call'} />
      {practice.duration_min != null && (
        <StatCard bordered size="sm" icon={Clock} label="Time" value={`${practice.duration_min} min`} />
      )}
      <StatCard bordered size="sm" icon={Users} label="Practising now" value={practice.adopters.toLocaleString()} />
      <StatCard bordered size="sm" icon={Flame} label="Times logged" value={practice.logs_total.toLocaleString()} />
    </div>
  )
}
