import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { isoDaysAgo } from '@/lib/utils'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { canSeeSpaceDiscussionTab, getLiveSpaceCircle } from '@/lib/spaces/space-discussion'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { setCircleContext } from '@/lib/circles/active-circle'
import { CircleFeed } from '@/components/widgets/circles/circle-feed'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleLocked } from '@/components/circles/circle-locked'
import { buttonClasses } from '@/components/ui/button'

// SPACE DISCUSSION (LIVE-421 / ADR-1469).
//
// Lives inside the (profile) group so the cover, identity row, and tab menu come from the
// layout. This file is only the body. Never a second <h1>.
//
// The conversation is the Space Circle feed. Posts stay circle-scoped. Replies already
// live on that feed. This page is the door on the Space, named Discussion.

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'discussion',
    label: 'Discussion',
    describe: (brandName) => `Talk with the people at ${brandName}.`,
  })
}

export default async function SpaceDiscussionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  if (space.type === 'root') redirect(`/spaces/${slug}`)
  setActiveSpace(space)

  const circlesDef = spaceFunctionDef('circles')
  if (circlesDef && !spaceFunctionEnabled(space, circlesDef)) redirect(`/spaces/${slug}`)

  const brandName = space.brandName ?? space.name
  const manage = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null)
  const canManageSpace = manage.canManage || manage.staffViewing
  const hub = await getLiveSpaceCircle(space.id)
  const show = canSeeSpaceDiscussionTab({
    spaceType: space.type,
    hubLive: !!hub,
    canManage: canManageSpace,
  })
  if (!show) redirect(`/spaces/${slug}`)

  if (!hub) {
    return (
      <div className="space-y-4">
        <p className="text-body-sm leading-relaxed text-muted">
          Talk with the people at {brandName}.
        </p>
        <EmptyState
          icon={MessagesSquare}
          title="Discussion is off"
          description="Turn on this Space's Circle and people who belong here can talk in one place."
          action={
            <Link href={`/spaces/${space.slug}/manage/circles`} className={buttonClasses('primary', 'sm')}>
              Open Circles
            </Link>
          }
        />
      </div>
    )
  }

  const shell = await loadCircleShell(hub.slug)
  if (!shell) {
    return (
      <div className="space-y-4">
        <p className="text-body-sm leading-relaxed text-muted">
          Talk with the people at {brandName}.
        </p>
        <EmptyState
          variant="permission"
          icon={MessagesSquare}
          title="Join to talk here"
          description={`This conversation is for people who belong at ${brandName}.`}
          action={
            <Link href={`/circles/${hub.slug}`} className={buttonClasses('primary', 'sm')}>
              See how to join
            </Link>
          }
        />
      </div>
    )
  }

  // 🔴 THE SAME DEFECT, ONE ROUTE OVER (LIVE-519). This line read `{ circle, members }` and dropped
  // the entry verdict, so a viewer who may SEE the Space Circle but not ENTER it fell straight
  // through to <CircleFeed /> with the roster the shell had deliberately blanked: an empty
  // conversation with no lock and no reason. The `!shell` branch above only covers the viewer who
  // cannot see it at all (axis 1); this is axis 2, and it had no branch.
  const { circle, members, canEnter, entryReason } = shell
  if (!canEnter) {
    return (
      <div className="space-y-4">
        <p className="text-body-sm leading-relaxed text-muted">Talk with the people at {brandName}.</p>
        <CircleLocked
          reason={entryReason ?? 'closed'}
          circleSlug={circle.slug}
          // No root check: this page redirects a root Space away at the top, so the type is
          // already narrowed here and TS rejects the comparison outright.
          spaceSlug={space.slug}
          spaceName={brandName}
        />
      </div>
    )
  }
  const [myProfileId, caps, isCrew] = await Promise.all([
    getMyProfileId(),
    circleCapabilities(circle.id),
    viewerProfileId ? isPaidViewer() : Promise.resolve(false),
  ])
  const isMember = !!myProfileId && members.some((m) => m.profile.id === myProfileId)
  const weekAgo = isoDaysAgo(7)
  const justJoined =
    isMember && members.some((m) => m.profile.id === myProfileId && m.joined_at >= weekAgo)

  setCircleContext({
    circle,
    members,
    myProfileId,
    isMember,
    isHost: !!myProfileId && circle.host?.id === myProfileId,
    isCrew,
    justJoined,
    canManage: caps.has('circle.editSettings'),
    showsHealth: false,
    insightLabel: null,
    circleEarnedZaps: 0,
    activeStreaks: 0,
    newThisWeek: 0,
    circlePractice: null,
  })

  return (
    <div className="space-y-4">
      <p className="text-body-sm leading-relaxed text-muted">
        Talk with the people at {brandName}. Comments sit under each post.
      </p>
      <div id="space-discussion" className="scroll-mt-24">
        <CircleFeed />
      </div>
    </div>
  )
}
