import { redirect } from 'next/navigation'

// The Marketplace hub is the entrenched General surface at /market (kinds, contact-via-DM,
// owner controls, operator-editable header). Housing/Makers/Shop are its facets (see the
// MarketplaceFacets bar). This route is kept as a stable alias so any /marketplace link
// lands on the canonical hub rather than a second, empty General grid.
export default function MarketplaceHubRedirect() {
  redirect('/market')
}
