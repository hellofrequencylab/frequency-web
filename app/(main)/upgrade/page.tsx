import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, Check, MessageSquare, Users, Star, Radio, BarChart3, ArrowRight, Rocket } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { billingLive } from '@/lib/pricing/settings'
import { memberTierSellable } from '@/lib/pricing/settings'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { formatCents } from '@/lib/pricing/display'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { FEATURE_METERS } from '@/lib/pricing/feature-meters'
import { memberMeterUsage } from '@/lib/pricing/member-meter-usage'
import { FeatureMeterRange } from '@/components/pricing/feature-meter-range'
import { SectionHeader } from '@/components/ui/section-header'
import { UpgradeToggle } from './upgrade-toggle'
import { PwywPicker } from './pwyw-picker'
import { CREW_PERKS } from '@/lib/crew/perks'

// MEMBER UPGRADE SURFACE (Pricing P3, ADR-362/363). Renders CREW, the one sellable member tier
// (ADR-878: the ladder is Member free and Crew), and gates the live checkout CTA behind
// memberTierSellable() = billingLive() AND the per-tier switch.
//
// 🔴 CREW IS PAY WHAT YOU WANT. There is no Crew price anywhere on this page, because there is no Crew
// price: the operator sets a FLOOR, a SUGGESTED amount, and some presets (catalog.pwyw), the member
// picks any monthly amount from the floor up, and every amount buys identical access. This page used to
// render a fixed "$9 / month" over a checkout that never passed an amount, plus a SEPARATE "become a
// Supporter" contribution box underneath, which split one offer into two and taught the page to read as
// "a $9 tier, and also a donation". The picker is the offer. Any Crew amount earns the Supporter badge
// (earnsSupporterMark, LIVE-755), so the badge is a consequence of joining rather than a second
// purchase, and it fades 45 days after support stops.
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
}: {
  // `?supporter=success&session_id=` is gone with the contribution itself (LIVE-361). Nothing can
  // produce that redirect any more, so reading it would be a handler for an event that cannot
  // happen -- which is what this page was doing.
  searchParams?: Promise<Record<string, never>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')

  // Membership is the entitlement axis (orthogonal to the community role). Paid = Crew, and Crew is
  // the only paid rung (ADR-878, and since 2026-08-24 the only other label on EntitlementTier is
  // 'free'). Anything that is not 'free' reads as paid, which is the same access-preserving direction
  // the retired read-time fold took.
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
  const [catalog, crewSellable, chargingLive] = await Promise.all([
    loadCatalogConfig(),
    memberTierSellable('crew'),
    billingLive(),
  ])

  // Live = the Crew checkout is actually sellable (billing on + the tier switch on).
  const live = crewSellable
  // 🔴 THE BETA TOGGLE FOLLOWS THE SERVER GATE, NOT THE SELLABLE FLAG (SCAN-773). toggleMembership
  // refuses whenever billingLive() is true, so the page shows that button only while billing is OFF.
  // Gating it on `!live` showed "Join the Crew" under a "Free Beta Active" banner whenever billing was
  // on but tier_crew_enabled was off (a staged launch where Space plans sell before Crew opens), and
  // every tap was refused. Billing on + Crew not sellable is its own state: no beta, no checkout.
  const betaOpen = !chargingLive
  // Crew has no single price: the operator's PWYW config carries the floor, the suggested amount, and
  // the preset anchors the picker offers.
  const pwyw = catalog.pwyw

  // Crew never sells back the community itself: joining, Circles, events, and Channels stay free for
  // everyone. The list below is what Crew actually adds (lib/pricing/gates.ts: vera_unlimited, plus
  // journey_library_list and entry_points, each enforced by its own parallel ladder) with the badge
  // and the rate.
  //
  // 🔴 THE QUEST IS NOT ON THIS LIST ANY MORE (ADR-1295, owner ruling 2026-09-09, OWN-071). Two
  // bullets named "the full rewards loop" and "spend your Gems in the Vault Store" as Crew perks;
  // the `gamification_full` and `vault_cash_in` gates behind them are deleted, so every signed-in
  // member earns, spends and competes. The Crew pitch must stop naming what everyone now gets, or it
  // is selling something the buyer already has.
  //
  // 🔴 THE HOST KIT LEADS, AND IT IS DERIVED (ADR-1709). Personal selling is off on every personal
  // tier now, so a fee line here would sell something Crew does not do. What Crew adds is room to host:
  // more Circles, more upcoming Events, bigger guest lists and more Journeys. The numbers are read from
  // the meter map, so a limit change moves this line with no copy edit.
  const L = PLACEHOLDER_METER_LIMITS
  const hostLine =
    `Host more: ${L.circle_host.crew} Circles, ${L.event_create.crew} upcoming Events with up to ` +
    `${L.event_guests.crew} guests, and ${L.journey_publish.crew} Journeys`
  const benefits = [
    { icon: BarChart3, label: hostLine },
    { icon: Radio, label: 'Branded QR codes, short links, and print-ready flyers for what you run' },
    // LIVE-756: the monthly Boost, given from a Circle or a Space page. A Circle moves up; a Space
    // gets a mark, never a lift (owner ruling 2026-10-06).
    { icon: Rocket, label: 'One Boost a month: lift a Circle in discovery for a week, or give a Space the Boosted mark' },
    { icon: MessageSquare, label: 'Vera without the daily cap' },
    { icon: Star, label: 'The Crew badge on your profile' },
    { icon: Users, label: 'List what you author in the public library' },
    // Crew perks beyond hosting (LIVE-757): listed only once one is live, so the page never sells a
    // perk with nothing behind it.
    ...CREW_PERKS.filter((p) => p.live).map((p) => ({ icon: Star, label: p.label })),
  ]

  return (
    <FocusTemplate
      width="narrow"
      title="Membership"
      description="Belonging is free, and stays free. Crew is the personal tier: contribute what you want, back the community, and get room to host more."
    >
      {/* Beta banner, shown while billing is off, which is exactly when the beta toggle works. */}
      {betaOpen && (
        <div className="rounded-2xl bg-primary-bg border border-primary-bg/50 px-5 py-4 mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-meta font-black uppercase tracking-widest text-primary-strong">
              Free Beta
            </span>
            <span className="text-3xs font-bold uppercase tracking-wider text-on-primary bg-primary px-2 py-0.5 rounded-md">
              Active
            </span>
          </div>
          {/* No "Opening Beta price" promise. Crew is pay-what-you-want, so there is no launch price to
              be offered early and nothing an early member could miss by waiting. Say what is true: it is
              free right now, and when it is sold the member sets the amount. */}
          <p className="text-body-sm text-primary-strong/70 dark:text-primary-strong/70 leading-relaxed">
            Frequency is in free beta. All features are unlocked for everyone. When paid memberships
            launch, Crew is contribute what you want, so you set the amount.
          </p>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-card border border-border bg-surface lift-1 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br bg-primary px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-on-primary/20 backdrop-blur-sm mb-4">
            <Zap className="w-7 h-7 text-on-primary" />
          </div>
          <p className="text-page-title font-bold text-on-primary mb-1">Join the Crew</p>
          <p className="text-primary-bg/80 text-body-sm">The personal tier: back the community and host more</p>
          {/* PWYW (ADR-908): Crew has no single price to headline, so the hero states the FLOOR and
              the picker below carries the choice. Never render a struck-through anchor here: there is
              no list price to discount against when the member sets the amount. */}
          <div className="mt-4 flex items-baseline justify-center gap-1">
            {/* 🔴 NO SINGLE PRICE. Crew is pay-what-you-want, so the header states the FLOOR and the
                picker below carries the actual choice. It rendered a fixed "$9 / month" until now,
                which was a made-up number for an offer that has no fixed number. */}
            {live ? (
              <>
                <span className="text-primary-strong text-body-sm mr-1">from</span>
                {/* text-stat-md is FIXED on purpose. A fluid display role shrinks the figure on
                    phones, which is where this page converts. */}
                <span className="text-stat-md font-black text-on-primary">{formatCents(pwyw.minCents)}</span>
                <span className="text-primary-strong text-body-sm ml-1">/ month</span>
              </>
            ) : betaOpen ? (
              <>
                <span className="text-stat-md font-black text-on-primary">Free</span>
                <span className="text-primary-strong text-body-sm ml-1">during beta</span>
              </>
            ) : (
              <span className="text-stat-md font-black text-on-primary">Opening soon</span>
            )}
          </div>
          {live && (
            <p className="mt-1 text-meta text-primary-strong/80">
              You pick the amount. {formatCents(pwyw.suggestedCents)} suggested, and every amount buys the same Crew.
            </p>
          )}
        </div>

        {/* Benefits */}
        <div className="px-6 py-6">
          <p className="eyebrow text-muted mb-4">
            What you get
          </p>
          <ul className="space-y-3.5">
            {benefits.map(({ label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-success-bg/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-success" />
                </div>
                <span className="text-body-sm text-text">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          {betaOpen ? (
            <UpgradeToggle isCrew={isCrew} />
          ) : isCrew ? (
            <Link
              href="/settings/billing"
              className="flex w-full items-center justify-center gap-2 rounded-control border border-border px-4 py-3 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              Manage your membership <ArrowRight className="h-4 w-4" />
            </Link>
          ) : live ? (
            <PwywPicker
              minCents={pwyw.minCents}
              suggestedCents={pwyw.suggestedCents}
              presetCents={pwyw.presetCents}
              maxCents={pwyw.maxCents}
            />
          ) : (
            // Billing is on but Crew is not on sale yet: no beta toggle (the action refuses) and no
            // checkout (the tier switch is off). A static notice, no button.
            <p
              data-crew-opens-soon
              className="rounded-control border border-border px-4 py-3 text-center text-body-sm text-muted"
            >
              Crew opens soon. You set the amount when it does.
            </p>
          )}
        </div>
      </div>

      {/* YOUR ALLOWANCES (docs/VALUE-LADDER.md Phase 4). The six personal meters, each with the
          member's REAL count where it resolves, the rung they are on highlighted, and the shared 80%
          nudge. Streamed behind Suspense so six counts never block the price card above
          (PAGE-FRAMEWORK §5). Informational: nothing here charges, refuses, or removes anything. */}
      <section className="mt-10">
        <SectionHeader title="Your allowances" />
        <p className="-mt-2 mb-4 text-body-sm text-muted">
          What you have built so far, and what each one carries on Member and on Crew. Everything you
          have already made stays yours on either.
        </p>
        <Suspense fallback={<MetersSkeleton />}>
          <TierUsageMeters profileId={profile.id} tier={tier} />
        </Suspense>
      </section>

      {/* Mission framing (CONTENT-VOICE: plain, concrete, no narrating the reader's feelings, skeptic
          test). State plainly what the membership funds. */}
      <p className="mt-5 text-center text-meta leading-relaxed text-subtle px-4">
        A paid membership keeps Frequency independent. It pays the people and the infrastructure that run
        it, so the work stays member-funded instead of sold to advertisers.
      </p>

      {/* 🔴 THE STANDALONE "BECOME A SUPPORTER" BLOCK IS GONE, and its removal is the point of this
          change rather than a side effect. Crew is pay-what-you-want, and `earnsSupporterMark` already
          grants the badge to anyone on Crew. Offering a SECOND
          pay-what-you-want box underneath a Crew card is what split one offer into two and made the
          page read as "a $9 tier, plus a separate donation" — which is not the model.
          The badge is now earned by joining Crew in the picker above. */}

      {/* What happens at launch, stated without a promise we would have to keep. */}
      {!live && (
        <div className="mt-8 text-center px-4">
          <p className="text-meta text-subtle leading-relaxed">
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
        <div key={i} className="h-44 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
      ))}
    </div>
  )
}
