import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { MemberPricingBox } from '@/components/pricing/member-pricing-box'
import { loadOwnedSpaceContext, loadPersonalContext, loadPricingBoxData } from '@/lib/pricing/member-pricing-load'

// MEMBER UPGRADE SURFACE. The member's own place to see where they stand and change it: the pricing box
// (components/pricing/member-pricing-box.tsx), with the personal rungs (Member, Crew) marked as the member's
// own and the Space rungs ready to buy for the first Space they own.
//
// 🔴 CREW IS PAY WHAT YOU WANT. There is no Crew price here, because there is no Crew price: the operator sets
// a floor, a suggested amount and some presets (catalog.pwyw), the member picks any monthly amount from the
// floor up, and every amount buys identical access. The box reads those from the catalog and renders the
// checkout through the one seam (startMembershipCheckout); billing off leaves the free beta toggle, never a
// broken button. The old per-allowance boxes, the Crew card and the pay-what-you-want picker are gone: one
// pricing box answers all of it. No em dashes (CONTENT-VOICE §10).

export default async function UpgradePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase.from('profiles').select('id, membership_tier').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  // Membership is the entitlement axis (orthogonal to the community role). Anything that is not 'free' reads
  // as Crew, the same access-preserving direction the retired read-time fold took.
  const [data, personal, space] = await Promise.all([
    loadPricingBoxData(),
    loadPersonalContext(profile.membership_tier),
    loadOwnedSpaceContext(profile.id),
  ])

  return (
    <FocusTemplate
      width="wide"
      title="Membership"
      description="Belonging is free, and stays free. Crew is the personal tier: contribute what you want, back the community, and get room to host more."
    >
      <MemberPricingBox data={data} focus="personal" personal={personal} space={space} />
      {/* What the money does, stated plainly (CONTENT-VOICE: no narrated feelings, skeptic test). */}
      <p className="mt-8 px-4 text-center text-meta leading-relaxed text-subtle">
        A paid membership keeps Frequency independent. It pays the people and the infrastructure that run it, so
        the work stays member-funded instead of sold to advertisers.
      </p>
    </FocusTemplate>
  )
}
