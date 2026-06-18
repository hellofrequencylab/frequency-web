import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'
import { getVaultData } from '@/lib/vault/vault-data'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { TrophyCase } from '@/components/quest/trophy-case'
import { getTrophyCase } from '@/lib/quest/trophies'

// Vault layout module: Your Trophies — the lifetime Trophy Case, the permanent record beside the
// resettable seasonal rank. The case is forever; the rank resets, so the season turnover reads as a
// Fresh Start. Self-fetching (its own Suspense in the module grid).
export async function VaultTrophies() {
  const d = await getVaultData()
  if (!d) return null

  const trophyCase = d.profileId
    ? await getTrophyCase(d.profileId)
    : { seasons: [], totalTrophies: 0, seasonsPlayed: 0 }

  return (
    <section>
      <SectionHeader title="Your Trophies" />
      <p className="-mt-2 mb-3 text-xs text-subtle">
        Every Journey you finish stays here for good. The season rank resets every 13 weeks for a fresh start; your Trophies and Gems do not.
      </p>
      {trophyCase.totalTrophies === 0 ? (
        <EmptyState
          icon={Compass}
          title="Finish a Journey to earn your first Trophy"
          description="A Journey is 14 days of practice plus an Expression Challenge. Finish one and it lands here for good, with the rank it earned."
          action={
            <Link
              href="/crew"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              Go to your Quest
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          }
        />
      ) : (
        <TrophyCase seasons={trophyCase.seasons} totalTrophies={trophyCase.totalTrophies} currentSeason={d.seasonNumber} />
      )}
    </section>
  )
}
