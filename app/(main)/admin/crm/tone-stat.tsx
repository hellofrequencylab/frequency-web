import type { LucideIcon } from 'lucide-react'
import { StatCard, type StatDelta } from '@/components/ui/stat-card'
import type { TierTone } from '@/lib/dashboard/verdict'

// A health-toned StatCard for the cockpit (Resonance Engine Phase 2 · ADR-383). The shared
// StatCard keeps its value in the neutral text token; this wrapper adds a small colored tier
// dot before the label so a green/amber/red reading is legible at a glance without restyling
// the value (the audits warned against loud, over-colored stat values). Semantic tokens only
// (no hardcoded hex). 'flat' = no health signal yet (e.g. an unscored platform).

const DOT: Record<TierTone | 'flat', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  flat: 'bg-subtle',
}

export function ToneStat({
  label,
  value,
  icon,
  tone,
  delta,
  detail,
  href,
}: {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone: TierTone | 'flat'
  delta?: StatDelta
  detail?: React.ReactNode
  href?: string
}) {
  return (
    <StatCard
      label={
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
          {label}
        </span>
      }
      value={value}
      icon={icon}
      delta={delta}
      detail={detail}
      href={href}
    />
  )
}
