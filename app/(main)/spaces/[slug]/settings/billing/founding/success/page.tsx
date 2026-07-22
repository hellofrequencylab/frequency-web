import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { billingLive } from '@/lib/pricing/settings'
import { confirmFoundingBusinessCheckout } from '../actions'

// FOUNDING BUSINESS success page (ADR-804). Reached from Stripe's success_url after a paid founding
// Business checkout. It CONFIRMS on the redirect (a webhook-independent grant: the durable founder
// record is written at the locked rate + 3% take-rate, idempotent and shared with any webhook hook),
// then congratulates the new Founding Business. Still GATED: while billing is OFF it never calls Stripe
// and shows the not-open copy, so the route is inert until the owner flips billing_live. No em dashes.

export const metadata = {
  title: 'You are a Founding Business',
  robots: { index: false },
}

export default async function FoundingBusinessSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { slug } = await params
  const { session_id } = await searchParams

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const billingHref = `/spaces/${space.slug}/settings/billing`
  const live = await billingLive()

  // Confirm on the redirect (grants the founding record if the session is paid + belongs to this Space).
  // Idempotent: a webhook hook may have already granted it.
  const result = live && session_id ? await confirmFoundingBusinessCheckout(space.slug, session_id) : null
  const confirmed = result?.ok === true

  if (confirmed) {
    return (
      <FocusTemplate eyebrow={brandName} title="Welcome to the founding cohort" back={{ href: billingHref, label: 'Plan and usage' }}>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success-bg text-success">
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </div>
          <p className="text-base font-bold text-text">{brandName} is a Founding Business.</p>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Your founder rate is locked and your marketplace fee is bought down to the lowest on the
            platform, grandfathered for the life of your subscription. A founding Business membership is a
            membership, not an investment.
          </p>
          <Link href={billingHref} className="mt-4 inline-block text-sm font-semibold text-primary-strong underline">
            Go to plan and usage
          </Link>
        </div>
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title={live ? 'Almost there' : 'Checkout is not open yet'}
      back={{ href: billingHref, label: 'Plan and usage' }}
    >
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm text-muted leading-relaxed">
          {live
            ? 'We are confirming your founding Business membership. If your payment went through, your founder rate is locked. If this page looks wrong, refresh in a moment or check your plan and usage.'
            : 'Founding checkout is not open yet, so nothing was charged. When it opens, you can lock the founder rate here.'}
        </p>
        <Link href={billingHref} className="mt-4 inline-block text-sm font-semibold text-primary-strong underline">
          Back to plan and usage
        </Link>
      </div>
    </FocusTemplate>
  )
}
