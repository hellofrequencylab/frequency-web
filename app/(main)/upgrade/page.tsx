import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, Check, MessageSquare, CalendarDays, Users, Star, Radio, BarChart3, ArrowRight } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { billingEnabled } from '@/lib/billing/stripe'
import { UpgradeToggle } from './upgrade-toggle'
import { CheckoutButton } from './checkout-button'

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

  // Membership is the entitlement axis (orthogonal to the community role). Paid = Crew.
  const tier = (profile.membership_tier ?? 'free') as string
  const isCrew = tier !== 'free'
  // When Stripe billing is configured, /upgrade is a real checkout; otherwise it's the
  // free beta toggle (P2.2 — the layer is dormant until keys + price IDs land).
  const live = billingEnabled()

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
      description="Your access to the Frequency community — free during beta."
    >
      {/* Beta banner */}
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

      {/* Main card */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br bg-primary px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Join the Crew</h1>
          <p className="text-primary-bg/80 text-sm">Full access to the Frequency community</p>
          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="text-3xl font-black text-white line-through opacity-50">$10</span>
            <span className="text-4xl font-black text-white ml-2">Free</span>
            <span className="text-primary-strong text-sm ml-1">during beta</span>
          </div>
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

        {/* Toggle */}
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

      {/* Founder note */}
      <div className="mt-8 text-center px-4">
        <p className="text-xs text-subtle leading-relaxed">
          When paid memberships launch, beta members will be offered exclusive
          Founder pricing. You can switch between the free tier and Crew freely
          during the beta period.
        </p>
      </div>
    </FocusTemplate>
  )
}
