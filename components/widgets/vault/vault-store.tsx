import { getVaultData } from '@/lib/vault/vault-data'
import { StoreGrid } from '@/app/(main)/crew/store/store-grid'
import { GiftGemsDialog } from '@/app/(main)/crew/store/gift-gems-dialog'
import { SectionHeader } from '@/components/ui/section-header'

// Vault layout module: the Vault Store categories.
//
// 🔴 NOTHING HERE IS GATED. A `CrewGate` muted the whole grid for a free member and an `UpsellTease`
// above it offered to unlock spending; both are gone with the `vault_cash_in` gate (ADR-1295, owner
// ruling 2026-09-09, OWN-071). Any signed-in member may spend the Gems they earned, and the redeem
// action is still the authority server-side (balance, season, rank, stock, and the atomic charge).
const CATEGORIES = [
  { key: 'cosmetic', label: 'Profile Cosmetics', desc: 'Borders, flair icons, and visual upgrades' },
  { key: 'title', label: 'Custom Titles', desc: 'Display a special title on your profile' },
  { key: 'collectible', label: 'Collectible Badges', desc: 'Exclusive badges for your collection' },
  { key: 'membership', label: 'Membership Credits', desc: 'Redeem Gems for free membership months' },
] as const

export async function VaultStore() {
  const d = await getVaultData()
  if (!d) return null

  return (
    <div className="space-y-6">
      {/* Gift Gems (ADR-305 §8). Open to ANY member with a spendable balance: no spendable value is
          created, only moved between members. The server action is the authority (advisory-locked
          recheck). */}
      {d.balance > 0 && (
        <div className="flex justify-end">
          <GiftGemsDialog balance={d.balance} />
        </div>
      )}
      <div className="space-y-8">
        {CATEGORIES.map((cat) => {
          const catItems = d.items.filter((i) => i.category === cat.key)
          if (catItems.length === 0) return null
          return (
            <section key={cat.key}>
              <SectionHeader title={cat.label} />
              <p className="-mt-2 mb-3 text-meta text-subtle">{cat.desc}</p>
              <StoreGrid items={catItems} balance={d.balance} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
