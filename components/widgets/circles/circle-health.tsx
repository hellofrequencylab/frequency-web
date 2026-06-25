import { Zap, Flame, Users } from 'lucide-react'
import { ModuleCard } from '@/components/modules/module-card'
import { getCircleContext } from '@/lib/circles/active-circle'

function HealthStat({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-2xl bg-surface-elevated/60 px-3 py-2.5 text-center">
      <Icon className="w-3.5 h-3.5 text-subtle mx-auto mb-1" />
      <div className="text-lg font-bold text-text leading-none tabular-nums">{value}</div>
      <div className="text-xs text-subtle mt-1">{label}</div>
    </div>
  )
}

export const CircleHealth = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { showsHealth, circleEarnedZaps, activeStreaks, newThisWeek, insightLabel } = ctx

  if (!showsHealth || circleEarnedZaps <= 0) return null
  return (
    <ModuleCard title={insightLabel ?? 'Circle health'}>
      <div className="grid grid-cols-2 gap-2">
        <HealthStat label="Zaps earned here" value={circleEarnedZaps.toLocaleString()} Icon={Zap} />
        <HealthStat label="Active streaks" value={String(activeStreaks)} Icon={Flame} />
        <HealthStat label="New this week" value={String(newThisWeek)} Icon={Users} />
      </div>
    </ModuleCard>
  )
}
