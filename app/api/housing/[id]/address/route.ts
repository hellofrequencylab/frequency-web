import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListingWithOwner } from '@/lib/listings'
import { getHousingDetail, resolveAddressDisplay } from '@/lib/listings/housing'

// The street address of a housing listing whose host chose "Exact address for signed-in members",
// read from the CLIENT after hydration (SCAN-760). The public detail page is ISR, so it cannot read
// auth during render and always resolved the address with signedIn false; the promise the host was
// shown ("Signed-in members see the street address") was kept by nobody. Same posture as /api/viewer:
// own-session only, never cached, and an anonymous caller gets null.
//
// authz-ok: the gate is the session (an anonymous caller gets { addressLine: null }); the listing
// read is the same public, active-only read the page makes, and the address itself is the field the
// host chose to show every signed-in member.

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const noStore = { 'Cache-Control': 'no-store, private' }
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ addressLine: null }, { headers: noStore })

    const listing = await getListingWithOwner(id)
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
    return NextResponse.json({ addressLine: null }, { headers: noStore })
  }
}
