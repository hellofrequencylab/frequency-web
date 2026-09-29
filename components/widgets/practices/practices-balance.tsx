import { Scale } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPillarBalance, getPillars, type PillarCount } from '@/lib/pillars'
import { getMemberPillarZaps } from '@/lib/practices/attribution'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { SectionHeader } from '@/components/ui/section-header'

// Practices layout module (ADR-270/294): "Pillar balance" — how the member's ADOPTED practices
// spread across the four Pillars (Mind / Body / Spirit / Expression, docs/NAMING.md — never
// "Channels"), and what their logged practices EARNED in each one. Self-fetching RSC, no client
// JS; renders nothing for a logged-out viewer. With no adopted practices and no Zaps it shows a
// gentle empty line rather than four bare zeros. Keeps the id="practices-balance" anchor. Reads
// the canonical per-Pillar count (lib/pillars.getMemberPillarBalance) so the share always covers
// all four Pillars.
//
// The Zap line reads the per-Pillar ledger (lib/practices/attribution.getMemberPillarZaps,
// LIVE-642, ADR-1605): each paid log's Zaps split by the Pillar share frozen at log time. The
// split ATTRIBUTES and never adds (one wallet, ADR-438), so the four Pillar lines plus the
// "no Pillar" line always sum to the member's Zaps from practice logs.

const zapWord = (n: number) => (n === 1 ? 'Zap' : 'Zaps')

export async function PracticesBalance() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const [balance, pillars, zaps] = await Promise.all([
    getMemberPillarBalance(profileId),
    getPillars(),
    getMemberPillarZaps(profileId),
  ])
  const total = balance.reduce((sum, p) => sum + p.count, 0)
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
      <SectionHeader title="Pillar balance" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="text-meta font-medium text-muted">Across your adopted practices</span>
        </div>

        {total === 0 && !hasZaps ? (
          <p className="mt-3 text-body-sm text-subtle">
            Adopt a practice from the library to see how your Pillars balance out.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {balance.map((p) => {
                const share = total > 0 ? Math.round((p.count / total) * 100) : 0
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
                        {p.count > 0 && <span className="ml-1.5 text-subtle">{share}%</span>}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-pill bg-surface-elevated" aria-hidden>
                      <div
                        className={isExpression(p) ? 'h-full rounded-pill' : 'h-full rounded-pill bg-primary'}
                        style={
                          isExpression(p)
                            ? { width: `${share}%`, backgroundColor: 'var(--rank-deep)' }
                            : { width: `${share}%` }
                        }
                      />
                    </div>
                    {hasZaps && (
                      <p className="mt-1 text-meta tabular-nums text-subtle" data-pillar-zaps={earned}>
                        {earned} {zapWord(earned)} earned here
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            {hasZaps && (
              <p className="mt-3 text-meta text-muted">
                Your logs earned <span className="font-semibold tabular-nums text-text">{zaps.total}</span>{' '}
                {zapWord(zaps.total)}, credited to the Pillar each practice belongs to. A practice that
                spans two Pillars shares its Zaps between them, so the total never changes.
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
            {hasZaps && !zaps.complete && (
              <p className="mt-1 text-meta text-subtle">You have more logs than we can count in one go, so these figures leave some out.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
