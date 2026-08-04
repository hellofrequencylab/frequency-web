import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, Check, MessageSquare, Users, Star, Radio, BarChart3, ArrowRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getPricingValues, billingLive } from '@/lib/pricing/settings'
import { memberTierSellable } from '@/lib/pricing/settings'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { formatBps, formatCents } from '@/lib/pricing/display'
import { FEATURE_METERS } from '@/lib/pricing/feature-meters'
import { memberMeterUsage } from '@/lib/pricing/member-meter-usage'
import { FeatureMeterRange } from '@/components/pricing/feature-meter-range'
import { SectionHeader } from '@/components/ui/section-header'
import { confirmSupporterContribution } from './actions'
import { UpgradeToggle } from './upgrade-toggle'
import { PwywPicker } from './pwyw-picker'

// MEMBER UPGRADE SURFACE (Pricing P3, ADR-362/363). Renders CREW, the one sellable member tier
// (ADR-878: the ladder is Member free and Crew), and gates the live checkout CTA behind
// memberTierSellable() = billingLive() AND the per-tier switch.
//
// 🔴 CREW IS PAY WHAT YOU WANT. There is no Crew price anywhere on this page, because there is no Crew
// price: the operator sets a FLOOR, a SUGGESTED amount, and some presets (catalog.pwyw), the member
// picks any monthly amount from the floor up, and every amount buys identical access. This page used to
// render a fixed "$9 / month" over a checkout that never passed an amount, plus a SEPARATE "become a
// Supporter" contribution box underneath, which split one offer into two and taught the page to read as
// "a $9 tier, and also a donation". The picker is the offer. Paying at or above the suggested amount is
// what earns the Supporter badge (earnsSupporterMark), so the badge is a consequence of the one choice
// rather than a second purchase.
//
// The picker is `PwywPicker`: presets + an open field + an annual toggle, over the ONE checkout seam
// (startMembershipCheckout, amount required). It also carries the soft-ceiling confirm ADR-908 asks
// for. There is no no-amount CTA on this page, because there is no amount to fall back to.
//
// OFF preserves today's behavior: while billing is not live the page shows the free-beta toggle, never
// a broken button. No em dashes (CONTENT-VOICE §10).

// THE PERSONAL (tier-axis) USAGE METERS (docs/VALUE-LADDER.md Phase 4, Appendix A3). All six were
// total gaps: the Space plan-and-usage hub filters to `axis === 'plan'`, and this page mounted no
// meter component at all, so a member had nowhere in the product to see a single personal allowance.
// This is the mirror of BillingBody's PLAN_USAGE_METERS, on the other axis, from the same source.
const TIER_USAGE_METERS = Object.values(FEATURE_METERS).filter((m) => m.axis === 'tier')

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

  // 🔴 THE FOUNDING-MEMBER LOCK IS GONE FROM THIS PAGE, and so is the admin read that fed it. A locked
  // price is a promise about a FIXED price, and Crew no longer has one: a member picks their own amount
  // and can change it, so there is nothing to lock and nothing a later price change could take away.
  // The page kept promising "your Founder price is locked in" to a cohort that is empty (zero profiles
  // carry is_founding_member) about a price that does not exist. That is the one kind of pricing copy
  // that cannot be allowed to drift, so it is removed rather than reworded.
  //
  // crewSellable is billingLive() AND the tier switch: false while billing is OFF, so the page degrades
  // to the beta toggle. The catalog config carries the PWYW amounts.
  const [values, catalog, crewSellable] = await Promise.all([
    getPricingValues(),
    loadCatalogConfig(),
    memberTierSellable('crew'),
  ])

  // Live = the Crew checkout is actually sellable (billing on + the tier switch on). While OFF the
  // upgrade is the free beta toggle, exactly as before, with a disabled price preview beneath it.
  const live = crewSellable
  // Crew has no single price: the operator's PWYW config carries the floor, the suggested amount, and
  // the preset anchors the picker offers.
  const pwyw = catalog.pwyw

  // Crew never sells back the community itself: joining, Circles, events, and Channels stay free for
  // everyone. The list below is what Crew actually adds (lib/pricing/gates.ts: vault_cash_in,
  // gamification_full, vera_unlimited, journey_library_list, entry_points) plus the badge and the rate.
  //
  // 🔴 THE RATE LEADS, AND IT IS DERIVED (ADR-914). This page is the member-facing half of /pricing and
  // used not to mention the rate at all, which left the two surfaces selling different products: the
  // marketing page said the ladder IS the rate, and the actual upgrade screen listed a badge and some
  // Gems. Selling is free on every tier now, so the single most concrete reason a member upgrades is
  // that their fee on network-sourced sales drops. It is read from the same config /pricing renders, so
  // an operator edit moves both, and the phrasing matches that page word for word.
  const rateLine =
    `Your fee on network-sourced sales drops from ${formatBps(values.take_rate.member_free_bps)} ` +
    `to ${formatBps(values.take_rate.member_bps)}. Your own people stay 0%, as they are on every tier.`
  const benefits = [
    { icon: BarChart3, label: rateLine },
    { icon: Radio, label: 'Branded QR codes, short links, and print-ready flyers for what you run' },
    { icon: MessageSquare, label: 'Vera without the daily cap' },
    { icon: Zap, label: 'The full rewards loop: streaks, seasons, and the whole ladder' },
    { icon: Star, label: 'Spend your Gems in the Vault Store, and wear the Crew badge' },
    { icon: Users, label: 'List what you author in the public library' },
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
          {/* No "Opening Beta price" promise. Crew is pay-what-you-want, so there is no launch price to
              be offered early and nothing an early member could miss by waiting. Say what is true: it is
              free right now, and when it is sold the member sets the amount. */}
          <p className="text-sm text-primary-strong/70 dark:text-primary-strong/70 leading-relaxed">
            Frequency is in free beta. All features are unlocked for everyone. When paid memberships
            launch, Crew is pay what you want, so you set the amount.
          </p>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-border bg-surface lift-1 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br bg-primary px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-on-primary/20 backdrop-blur-sm mb-4">
            <Zap className="w-7 h-7 text-on-primary" />
          </div>
          <p className="text-2xl font-bold text-on-primary mb-1">Join the Crew</p>
          <p className="text-primary-bg/80 text-sm">The personal tier: your badge, the whole game, and backing the community</p>
          {/* PWYW (ADR-908): Crew has no single price to headline, so the hero states the FLOOR and
              the picker below carries the choice. Never render a struck-through anchor here: there is
              no list price to discount against when the member sets the amount. */}
          <div className="mt-4 flex items-baseline justify-center gap-1">
            {/* 🔴 NO SINGLE PRICE. Crew is pay-what-you-want, so the header states the FLOOR and the
                picker below carries the actual choice. It rendered a fixed "$9 / month" until now,
                which was a made-up number for an offer that has no fixed number. */}
            {live ? (
              <>
                <span className="text-primary-strong text-sm mr-1">from</span>
                <span className="text-4xl font-black text-on-primary">{formatCents(pwyw.minCents)}</span>
                <span className="text-primary-strong text-sm ml-1">/ month</span>
              </>
            ) : (
              <>
                <span className="text-4xl font-black text-on-primary">Free</span>
                <span className="text-primary-strong text-sm ml-1">during beta</span>
              </>
            )}
          </div>
          {live && (
            <p className="mt-1 text-xs text-primary-strong/80">
              You pick the amount. {formatCents(pwyw.suggestedCents)} suggested, and every amount buys the same Crew.
            </p>
          )}
        </div>

        {/* Benefits */}
        <div className="px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">
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
              className="flex w-full items-center justify-center gap-2 rounded-card border border-border px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              Manage your membership <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <PwywPicker
              minCents={pwyw.minCents}
              suggestedCents={pwyw.suggestedCents}
              presetCents={pwyw.presetCents}
              maxCents={pwyw.maxCents}
            />
          )}
        </div>
      </div>

      {/* YOUR ALLOWANCES (docs/VALUE-LADDER.md Phase 4). The six personal meters, each with the
          member's REAL count where it resolves, the rung they are on highlighted, and the shared 80%
          nudge. Streamed behind Suspense so six counts never block the price card above
          (PAGE-FRAMEWORK §5). Informational: nothing here charges, refuses, or removes anything. */}
      <section className="mt-10">
        <SectionHeader title="Your allowances" />
        <p className="-mt-2 mb-4 text-sm text-muted">
          What you have built so far, and what each one carries on Member and on Crew. Everything you
          have already made stays yours on either.
        </p>
        <Suspense fallback={<MetersSkeleton />}>
          <TierUsageMeters profileId={profile.id} tier={tier} />
        </Suspense>
      </section>

      {/* Mission framing (CONTENT-VOICE: plain, concrete, no narrating the reader's feelings, skeptic
          test). State plainly what the membership funds. */}
      <p className="mt-5 text-center text-xs leading-relaxed text-subtle px-4">
        A paid membership keeps Frequency independent. It pays the people and the infrastructure that run
        it, so the work stays member-funded instead of sold to advertisers.
      </p>

      {/* 🔴 THE STANDALONE "BECOME A SUPPORTER" BLOCK IS GONE, and its removal is the point of this
          change rather than a side effect. Crew is pay-what-you-want, and `earnsSupporterMark` already
          grants the badge to anyone who picks at or above the suggested amount. Offering a SECOND
          pay-what-you-want box underneath a Crew card is what split one offer into two and made the
          page read as "a $9 tier, plus a separate donation" — which is not the model.
          The badge is now earned by the amount you choose in the picker above. An existing Crew member
          who wants to change it changes their amount. */}

      {/* What happens at launch, stated without a promise we would have to keep. */}
      {!live && (
        <div className="mt-8 text-center px-4">
          <p className="text-xs text-subtle leading-relaxed">
            You can switch between the free tier and Crew freely during the beta. When paid memberships
            launch you pick what you pay, from {formatCents(pwyw.minCents)} a month, and you can change
            that amount whenever you want.
          </p>
        </div>
      )}
    </FocusTemplate>
  )
}

// The six personal usage meters, self-fetching so the price card paints first (PAGE-FRAMEWORK §5).
// Each ladder is the SAME FeatureMeterRange the Space plan-and-usage hub mounts, so there is one
// meter idiom in the product rather than a second one invented for members. `memberMeterUsage`
// OMITS a key whose count could not be read, so a failed read renders the allowance ladder without a
// wrong number instead of claiming zero.
async function TierUsageMeters({ profileId, tier }: { profileId: string; tier: string }) {
  const [usage, billingIsLive] = await Promise.all([memberMeterUsage(profileId), billingLive()])
  return (
    <div className="space-y-4">
      {TIER_USAGE_METERS.map((ladder) => (
        <FeatureMeterRange
          key={ladder.featureKey}
          ladder={ladder}
          currentTier={tier}
          upgradeHref="/upgrade"
          live={billingIsLive}
          usage={usage[ladder.featureKey]}
        />
      ))}
    </div>
  )
}

// Dimension-matched skeleton for the streamed meters (no CLS, PAGE-FRAMEWORK §5.4).
function MetersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
      ))}
    </div>
  )
}
