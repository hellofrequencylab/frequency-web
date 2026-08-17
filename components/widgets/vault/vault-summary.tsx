import Link from 'next/link'
import { Receipt, ArrowRight } from 'lucide-react'
import { getVaultData } from '@/lib/vault/vault-data'
import { SectionHeader } from '@/components/ui/section-header'
import { RANK_LABELS } from '@/lib/season-ranks'
import { RankBadge } from '@/components/ui/rank-badge'
import { amplitudeLevel, formatAmplitude } from '@/lib/amplitude'
import { CosmeticBorder, CosmeticFlair, CosmeticTitle } from '@/components/profile/profile-cosmetics'
import { resolveBorder, resolveFlair, resolveTitle } from '@/lib/store/cosmetics'

// Vault layout module: Your Vault — Amplitude (the lifetime layer), the earning ledger, and
// equipped winnings.
export async function VaultSummary() {
  const d = await getVaultData()
  if (!d) return null

  const ownedCount = d.items.filter((i) => (i as { owned?: boolean }).owned).length
  const hasAmplitude = d.amplitude > 0
  const { equipped } = d
  // Resolve once: a value the registry cannot paint reads as nothing equipped, rather than as a
  // label over an empty box.
  const border = resolveBorder(equipped.border)
  const flair = resolveFlair(equipped.flair)
  const title = resolveTitle(equipped.title)

  return (
    <section>
      <SectionHeader
        title="Your Vault"
        action={
          <span className="text-meta font-medium tabular-nums text-subtle">
            {ownedCount} {ownedCount === 1 ? 'item won' : 'items won'}
          </span>
        }
      />
      <div className="rounded-2xl border border-success/60 bg-gradient-to-br from-success-bg to-signal-bg p-5 lift-1">
        {/* Amplitude — lifetime XP beside the season rank; never resets. */}
        {hasAmplitude && (
          <div className="flex items-center justify-between rounded-xl bg-success-bg/50 px-3 py-2">
            <span className="text-meta font-semibold uppercase tracking-wider text-signal">
              Amplitude · Level {amplitudeLevel(d.amplitude)}
            </span>
            <span className="flex items-center gap-1.5">
              {d.seasonRank && d.seasonRank !== 'ghost' && (
                <RankBadge rank={d.seasonRank}>{RANK_LABELS[d.seasonRank]}</RankBadge>
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
          <span className="flex-1 text-meta font-semibold">How you earned: Zaps &amp; Gems log</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </Link>

        {/* Equipped winnings.
            ⚠️ THIS BLOCK USED TO BE THE ONLY READER OF THE THREE COSMETIC COLUMNS IN THE PRODUCT
            (backlog LIVE-013), and it printed the raw stored string: "Border: indigo". A member
            who spent 2,500 Gems on Prismatic got six grey words on the page they bought it from,
            visible to nobody else. It now shows the REAL cosmetic — the same components the
            member's profile paints — so this reads as a preview of what other people see, which
            is what "Equipped" was always claiming. */}
        {(border || flair || title) && (
          <div className="mt-4 border-t border-success/40 pt-3">
            <span className="text-meta font-semibold uppercase tracking-wider text-signal">Equipped</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {border && (
                <CosmeticBorder value={equipped.border}>
                  <span className="block h-7 w-7 rounded-pill bg-success-bg" aria-hidden />
                </CosmeticBorder>
              )}
              <CosmeticFlair value={equipped.flair} />
              <CosmeticTitle value={equipped.title} />
              <span className="text-meta text-success">
                {[border?.label, flair?.label, title].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
