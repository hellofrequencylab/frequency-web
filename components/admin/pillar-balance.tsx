import { Scale } from 'lucide-react'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { pillarZapBalance, type BalancePractice } from '@/lib/quest/pillar-balance'
import type { PillarSlug } from '@/lib/pillars'

// Descriptive author bookkeeping only. The existing pure reward sums stay unchanged;
// equality is not a publication rule or an assessment of participants.

const PILLAR_LABEL: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

const ORDER: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

export function PillarBalance({
  practices,
  className,
}: {
  practices: readonly BalancePractice[]
  /** Optional extra classes on the wrapper (spacing in a parent grid, etc.). */
  className?: string
}) {
  const balance = pillarZapBalance(practices)
  const totals: Record<PillarSlug, number> = {
    mind: balance.mind,
    body: balance.body,
    spirit: balance.spirit,
    expression: balance.expression,
  }
  const empty = ORDER.every((s) => totals[s] === 0)

  return (
    <div className={`rounded-card border border-border bg-surface p-3 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <Scale className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <span className="eyebrow text-subtle">
          Practice reward values
        </span>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {ORDER.map((slug) => {
          const isExpression = slug === 'expression'
          return (
            <div key={slug} className="flex items-center gap-1.5">
              {isExpression && (
                <span style={{ ...expressionPillarStyle(), color: 'var(--rank-deep)' }}>
                  <ExpressionIcon className="h-3 w-3" aria-hidden />
                </span>
              )}
              <dt
                className="text-2xs font-medium uppercase tracking-wide text-muted"
                style={isExpression ? { ...expressionPillarStyle(), color: 'var(--rank-deep)' } : undefined}
              >
                {PILLAR_LABEL[slug]}
              </dt>
              <dd className="text-body-sm font-bold tabular-nums text-text">{totals[slug]}</dd>
            </div>
          )
        })}
      </dl>

      <p className="mt-2 text-2xs text-muted">
        {empty
          ? 'No categorized reward values yet. Add a practice to see its value per log.'
          : 'Zaps per log, summed across practices in each primary Pillar. Cadence and actual participation vary.'}
      </p>
      <p className="mt-1 text-meta text-muted">
        These are reward values, not daily targets. Choose supporting practices that fit the intention; equal totals are not required.
      </p>
    </div>
  )
}
