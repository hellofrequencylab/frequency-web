import { getVaultData } from '@/lib/vault/vault-data'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { StoreGrid } from '@/app/(main)/crew/store/store-grid'
import { SectionHeader } from '@/components/ui/section-header'

// Vault layout module: the Gem Store categories. Members can browse everything but can't spend —
// CrewGate renders the grid muted and a click opens the upgrade lightbox; the redeem action is the
// real authority server-side.
const CATEGORIES = [
  { key: 'cosmetic', label: 'Profile Cosmetics', desc: 'Borders, flair icons, and visual upgrades' },
  { key: 'title', label: 'Custom Titles', desc: 'Display a special title on your profile' },
  { key: 'collectible', label: 'Collectible Badges', desc: 'Exclusive badges for your collection' },
  { key: 'membership', label: 'Membership Credits', desc: 'Redeem gems for free membership months' },
] as const

export async function VaultStore() {
  const d = await getVaultData()
  if (!d) return null

  return (
    <CrewGate locked={!d.canSpend}>
      <div className="space-y-8">
        {CATEGORIES.map((cat) => {
          const catItems = d.items.filter((i) => i.category === cat.key)
          if (catItems.length === 0) return null
          return (
            <section key={cat.key}>
              <SectionHeader title={cat.label} />
              <p className="-mt-2 mb-3 text-xs text-subtle">{cat.desc}</p>
              <StoreGrid items={catItems} balance={d.balance} />
            </section>
          )
        })}
      </div>
    </CrewGate>
  )
}
