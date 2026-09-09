import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceProfileStats } from '@/lib/spaces/analytics'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { readSpaceStanding } from '@/lib/spaces/standing-rollup'
import { standingLevers, type StandingLever } from '@/lib/spaces/standing'
import { ReachReceipt } from '@/components/spaces/reach-receipt'

// THE OPERATOR RECEIPT (LIVE-265 - docs/CORE-MODEL.md Phase 10 §8.4): "what did the network send
// me, and what would send more". The reason an operator opens the app on a Tuesday.
//
// It exists because of what shipped beside it. The Space directory used to order by `.order('name')`
// and now orders by an earned standing score (LIVE-262/263). A ranking nobody can see reads as
// favouritism, so the six signals that decide the order are printed here in the same words, with
// the one next move beside each, plus the promise in writing: placement is earned and cannot be
// bought. Nothing on this page reads a plan, a tier, or a payment, because nothing in the score does.
//
// A centered, no-rail-toggling Focus surface, same shape as its sibling /settings/qr. It resolves
// the Space, gates RENDER on canManage || staffViewing (404s otherwise, so a non-editor cannot tell
// the surface exists), and is READ-ONLY: there is nothing here to write, which is why staff preview
// needs no separate branch. The parent settings layout already carries the noindex.
//
// FAIL-SAFE: every read below degrades rather than throwing. No standing row yet (pre-migration, or
// before the first nightly pass) falls back to the live directory read; not listed in the directory
// at all still renders the levers, because the whole point is to show an operator what to do next.

export const metadata = {
  title: 'Your reach',
}

export default async function SpaceReachPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  // Three reads, together. `listNetworkedSpaces` is request-cached and is the SAME read the
  // directory itself runs, so the placement shown here is the placement a member sees, not a
  // second implementation of it.
  const [stats, stored, listing] = await Promise.all([
    getSpaceProfileStats(space.id, 30),
    readSpaceStanding(space.id),
    listNetworkedSpaces({}),
  ])

  const index = listing.findIndex((s) => s.id === space.id)
  const entry = index >= 0 ? listing[index] : null
  const placement = index >= 0 ? { position: index + 1, total: listing.length } : null

  // Prefer the nightly rollup's detail (all six signals). Before it has run, fall back to the live
  // directory read's detail (the four it can measure), so the page is useful on day one. With
  // neither, the levers list renders its own honest empty state.
  const detail = stored?.detail ?? entry?.standingDetail ?? null
  const levers: StandingLever[] = detail ? standingLevers(detail) : []

  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Your reach"
      description="What the network sent you, and what would send more. Placement here is earned, never bought, so this page shows you the whole formula."
      width="wide"
    >
      <ReachReceipt
        spaceSlug={slug}
        reach={{
          windowDays: stats.windowDays,
          profileViews: stats.profileViews,
          ctaClicks: stats.ctaClicks,
          followers: entry?.followerCount ?? stored?.audience ?? null,
          members: entry?.memberCount ?? stored?.commons ?? null,
          upcoming: entry?.upcomingEventCount ?? stored?.upcomingGatherings ?? null,
        }}
        levers={levers}
        placement={placement}
        listed={index >= 0}
        computedAt={stored?.computedAt ?? null}
      />
    </FocusTemplate>
  )
}
