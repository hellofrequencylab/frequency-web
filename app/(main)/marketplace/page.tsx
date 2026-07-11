import { redirect } from 'next/navigation'

// /marketplace is a legacy alias. The canonical member surface is the Classifieds peer board at
// /classifieds, so this route redirects there and is kept only so any lingering /marketplace link
// lands on the live board rather than a dead path.
export default function MarketplaceHubRedirect() {
  redirect('/classifieds')
}
