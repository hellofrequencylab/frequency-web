import { getVaultData } from '@/lib/vault/vault-data'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { StoreGrid } from '@/app/(main)/crew/store/store-grid'
import { SectionHeader } from '@/components/ui/section-header'
import { UpsellTease } from '@/components/upsell/upsell-tease'
import { resolvePersonalTeaseGate } from '@/lib/pricing/tease-gate'

// Vault layout module: the Gem Store categories. Members can browse everything but can't spend —
// CrewGate renders the grid muted and a click opens the upgrade lightbox; the redeem action is the
// real authority server-side.
const CATEGORIES = [
  { key: 'cosmetic', label: 'Profile Cosmetics', desc: 'Borders, flair icons, and visual upgrades' },
  { key: 'title', label: 'Custom Titles', desc: 'Display a special title on your profile' },
  { key: 'collectible', label: 'Collectible Badges', desc: 'Exclusive badges for your collection' },
  { key: 'membership', label: 'Membership Credits', desc: 'Redeem Gems for free membership months' },
] as const

export async function VaultStore() {
  const d = await getVaultData()
  if (!d) return null

  // Phase E upsell tease gate (ADR-466): the Gems earned have value the moment there is something to
  // spend them on. When cash-in is locked AND a balance has built up, tease the Crew cash-in unlock —
  // ONLY when billing is live (resolvePersonalTeaseGate is HIDDEN while OFF). Dormant until billing_live ON.
  const cashInTease = !d.canSpend && d.balance > 0 ? await resolvePersonalTeaseGate('vault_cash_in') : null

  return (
    <div className="space-y-6">
      {/* The tease sits OUTSIDE the CrewGate so it stays interactive (the gate mutes + intercepts its
          muted children). It is the success-moment prompt; the gate still muffles the store itself. */}
      {cashInTease && (
        <UpsellTease
          target="vault-cash-in"
          live={cashInTease.live}
          locked={cashInTease.locked}
          href="/upgrade"
          title="Spend the Gems you have earned"
          body="You have Gems banked. Crew turns them in: profile cosmetics, titles, badges, and membership credits in the Vault Store."
          cta="See what Crew adds"
        />
      )}
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
    </div>
  )
}
