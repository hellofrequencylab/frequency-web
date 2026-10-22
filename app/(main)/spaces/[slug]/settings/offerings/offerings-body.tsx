import { Suspense } from 'react'
import { HandHeart } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { asOfferingTab, offeringSectionsForType, type OfferingTab } from '@/lib/spaces/offerings'
import { isRetiredSpaceFunctionKey } from '@/lib/spaces/functions'
import type { Space } from '@/lib/spaces/types'
import { SpacePayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'
import type { PayoutChannel } from '@/lib/billing/payout-prompt'
import { AvailabilitySection } from '../availability/section'
import { MembershipsSection } from '../memberships/section'
import { DonationsSection } from '../donations/section'
import { CheckinSection } from '../checkin/section'
import { OfferingsTabs } from './offerings-tabs'

// OFFERINGS BODY — the chrome-free unified commerce surface, lifted out of the standalone
// /settings/offerings page (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped
// in its FocusTemplate chrome, and (2) INLINE in the Space profile body as the Offerings `?panel=`
// workspace (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames
// it) and SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not
// manage this Space (the standalone page still 404s via its own gate, so a null here never renders a bare
// 200).
//
// It stacks the commerce sub-surfaces a Space configures HERE: Availability, Memberships, Donations. Each
// section re-checks its OWN per-tool gate and renders the SAME forms whose server actions stay the source
// of truth. SPEED (PAGE-FRAMEWORK §5): every section does slow awaits, so each renders behind its own
// <Suspense> and its fetches run in parallel. COPY: plain labels, no em/en dashes.
//
// THREE SECTIONS CAME OUT HERE (LIVE-226). Enrollment, Tickets and Check in each stacked a second door
// onto a tool the product already had, so Offerings read as six products instead of three: enrollment is
// a Journey plus the Memberships roster, tickets are the event ticket flow, and checking someone in at
// the door is an event mechanic. Their function keys are retired (lib/spaces/functions.ts
// RETIRED_SPACE_FUNCTIONS), and this body drops any catalog section whose required function is retired,
// so a stale catalog row can never put one back on the page.

/** Per-section header copy (CONTENT-VOICE: plain, no em/en dashes). Keyed by the offering anchor. */
const SECTION_META: Record<string, { title: string; blurb: string }> = {
  availability: {
    title: 'Availability and bookings',
    blurb: 'Set the weekly times members can book, and see who is on your calendar.',
  },
  memberships: {
    title: 'Memberships',
    blurb: 'Define the tiers members can join, set what each one costs, and see who has joined.',
  },
  donations: {
    title: 'Donations',
    blurb: 'Set up your fund and the amounts supporters can pick.',
  },
}

/** Which MONEY PATH each offering section is (LIVE-233). Offerings is where an operator sets the
 *  prices for three of the five paths, so it is where the one Connect prompt belongs: an operator who
 *  prices a tier here and has no payout account used to get NO signal at all, and the join card
 *  silently fell back to the free join path when a member tried to pay. A section with no money path
 *  contributes nothing to the prompt. */
const SECTION_CHANNEL: Record<string, PayoutChannel> = {
  availability: 'bookings',
  memberships: 'memberships',
  donations: 'donations',
}

/** Bind an offering anchor to its section body. Each takes the resolved space + the preview flag. */
function renderSection(
  anchor: string,
  space: Space,
  viewerProfileId: string | null,
  staffViewing: boolean,
  view?: string,
) {
  const common = { space, viewerProfileId, staffViewing }
  switch (anchor) {
    case 'availability':
      return <AvailabilitySection {...common} />
    case 'memberships':
      return <MembershipsSection {...common} view={view} />
    case 'donations':
      return <DonationsSection {...common} />
    default:
      return null
  }
}

export async function OfferingsBody({ slug, tab, view }: { slug: string; tab?: string; view?: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name
  // Drop any catalog section whose required function was retired (LIVE-226): the section body may still
  // exist for another surface, but Offerings is no longer where it is configured.
  const sections = offeringSectionsForType(space.type).filter(
    (s) => !isRetiredSpaceFunctionKey(s.requiredFunction),
  )
  // The money paths this surface covers, in the order the prompt declares them.
  const channels = sections
    .map((s) => SECTION_CHANNEL[s.anchor])
    .filter((c): c is PayoutChannel => Boolean(c))

  const active = asOfferingTab(tab)

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {sections.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="No offerings for this space yet."
          description="This space type does not run bookings, memberships, or giving. Change your space type to add them."
        />
      ) : (
        <>
          <OfferingsTabs active={active} />
          <div className="pt-6">
            <Suspense key={active} fallback={<SectionSkeleton />}>
              {renderTab(active, space, viewerProfileId, staffViewing, channels, view)}
            </Suspense>
          </div>
        </>
      )}
    </>
  )
}

/** One tab's body. Only the open tab renders, so the page loads one section's data, not all of them. */
function renderTab(
  tab: OfferingTab,
  space: Space,
  viewerProfileId: string | null,
  staffViewing: boolean,
  channels: PayoutChannel[],
  view?: string,
) {
  if (tab === 'paid') return <PaidTab space={space} viewerProfileId={viewerProfileId} channels={channels} />
  if (tab === 'checkin') {
    return <CheckinSection space={space} viewerProfileId={viewerProfileId} staffViewing={staffViewing} view={view} />
  }
  const anchor = tab === 'bookings' ? 'availability' : tab
  const meta = SECTION_META[anchor]
  return (
    <section id={anchor} className="scroll-mt-24">
      <p className="mb-5 max-w-prose text-body-sm text-muted">{meta.blurb}</p>
      {renderSection(anchor, space, viewerProfileId, staffViewing, view)}
    </section>
  )
}

/** THE ONE CONNECT PROMPT (LIVE-233), for whichever money paths this space configures here. It renders the
 *  payout ACCOUNT STATE rather than only a nudge (whenReady="status", LIVE-290): an owner whose account
 *  already works gets a way back to their Stripe dashboard. An admin who is not the OWNER is told who has
 *  to act, because the owner is who Stripe pays (ADR-819). It has its own tab now, so it stops pushing the
 *  forms down the page. */
function PaidTab({
  space,
  viewerProfileId,
  channels,
}: {
  space: Space
  viewerProfileId: string | null
  channels: PayoutChannel[]
}) {
  return (
    <section id="paid">
      <p className="mb-5 max-w-prose text-body-sm text-muted">
        Where your money lands and which of your money paths are live.
      </p>
      <SpacePayoutSetupPrompt space={space} viewerProfileId={viewerProfileId} channels={channels} whenReady="status" />
    </section>
  )
}

// Dimension-matched skeleton while a section streams its data (no CLS, PAGE-FRAMEWORK §5.4).
function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
      <div className="h-14 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
    </div>
  )
}
