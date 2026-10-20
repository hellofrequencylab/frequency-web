import { getVaultData } from '@/lib/vault/vault-data'
import { GiftGemsDialog } from '@/app/(main)/crew/store/gift-gems-dialog'
import { FqStoreGrid } from './store-grid'
import type { FqIconName } from '@/components/frequency/icon'

// THE VAULT STORE, IN THE KIT (LIVE-1104). The Frequency twin of components/widgets/vault/vault-store.tsx: same
// categories and the same ungated rule (ADR-1295, OWN-071), drawn with the kit's `.sec-h` and `.g3`. Gift Gems
// keeps its dialog (it portals out of the kit); only its trigger is the kit button.
/** The Store's shelves, with the kit's icon for each. The Vault rail lists the same shelves and links to #store. */
export const SHELVES: { key: string; label: string; desc: string; icon: FqIconName }[] = [
  { key: 'cosmetic', label: 'Profile cosmetics', desc: 'Borders and flair icons', icon: 'gem' },
  { key: 'title', label: 'Custom titles', desc: 'Shown on your profile', icon: 'crew' },
  { key: 'collectible', label: 'Collectible badges', desc: 'Some are season exclusives', icon: 'award' },
  { key: 'membership', label: 'Membership credits', desc: 'Redeem for free months', icon: 'membership' },
]

export async function FqVaultStore() {
  const d = await getVaultData()
  if (!d) return null

  return (
    <div className="stack mc-gap-24">
      {d.balance > 0 && (
        <div className="row mc-between">
          <span className="meta">Send some to a friend</span>
          <GiftGemsDialog balance={d.balance} triggerClassName="btn sm" />
        </div>
      )}
      {SHELVES.map((cat) => {
        const catItems = d.items.filter((i) => i.category === cat.key)
        if (catItems.length === 0) return null
        return (
          <section key={cat.key} className="stack mc-gap-12">
            <div className="row mc-between">
              <span className="h3">{cat.label}</span>
              <span className="meta">{cat.desc}</span>
            </div>
            <FqStoreGrid items={catItems} balance={d.balance} />
          </section>
        )
      })}
    </div>
  )
}
