// THE WELCOME (PROG-GD5): what a buyer sees the moment a Journey is theirs.
//
// ── WHY THIS PAGE EXISTS ─────────────────────────────────────────────────────────────────────────
// Measured on 2026-09-21: a stranger who bought a Journey through the guest door came back from
// Stripe to /orders, a member page with no public twin, so the shell dropped them on the marketing
// home with no acknowledgement, no sign-in door and no settle. Once they signed in, their landing
// was "My orders": a receipt card with a status pill and a Dispute button, no link to the Journey
// they had paid for and no door to anything else. The account cost one step, correctly (ADR-1371
// admits any profile row; the magic-link tap is the proof, ADR-854), and then opened onto a form.
//
// This page is where both doors now land (`journeyWelcomeDoor` in lib/journeys/sales-path.ts, the
// guest's Stripe success_url and the receipt's button; `claimGuestOrdersOnSignIn` for the
// cookie-less magic-link arrival). It shows the Journey they bought and the two or three doors
// that matter next, and nothing that asks them to fill anything in.
//
// ── THE TWO BACKSTOPS, IN ORDER ──────────────────────────────────────────────────────────────────
// A guest is always on hosted Checkout, so the return carries `session_id`. The claim at sign-in
// only attaches a SETTLED order (claim_guest_orders, status in paid/fulfilled), and the webhook that
// settles it races the magic-link round trip. So, exactly as the event page does for a ticket
// (`recordTicketFromSessionId` on `?ticket=success`): settle the session Stripe says is paid, THEN
// re-run the claim, which is idempotent and cheap. Either may have already happened; neither is
// skipped, because whichever ran first cannot know about the other. Both are best-effort: a page
// that 500s over a backstop is worse than a page that says "still settling" and offers a refresh.
//
// ── NOT A FORM, AND NOT A PARALLEL ONBOARDING ────────────────────────────────────────────────────
// The doors after the Journey are the first-run checklist's own open steps (lib/onboarding, the one
// engine, LIVE-259 / LIVE-349), filtered to the two that are places rather than fields: a Circle
// and an Event. A step already done is not shown. The host is the third door when the Journey has
// one: the Space that runs it, or its author. Identity and photo stay where the checklist keeps
// them, in the rail, because a welcome that opens onto a name field is the thing this row names.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight, Building2, CalendarDays, Hourglass, User, Users } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getPlan, getPlanAuthor, isPlanAdopted } from '@/lib/journey-plans'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getOnboardingStatus, type OnboardingStep } from '@/lib/onboarding/status'
import { recordCommerceOrderFromSessionId } from '@/lib/commerce/checkout'
import {
  claimGuestOrdersOnSignIn,
  type OrderSessionClient,
} from '@/lib/commerce/claim-guest-orders-on-sign-in'
import {
  journeyLearnPath,
  journeyMemberPath,
  journeyWelcomeDoor,
  journeyWelcomePath,
} from '@/lib/journeys/sales-path'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
}

/** The checklist steps that are places to go, not fields to fill. */
const DOOR_STEPS = new Set<OnboardingStep['key']>(['circle', 'event'])

function DoorCard({
  href,
  icon: Icon,
  title,
  description,
  cta,
}: {
  href: string
  icon: typeof Users
  title: string
  description: string
  cta: string
}) {
  return (
    <EntityCard
      href={href}
      anchor={
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-primary-bg text-primary-strong">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      }
      title={title}
      description={description}
      meta={
        <span className="inline-flex items-center gap-1 font-semibold text-primary-strong">
          {cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      }
    />
  )
}

export default async function JourneyWelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { slug } = await params
  const { session_id } = await searchParams
  const sessionId = typeof session_id === 'string' && session_id.startsWith('cs_') ? session_id : null

  // The shell already sends a signed-out visitor away; this keeps the page honest on its own.
  const profileId = await getMyProfileId()
  if (!profileId) redirect(journeyWelcomeDoor(slug, { sessionId }))

  const loaded = await getPlan(slug)
  if (!loaded) notFound()
  const { plan, items } = loaded

  // The two backstops, settle then claim. See the header.
  if (sessionId) {
    try {
      await recordCommerceOrderFromSessionId(sessionId)
    } catch (error) {
      console.error('[journey-welcome] settle by session failed; the webhook is the only path', { sessionId, error })
    }
    try {
      const session = await createClient()
      await claimGuestOrdersOnSignIn(session as unknown as OrderSessionClient)
    } catch (error) {
      console.error('[journey-welcome] claim after settle failed', { sessionId, error })
    }
  }

  const enrolled = await isPlanAdopted(profileId, plan.id)
  if (!enrolled) {
    // Nothing to welcome and no payment in flight: the Journey page, which has the till.
    if (!sessionId) redirect(journeyMemberPath(slug))
    // Paid, but neither backstop has produced an enrolment yet. Say so, and offer the refresh; the
    // webhook will land, and a second visit runs both backstops again.
    return (
      <FocusTemplate
        eyebrow="Almost there"
        title={plan.title}
        description="Your payment is still settling. This usually takes a few seconds."
        back={{ href: '/orders', label: 'My orders' }}
      >
        <EmptyState
          icon={Hourglass}
          variant="first-use"
          title="Still confirming your payment."
          description="Refresh in a moment and the Journey will be here. If it is not after a few minutes, check My orders; the receipt from Stripe means the money moved."
          action={
            <Link href={journeyWelcomePath(slug, sessionId)} className={buttonClasses('primary', 'md')}>
              Refresh
            </Link>
          }
        />
      </FocusTemplate>
    )
  }

  const [author, rootSpaceId, onboarding] = await Promise.all([
    getPlanAuthor(plan.author_id),
    loadRootSpaceId(),
    getOnboardingStatus(profileId),
  ])
  const space = plan.space_id && plan.space_id !== rootSpaceId ? await getSpaceById(plan.space_id) : null

  // The column carries 'phase' and 'module' beside the typed BlockType union (getMyPlanSummaries
  // counts the same way), so it is read as the string it is.
  const blockKind = (i: (typeof items)[number]): string => (i.block_type as string | undefined) ?? 'practice'
  const phases = items.filter((i) => blockKind(i) === 'phase').length
  const steps = items.filter((i) => blockKind(i) !== 'phase' && blockKind(i) !== 'module').length
  const facts = [
    phases > 0 ? `${phases} ${phases === 1 ? 'phase' : 'phases'}` : null,
    steps > 0 ? `${steps} ${steps === 1 ? 'step' : 'steps'}` : null,
  ].filter((f): f is string => !!f)

  const doors = onboarding.todo.filter((s) => DOOR_STEPS.has(s.key))

  return (
    <FocusTemplate
      eyebrow="You're in"
      title={plan.title}
      description="Paid and yours. Start whenever you like, on your own or with people you bring."
      width="wide"
    >
      <div className="space-y-8">
        <EntityCard
          href={journeyLearnPath(slug)}
          cover={
            plan.cover_image ? (
              <Image
                src={plan.cover_image}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 1024px) 48rem, 100vw"
                className="object-cover"
                style={plan.cover_focus ? { objectPosition: plan.cover_focus } : undefined}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary-bg text-5xl" aria-hidden>
                {plan.emoji ?? ''}
              </div>
            )
          }
          coverAspect="short"
          title={plan.title}
          context={facts.length ? facts.join(' · ') : undefined}
          description={plan.summary ?? undefined}
          footer={
            <Link href={journeyLearnPath(slug)} className={buttonClasses('primary', 'md', 'w-full')}>
              Start the Journey
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />

        <section aria-labelledby="welcome-doors">
          <h2 id="welcome-doors" className="text-meta font-semibold uppercase tracking-wide text-subtle">
            Where this opens onto
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {space ? (
              <DoorCard
                href={`/spaces/${space.slug}`}
                icon={Building2}
                title={space.name}
                description="The people running this Journey. See what else they host and when."
                cta="Meet the host"
              />
            ) : author ? (
              <DoorCard
                href={`/people/${author.handle}`}
                icon={User}
                title={author.displayName}
                description="The person who built this Journey. See what else they are up to."
                cta="Meet the host"
              />
            ) : null}
            {doors.map((step) => (
              <DoorCard
                key={step.key}
                href={step.href}
                icon={step.key === 'event' ? CalendarDays : Users}
                title={step.headline}
                description={step.blurb}
                cta={step.cta}
              />
            ))}
          </div>
        </section>
      </div>
    </FocusTemplate>
  )
}
