import { getVaultData } from '@/lib/vault/vault-data'
import { StandingHero } from '@/components/gamification/standing-hero'

// Vault layout module: the standing hero — the four counts (Zaps · Rank · Streak · Gems), the one
// way a member's standing renders. Gems point at the spend ledger; the gems shown are the spendable
// balance.
export async function VaultStanding() {
  const d = await getVaultData()
  if (!d) return null
  return (
    <StandingHero
      zaps={d.zaps}
      gems={d.balance}
      streak={d.streak}
      rank={d.rank}
      journeysFinished={d.finished}
      seasonName={d.seasonName}
      links={{
        zaps: '/crew/leaderboard',
        rank: '/crew/store#awards',
        streak: '/crew/leaderboard',
        gems: '/crew/store/ledger',
      }}
    />
  )
}
