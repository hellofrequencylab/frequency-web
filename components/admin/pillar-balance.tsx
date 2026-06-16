import { Scale } from 'lucide-react'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { pillarZapBalance, type BalancePractice } from '@/lib/quest/pillar-balance'
import type { PillarSlug } from '@/lib/pillars'

// The per-Pillar Zap-balance indicator — the new owner-locked rule made visible while
// authoring (docs/NAMING.md: Pillars are Mind / Body / Spirit / Expression). A Journey's
// Practices must be balanced so each Pillar earns the same total daily Zaps; this shows
// the four totals and warns the moment they diverge. Pure math lives in
// lib/quest/pillar-balance.ts so the same read backs the Journey editor later. Expression
// carries its plum / Sparkles identity (lib/quest/expression-pillar.ts) so it reads as a
// peer of the other three. Presentational, server-safe (no hooks); semantic tokens only.

const PILLAR_LABEL: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

const ORDER: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

/** Name the Pillar(s) that fall short of the highest total, for the warning line. */
function lightPillars(totals: Record<PillarSlug, number>): string[] {
  const max = Math.max(...ORDER.map((s) => totals[s]))
  return ORDER.filter((s) => totals[s] < max).map((s) => PILLAR_LABEL[s])
}

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
  const light = balance.balanced ? [] : lightPillars(totals)

  return (
    <div className={`rounded-2xl border border-border bg-surface p-3 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <Scale className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Pillar Zap balance
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
                className="text-2xs font-medium uppercase tracking-wide text-subtle"
                style={isExpression ? { ...expressionPillarStyle(), color: 'var(--rank-deep)' } : undefined}
              >
                {PILLAR_LABEL[slug]}
              </dt>
              <dd className="text-sm font-bold tabular-nums text-text">{totals[slug]}</dd>
            </div>
          )
        })}
      </dl>

      {empty ? (
        <p className="mt-2 text-2xs text-subtle">
          Add Practices across the four Pillars to see the balance.
        </p>
      ) : balance.balanced ? (
        <p className="mt-2 text-2xs font-medium text-success">
          Balanced. Every Pillar earns the same daily Zaps.
        </p>
      ) : (
        <p className="mt-2 text-2xs font-medium text-warning" role="status">
          {light.length === 1
            ? `${light[0]} is light. Balance the Pillars so each earns the same daily Zaps.`
            : `${light.join(', ')} are light. Balance the Pillars so each earns the same daily Zaps.`}
        </p>
      )}
    </div>
  )
}
