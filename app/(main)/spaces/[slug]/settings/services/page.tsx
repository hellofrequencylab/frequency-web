import { redirect } from 'next/navigation'

// RETIRED (ADR-593, Phase 9). The JSON-backed Space "Store" (preferences.profileData.offerings) was
// replaced by the commerce-backed Shop console at /settings/shop; the offerings were backfilled into
// commerce_products (migration 20261101000000). This route is kept only as a redirect so any old link or
// bookmark lands on the new console, and so nobody can reach the retired JSON editor and split-brain the
// catalog. The old ServicesBody / SpaceServicesForm are dead code pending removal.
export default async function RetiredSpaceServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/spaces/${slug}/settings/shop`)
}
