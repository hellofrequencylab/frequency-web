import { Scale } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPillarBalance, type PillarCount } from '@/lib/pillars'
import { ExpressionIcon, expressionPillarStyle } from '@/lib/quest/expression-pillar'
import { SectionHeader } from '@/components/ui/section-header'

// Practices layout module (ADR-270/294): "Pillar balance" — how the member's ADOPTED practices
// spread across the four Pillars (Mind / Body / Spirit / Expression, docs/NAMING.md — never
// "Channels"). Self-fetching RSC, no client JS; renders nothing for a logged-out viewer. With no
// adopted practices it shows a gentle empty line rather than four bare zeros. Keeps the
// id="practices-balance" anchor. Reads the canonical per-Pillar count
// (lib/pillars.getMemberPillarBalance) so the share always covers all four Pillars.

export async function PracticesBalance() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const balance = await getMemberPillarBalance(profileId)
  const total = balance.reduce((sum, p) => sum + p.count, 0)
  const isExpression = (p: PillarCount) => p.slug === 'expression'

  return (
    <section id="practices-balance" className="max-w-2xl scroll-mt-20">
      <SectionHeader title="Pillar balance" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="text-xs font-medium text-muted">Across your adopted practices</span>
        </div>

        {total === 0 ? (
          <p className="mt-3 text-sm text-subtle">
            Adopt a practice from the library to see how your Pillars balance out.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {balance.map((p) => {
              const share = Math.round((p.count / total) * 100)
              return (
                <li key={p.slug}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
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
                  <div className="h-2 overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
                    <div
                      className={isExpression(p) ? 'h-full rounded-full' : 'h-full rounded-full bg-primary'}
                      style={
                        isExpression(p)
                          ? { width: `${share}%`, backgroundColor: 'var(--rank-deep)' }
                          : { width: `${share}%` }
                      }
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
