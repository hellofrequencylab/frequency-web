import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Zap, Check, MessageSquare, Users, Star, Radio, BarChart3, ArrowRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getPricingValues } from '@/lib/pricing/settings'
import { memberTierSellable } from '@/lib/pricing/settings'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { formatCents, memberTierRows } from '@/lib/pricing/display'
import { confirmSupporterContribution } from './actions'
import { UpgradeToggle } from './upgrade-toggle'
import { PwywPicker } from './pwyw-picker'
import { SupporterBadge } from './supporter-badge'

// MEMBER UPGRADE SURFACE (Pricing P3, ADR-362/363). Renders CREW, the one sellable member tier
// (ADR-878: the ladder is Member free and Crew $9/mo), with the OPERATOR-SET price
// (getPricingValues(), never hardcoded), honors the founder lock (a founding member sees their locked
// price is preserved), and gates the live checkout CTA behind memberTierSellable() = billingLive() AND
// the per-tier switch. The pay-what-you-want Supporter BADGE lives on further down: that is a way to
// back the Foundation on top of Crew, not a tier, and it is not sold as one.
//
// OFF preserves today's behavior EXACTLY: while billing is not live, the page shows the free-beta
// toggle (unchanged) plus a tasteful disabled "coming soon" price preview, never a broken button.
// When billing goes live, the CTA becomes the PWYW picker (PwywPicker -> startPwywMembershipCheckout
// -> createMembershipCheckout with the member's chosen amount). There is no longer a no-amount
// checkout seam: Crew is pay what you want, so a session that names no amount has nothing honest to
// charge. The founder lock is deliberately skipped for a chosen amount (ADR-908), because a
// grandfathered price is meaningless when the member sets the price. No em dashes (CONTENT-VOICE §10).

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: Promise<{ supporter?: string; session_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  // Webhook-independent supporter-contribution confirm (the Stripe success redirect lands here with
  // ?supporter=success&session_id=...). Idempotent: the same recorder the webhook runs, so the
  // contribution + badge land exactly once no matter which fires first.
  const sp = (await searchParams) ?? {}
  let supporterThanks: { amountCents: number } | null = null
  if (sp.supporter === 'success' && sp.session_id) {
    const confirmed = await confirmSupporterContribution(sp.session_id)
    if (confirmed.ok) supporterThanks = { amountCents: confirmed.amountCents }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  // Membership is the entitlement axis (orthogonal to the community role). Paid = Crew, and Crew is
  // the only paid rung (ADR-878). A historical 'supporter' row still reads as paid here, exactly as
  // deriveTier maps it (ADR-458), so nobody loses access.
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
  const crew = memberTierRows(values).find((r) => r.key === 'crew')!

  // Crew is the personal tier: your Crew identity, the whole game, and a way to back the community.
  // It is never a business tool, and it never sells back the community itself: joining, Circles,
  // events, and Channels stay free for everyone. The list below is what Crew actually adds
  // (lib/pricing/gates.ts: vault_cash_in, gamification_full, vera_unlimited) plus the badge.
  const benefits = [
    { icon: Star, label: 'The Crew badge, worn on your profile' },
    { icon: Zap, label: 'The full rewards loop: streaks, seasons, and the whole ladder' },
    { icon: BarChart3, label: 'Spend your Gems in the Vault Store' },
    { icon: MessageSquare, label: 'Vera without the daily cap' },
    { icon: Radio, label: 'List what you author in the public library' },
    { icon: Users, label: 'You keep the community free for the next person' },
  ]

  return (
    <FocusTemplate
      width="narrow"
      title="Membership"
      description="Belonging is free, and stays free. Crew is the personal tier: the badge, the whole game, and a way to back the community."
    >
      {/* Supporter-contribution thanks — the confirmed Stripe success redirect. Plain and concrete. */}
      {supporterThanks && (
        <div className="mb-8 rounded-2xl border border-success/30 bg-success-bg/30 px-5 py-4">
          <p className="text-sm font-bold text-text">Thank you. Your contribution went through.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {formatCents(supporterThanks.amountCents)} to the Foundation, and your Supporter badge is on.
          </p>
        </div>
      )}

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
            Early members will get the Opening Beta price when paid memberships launch.
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
          <p className="text-primary-bg/80 text-sm">The personal tier: your badge, the whole game, and backing the community</p>
          {/* PWYW (ADR-908): Crew has no single price to headline, so the hero states the FLOOR and
              the picker below carries the choice. Never render a struck-through anchor here: there is
              no list price to discount against when the member sets the amount. */}
          <div className="mt-4 flex items-baseline justify-center gap-1">
            {live ? (
              <>
                <span className="text-primary-strong text-sm mr-1">from</span>
                <span className="text-4xl font-black text-white">{formatCents(catalog.pwyw.minCents)}</span>
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
          {live && (
            <p className="mt-1 text-xs text-primary-strong/80">You choose the amount. Every amount gets the same Crew.</p>
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
            <PwywPicker
              presetCents={catalog.pwyw.presetCents}
              suggestedCents={catalog.pwyw.suggestedCents}
              minCents={catalog.pwyw.minCents}
              maxCents={catalog.pwyw.maxCents}
            />
          )}
        </div>
      </div>

      {/* Mission framing (CONTENT-VOICE: plain, concrete, no narrating the reader's feelings, skeptic
          test). State plainly what the membership funds. */}
      <p className="mt-5 text-center text-xs leading-relaxed text-subtle px-4">
        A paid membership keeps Frequency independent. It pays the people and the infrastructure that run
        it, so the work stays member-funded instead of sold to advertisers.
      </p>

      {/* The pay-what-you-want SUPPORTER BADGE on Crew (ADR-463/495): an existing Crew member can back
          the Foundation with a one-time contribution instead of switching subscriptions. The toggle
          writes the badge; the contribution charge is gated by billing_live. */}
      <SupporterBadge
        initialOn={isSupporter}
        minLabel={formatCents(catalog.pwyw.minCents)}
        suggestedLabel={formatCents(catalog.pwyw.suggestedCents)}
      />

      {/* Founder note — shown while paid membership has not launched. */}
      {!live && !isFounder && (
        <div className="mt-8 text-center px-4">
          <p className="text-xs text-subtle leading-relaxed">
            When paid memberships launch, beta members will be offered the
            Opening Beta price. You can switch between the free tier and Crew freely
            during the beta period.
          </p>
        </div>
      )}
    </FocusTemplate>
  )
}
