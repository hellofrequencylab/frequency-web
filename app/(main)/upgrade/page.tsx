import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Zap, Check, MessageSquare, CalendarDays, Users, Star, Radio, BarChart3, ArrowRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getPricingValues } from '@/lib/pricing/settings'
import { memberTierSellable } from '@/lib/pricing/settings'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { formatCents, memberTierRows } from '@/lib/pricing/display'
import { UpgradeToggle } from './upgrade-toggle'
import { CheckoutButton } from './checkout-button'
import { SupporterBadge } from './supporter-badge'

// MEMBER UPGRADE SURFACE (Pricing P3, ADR-362/363). Renders the Crew + Supporter tiers with the
// OPERATOR-SET prices (getPricingValues(), never hardcoded), honors the founder lock (a founding
// member sees their locked price is preserved), and gates the live checkout CTA behind
// memberTierSellable() = billingLive() AND the per-tier switch.
//
// OFF preserves today's behavior EXACTLY: while billing is not live, the page shows the free-beta
// toggle (unchanged) plus a tasteful disabled "coming soon" price preview, never a broken button.
// When billing goes live, the CTA becomes a real Stripe checkout (CheckoutButton -> the existing
// createMembershipCheckout, which already honors the founder lock). No em dashes (CONTENT-VOICE §10).

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  // Membership is the entitlement axis (orthogonal to the community role). Paid = Crew. Supporter is
  // RETIRED as a tier (ADR-463) and is now the PWYW badge below (profiles.is_supporter).
  const tier = (profile.membership_tier ?? 'free') as string
  const isCrew = tier !== 'free'

  // The founder lock + the Supporter badge are now TYPED (is_founding_member / is_supporter, regenerated
  // in Phase C). crewSellable is billingLive() AND the tier switch: false while billing is OFF, so the
  // page degrades to the beta toggle + a disabled preview. The catalog config carries the PWYW amounts.
  const [founder, values, catalog, crewSellable] = await Promise.all([
    createAdminClient()
      .from('profiles')
      .select('is_founding_member, is_supporter')
      .eq('id', profile.id)
      .maybeSingle(),
    getPricingValues(),
    loadCatalogConfig(),
    memberTierSellable('crew'),
  ])
  const founderRow = founder.data
  const isFounder = founderRow?.is_founding_member === true
  const isSupporter = founderRow?.is_supporter === true

  // Live = the Crew checkout is actually sellable (billing on + the tier switch on). While OFF the
  // upgrade is the free beta toggle, exactly as before, with a disabled price preview beneath it.
  const live = crewSellable
  const rows = memberTierRows(values)
  const crew = rows.find((r) => r.key === 'crew')!

  const benefits = [
    { icon: MessageSquare, label: 'Full community feed access' },
    { icon: Users, label: 'Join and participate in circles' },
    { icon: CalendarDays, label: 'Create and RSVP to events' },
    { icon: Radio, label: 'Access all channels' },
    { icon: Star, label: 'Earn Zaps and climb the leaderboard' },
    { icon: BarChart3, label: 'Track your Quest progress' },
  ]

  return (
    <FocusTemplate
      width="narrow"
      title="Membership"
      description="Your access to the Frequency community, free during beta."
    >
      {/* Beta banner — shown while paid membership has not gone live. */}
      {!live && (
        <div className="rounded-2xl bg-primary-bg border border-primary-bg/50 px-5 py-4 mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-black uppercase tracking-widest text-primary-strong">
              Free Beta
            </span>
            <span className="text-3xs font-bold uppercase tracking-wider text-on-primary bg-primary px-2 py-0.5 rounded-md">
              Active
            </span>
          </div>
          <p className="text-sm text-primary-strong/70 dark:text-primary-strong/70 leading-relaxed">
            Frequency is in free beta. All features are unlocked for everyone.
            Early members will get Founder pricing when paid memberships launch.
          </p>
        </div>
      )}

      {/* Founder badge — a founding member keeps their locked price when billing goes live. */}
      {isFounder && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-signal/30 bg-signal-bg/20 px-5 py-4">
          <div className="shrink-0 mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-signal-bg/60">
            <Star className="h-4 w-4 text-signal-strong" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text">You are a Founding Member</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Your Founder price is locked in. When paid membership launches you keep it, even if
              prices change later.
            </p>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br bg-primary px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <p className="text-2xl font-bold text-white mb-1">Join the Crew</p>
          <p className="text-primary-bg/80 text-sm">Full access to the Frequency community</p>
          <div className="mt-4 flex items-baseline justify-center gap-1">
            {live ? (
              <>
                {crew.list && (
                  <span className="text-2xl font-black text-white line-through opacity-50 mr-1">{crew.list}</span>
                )}
                <span className="text-4xl font-black text-white">{crew.monthly}</span>
                <span className="text-primary-strong text-sm ml-1">/ month</span>
              </>
            ) : (
              <>
                <span className="text-3xl font-black text-white line-through opacity-50">{crew.list ?? crew.monthly}</span>
                <span className="text-4xl font-black text-white ml-2">Free</span>
                <span className="text-primary-strong text-sm ml-1">during beta</span>
              </>
            )}
          </div>
          {live && crew.list && (
            <p className="mt-1 text-xs text-primary-strong/80">Founding price. {crew.annual ? `Or ${crew.annual} a year, two months free.` : ''}</p>
          )}
          {live && !crew.list && crew.annual && (
            <p className="mt-1 text-xs text-primary-strong/80">or {crew.annual} a year</p>
          )}
        </div>

        {/* Benefits */}
        <div className="px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle mb-4">
            What you get
          </p>
          <ul className="space-y-3.5">
            {benefits.map(({ label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-success-bg/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-success" />
                </div>
                <span className="text-sm text-text">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          {!live ? (
            <UpgradeToggle isCrew={isCrew} />
          ) : isCrew ? (
            <Link
              href="/settings/billing"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              Manage your membership <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <CheckoutButton />
          )}
        </div>
      </div>

      {/* Mission framing (CONTENT-VOICE: plain, concrete, no narrating the reader's feelings, skeptic
          test). State plainly what the membership funds. */}
      <p className="mt-5 text-center text-xs leading-relaxed text-subtle px-4">
        A paid membership keeps Frequency independent. It pays the people and the infrastructure that run
        it, so the work stays member-funded instead of sold to advertisers.
      </p>

      {/* Supporter is RETIRED as a tier (ADR-463). It is now an opt-in pay-what-you-want BADGE on Crew
          (profiles.is_supporter). The toggle writes the badge; the contribution charge is dormant until
          billing goes live. The operator-set PWYW amounts frame it. */}
      <SupporterBadge
        initialOn={isSupporter}
        minLabel={formatCents(catalog.pwyw.minCents)}
        suggestedLabel={formatCents(catalog.pwyw.suggestedCents)}
      />

      {/* Founder note — shown while paid membership has not launched. */}
      {!live && !isFounder && (
        <div className="mt-8 text-center px-4">
          <p className="text-xs text-subtle leading-relaxed">
            When paid memberships launch, beta members will be offered exclusive
            Founder pricing. You can switch between the free tier and Crew freely
            during the beta period.
          </p>
        </div>
      )}
    </FocusTemplate>
  )
}
