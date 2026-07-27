import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { grantFoundingBusinessFromSessionId } from '@/lib/founding/business-checkout'

// The founding Business checkout's success redirect (ADR-599 / ADR-803).
//
// The session is stamped kind:'space_plan', so the EXISTING space-plan webhook already reconciles the
// Space to Business. What it does not do is read the `founding:'business'` + `cohort_city` keys, which
// exist only for this offer — so the durable founder record is granted here, the same
// webhook-independent pattern the tip and supporter-contribution confirms use.
//
// grantFoundingStatus is IDEMPOTENT, so a refresh, a double redirect, or a webhook that later learns
// to do this cannot double-grant. The confirm also verifies the session really is ours and really was
// paid before granting anything.
//
// ADMIN-gated like the offer page; notFound() on a miss, so there is no existence leak. No em dashes.

export const metadata = {
  title: 'Founding spot confirmed',
}

export default async function FoundingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { slug } = await params
  const { session_id: sessionId } = await searchParams

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.isAdmin) notFound()

  const brandName = space.brandName ?? space.name
  const granted = sessionId ? await grantFoundingBusinessFromSessionId(sessionId) : null

  return (
    <FocusTemplate
      eyebrow={brandName}
      title={granted ? 'Your founding spot is locked' : 'Thanks, we are finishing up'}
      description={
        granted
          ? 'The rate you just locked is yours for as long as you stay.'
          : 'Your payment went through. The plan will show as active here in a moment.'
      }
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text">
                {granted ? 'Founding Business' : 'Payment received'}
              </p>
              <p className="text-sm text-muted">
                {granted && granted.cohortCity
                  ? `You are in the founding cohort for ${granted.cohortCity}.`
                  : granted
                    ? 'You are in the founding cohort.'
                    : 'If this page still says this after a refresh, your plan is safe. Open plan and usage to see it.'}
              </p>
            </div>
          </div>
        </section>

        <p className="text-2xs text-subtle">
          <Link
            href={`/spaces/${slug}/settings/billing`}
            className="font-semibold text-primary-strong hover:underline"
          >
            See your plan and usage
          </Link>
        </p>
      </div>
    </FocusTemplate>
  )
}
