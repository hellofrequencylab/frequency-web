import { listShopProducts } from '@/lib/commerce/products'
import { FqStoreBody } from '@/components/frequency/members/marketplace/marketplace-body'

// Frequency Store — first-party Frequency retail (commerce core, owner_kind='platform'). Frequency is the
// seller. Hero-led (the site PhotoHero grammar). Distinct from the Vault (Gems) and a Space's Shop tab.

// No /discover twin exists for the Store, and this thin, client-filtered catalog index is not the
// SEO surface — the individual /store/<id> product pages are (self-canonical, with Product schema).
// So the index is noindexed but still followed, letting crawlers reach the indexable product pages.
export const metadata = {
  title: 'Frequency Store',
  description: 'Frequency merch, event passes, and retreats.',
  robots: { index: false, follow: true },
}


export default async function ShopPage() {
  // Full catalog; the hero search bar filters it instantly on the client (no server round-trip).
  const products = await listShopProducts()
  return <FqStoreBody products={products} />
}
