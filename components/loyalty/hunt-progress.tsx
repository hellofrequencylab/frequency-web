import Link from 'next/link'
import { Flag, Gift } from 'lucide-react'
import { formatCode } from '@/lib/loyalty/program'
import { huntLine, type HuntProgress } from '@/lib/loyalty/hunts'

// HUNT PROGRESS (LIVE-942, docs/LOYALTY.md). One presentational list, no hooks, rendered by the check-in
// result (client) and the /rewards page (server). Each hunt counts DOWN ("2 stops to go") and prints the
// completion code the host hands the reward out against. Tokens only, no hardcoded hex. No em dashes.

export function HuntProgressList({ hunts }: { hunts: HuntProgress[] }) {
  return (
    <ul className="space-y-2">
      {hunts.map((h) => {
        const done = h.completed
        return (
          <li key={h.huntId} className="rounded-card border border-border bg-surface p-3 text-left lift-1">
            <Link href={`/hunts/${h.slug}`} className="flex items-center gap-1.5 text-meta font-semibold text-muted hover:text-text">
              <Flag className="h-3.5 w-3.5" aria-hidden /> {h.title}
            </Link>
            <div className="mt-2 flex flex-wrap gap-1.5" role="img" aria-label={`${h.stopsDone} of ${h.stopsTotal} stops`}>
              {Array.from({ length: h.stopsTotal }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-6 rounded-pill ${i < h.stopsDone ? 'bg-primary' : 'bg-surface-elevated border border-border'}`}
                  aria-hidden
                />
              ))}
            </div>
            <p className={`mt-2 text-body-sm font-semibold ${done ? 'text-success' : 'text-text'}`}>{huntLine(h)}</p>
            {h.earnedCode && (
              <p className="mt-2 flex items-center justify-between gap-3 rounded-control bg-success-bg px-3 py-2 text-success">
                <span className="flex items-center gap-2 text-body-sm font-semibold">
                  <Gift className="h-4 w-4" aria-hidden /> {h.rewardTitle || 'Hunt reward'}
                </span>
                <span className="font-mono text-body-sm font-bold tracking-wider">{formatCode(h.earnedCode)}</span>
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
