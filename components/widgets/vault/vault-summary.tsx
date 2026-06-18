import Link from 'next/link'
import { Receipt, ArrowRight } from 'lucide-react'
import { getVaultData } from '@/lib/vault/vault-data'
import { SectionHeader } from '@/components/ui/section-header'
import { RANK_LABELS, seasonRankStyle } from '@/lib/season-ranks'
import { amplitudeLevel, formatAmplitude } from '@/lib/amplitude'

// Vault layout module: Your Vault — Amplitude (the lifetime layer), the earning ledger, and
// equipped winnings.
export async function VaultSummary() {
  const d = await getVaultData()
  if (!d) return null

  const ownedCount = d.items.filter((i) => (i as { owned?: boolean }).owned).length
  const hasAmplitude = d.amplitude > 0
  const { equipped } = d

  return (
    <section>
      <SectionHeader
        title="Your Vault"
        action={
          <span className="text-xs font-medium tabular-nums text-subtle">
            {ownedCount} {ownedCount === 1 ? 'item won' : 'items won'}
          </span>
        }
      />
      <div className="rounded-2xl border border-success/60 bg-gradient-to-br from-success-bg to-signal-bg p-5 shadow-sm">
        {/* Amplitude — lifetime XP beside the season rank; never resets. */}
        {hasAmplitude && (
          <div className="flex items-center justify-between rounded-xl bg-success-bg/50 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal">
              Amplitude · Level {amplitudeLevel(d.amplitude)}
            </span>
            <span className="flex items-center gap-1.5">
              {d.seasonRank && d.seasonRank !== 'ghost' && (
                <span className="rank-badge text-2xs font-bold leading-tight" style={seasonRankStyle(d.seasonRank)}>
                  {RANK_LABELS[d.seasonRank]}
                </span>
              )}
              <span className="text-2xs font-bold text-signal-strong">{formatAmplitude(d.amplitude)}</span>
            </span>
          </div>
        )}

        {/* How you earned — the points & streaks ledger. */}
        <Link
          href="/crew/store/ledger"
          className={`flex items-center gap-2 rounded-xl bg-success-bg/50 px-3 py-2.5 text-signal-strong transition-colors hover:bg-success-bg ${hasAmplitude ? 'mt-3' : ''}`}
        >
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-xs font-semibold">How you earned: Zaps &amp; Gems log</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </Link>

        {/* Equipped winnings */}
        {(equipped.border || equipped.flair || equipped.title) && (
          <div className="mt-4 border-t border-success/40 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal">Equipped</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {equipped.border && (
                <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">
                  Border: {equipped.border.replace('ring-', '').replace('-500', '')}
                </span>
              )}
              {equipped.flair && (
                <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">Flair: {equipped.flair}</span>
              )}
              {equipped.title && (
                <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">Title: {equipped.title}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
