import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListing } from '@/lib/listings'
import { getHousingDetail, resolveAddressDisplay } from '@/lib/listings/housing'

// The street address of a housing listing, for a SIGNED-IN viewer, read from the client after
// hydration (SCAN-760).
//
// Why this exists: /housing/[id] is ISR (revalidate = 3600), so its render cannot read auth and
// must resolve the address with signedIn: false. Before this route a host who chose 'Exact
// address for signed-in members' had their address shown to nobody, while the form promised
// members would see it. The page keeps the address OUT of its cached HTML and a small client
// component inside ViewerProvider fetches it here once the viewer is known to be signed in.
//
// PRIVACY: the same rule as the page, resolveAddressDisplay, decides; it returns the line only
// when the host picked 'exact' AND the caller has a session. Anonymous callers get null, as do
// listings that are not active housing. Never cached.

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store, private' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ addressLine: null }, { headers: noStore })

    const listing = await getListing(id)
    if (!listing || listing.vertical !== 'housing' || listing.status !== 'active') {
      return NextResponse.json({ addressLine: null }, { headers: noStore })
    }
    const detail = await getHousingDetail(id)
    if (!detail) return NextResponse.json({ addressLine: null }, { headers: noStore })

    const { addressLine } = resolveAddressDisplay({
      precision: detail.addressPrecision,
      city: listing.city,
      neighborhood: listing.neighborhood,
      addressLine: detail.addressLine,
      signedIn: true,
    })
    return NextResponse.json({ addressLine }, { headers: noStore })
  } catch {
    // FAIL-SAFE: the page keeps its address-free facts rather than breaking.
    return NextResponse.json({ addressLine: null }, { headers: noStore })
  }
}
