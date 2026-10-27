import { FqIcon } from '@/components/frequency/icon'

// THE HOST'S "CIRCLE HEALTH" PANEL (Circle page side column): the circle-scoped numbers the old
// `circle-health` block carried, in the kit. Honest signals only: Zaps earned THROUGH this Circle,
// never members' season totals. Hides itself until there is something to say, like the block did.
export function FqCircleHealthPanel({
  label,
  earnedZaps,
  activeStreaks,
  newThisWeek,
}: {
  label: string
  earnedZaps: number
  activeStreaks: number
  newThisWeek: number
}) {
  if (earnedZaps <= 0) return null
  const cells: [string, string][] = [
    [earnedZaps.toLocaleString(), 'Zaps earned here'],
    [String(activeStreaks), 'Active streaks'],
    [String(newThisWeek), 'New this week'],
  ]
  return (
    <div className="panel stack" data-circle-health>
      <span className="k">
        <FqIcon name="chart" /> {label}
      </span>
      <div className="fqc-health">
        {cells.map(([n, l]) => (
          <div key={l}>
            <span className="num">{n}</span>
            <span className="t2">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
