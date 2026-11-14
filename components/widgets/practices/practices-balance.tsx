import { Scale } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPillarBalance, getPillars, type PillarCount } from '@/lib/pillars'
import { getMemberPillarZaps } from '@/lib/practices/attribution'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { SectionHeader } from '@/components/ui/section-header'

// Current adopted support counts and historical reward attribution are separate reads.
// A practice can count in several support areas, so their sum is not a unique practice total.
// No participation or wellbeing is inferred from adoption. Preserve the historical Zap ledger.

const zapWord = (n: number) => (n === 1 ? 'Zap' : 'Zaps')

export async function PracticesBalance() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const [balance, pillars, zaps] = await Promise.all([
    getMemberPillarBalance(profileId),
    getPillars(),
    getMemberPillarZaps(profileId),
  ])
  const hasAdoptedSupports = balance.some((p) => p.count > 0)
  const isExpression = (p: PillarCount) => p.slug === 'expression'

  // Ledger totals are keyed by Pillar id; the balance rows by slug.
  const idBySlug = new Map(pillars.map((p) => [p.slug, p.id]))
  const zapsFor = (p: PillarCount) => {
    const id = idBySlug.get(p.slug)
    return id ? (zaps.byPillar[id] ?? 0) : 0
  }
  const shownZaps = balance.reduce((sum, p) => sum + zapsFor(p), 0)
  // Zaps from a practice with no Pillar (or one no longer active) keep the sum honest.
  const noPillarZaps = Math.max(0, zaps.total - shownZaps)
  const hasZaps = zaps.total > 0

  return (
    <section id="practices-balance" className="scroll-mt-20">
      <SectionHeader title="Adopted practice supports" />
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="text-meta font-medium text-muted">Current areas of support</span>
        </div>

        {!hasAdoptedSupports && !hasZaps ? (
          <p className="mt-3 text-body-sm text-subtle">
            Adopt a practice from the library when you find something you want to return to.
          </p>
        ) : (
          <>
            <p className="mt-2 text-meta text-muted">
              A practice can support more than one area, so these counts overlap. They show what you have adopted, not days practiced or how you are doing.
            </p>
            <ul className="mt-3 space-y-3">
              {balance.map((p) => {
                const earned = zapsFor(p)
                return (
                  <li key={p.slug} data-pillar={p.slug}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-body-sm">
                      <span
                        className="flex items-center gap-1.5 font-medium text-text"
                        style={isExpression(p) ? { ...expressionPillarStyle(), color: 'var(--rank-deep)' } : undefined}
                      >
                        {isExpression(p) && <ExpressionIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                        {p.name}
                      </span>
                      <span className="tabular-nums text-muted">
                        <span className="font-semibold text-text">{p.count}</span>
                        <span className="ml-1.5 text-subtle">adopted {p.count === 1 ? 'practice' : 'practices'}</span>
                      </span>
                    </div>
                    {hasZaps && (
                      <p className="mt-1 text-meta tabular-nums text-subtle" data-pillar-zaps={earned}>
                        {earned} {zapWord(earned)} credited from your logs
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            {hasZaps && (
              <p className="mt-3 text-meta text-muted">
                Your logs earned <span className="font-semibold tabular-nums text-text">{zaps.total}</span>{' '}
                {zapWord(zaps.total)}, credited using the recorded reward split, with a current-practice fallback for older logs.
                These rewards are separate from adopted support counts and recent practice days. A split never changes the total.
                {noPillarZaps > 0 && (
                  <>
                    {' '}
                    <span data-no-pillar-zaps={noPillarZaps}>
                      {noPillarZaps} came from practices without a Pillar.
                    </span>
                  </>
                )}
              </p>
            )}
          </>
        )}
        {!zaps.complete && (
          <p className="mt-2 text-meta text-subtle">Some reward records could not be loaded. Displayed amounts may be incomplete.</p>
        )}
      </div>
    </section>
  )
}
