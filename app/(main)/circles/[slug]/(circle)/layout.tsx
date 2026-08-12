import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EyeOff, MapPin, PenLine } from 'lucide-react'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { leaveCircle } from '../../actions'
import { JoinCircleButton } from '@/components/circles/join-circle-button'
import { CircleHandoffBanner } from '@/components/circles/circle-handoff-banner'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { DetailTemplate } from '@/components/templates'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { buttonClasses } from '@/components/ui/button'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { loadCircleShell } from '@/lib/circles/store'
import { circleTabs } from '@/lib/circles/tabs'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { listPublicPractices } from '@/lib/practices'
import { circleEventInsider, loadCircleContentFacts } from './tab-facts'

// ── THE CIRCLE DETAIL SHELL (PAGE-FRAMEWORK §3, "How templates map to Next.js") ──────────────────
//
// A Detail page IS a route-segment layout: the context header + tabs live here, the tab bodies slot
// in as `children`. Navigating between tabs preserves this header (partial rendering) instead of
// repainting it.
//
// WHY A ROUTE GROUP. `manage/`, `settings/`, `edit/` and `crm/` are SIBLINGS of `(circle)/`, outside
// the group, so they never inherit this chrome. That is the shape app/(main)/spaces/[slug]/(profile)
// /layout.tsx settled on, and for the reason recorded there: the alternative — one shared layout
// that branches on the request path — is invalid in the App Router, because a layout does not
// re-render across its child segments and its output is cached per instance. A prefetch of an owner
// sub-route would poison the header for the profile itself.
//
// WHY THE TAB STRIP IS A CLIENT LEAF. Same cause, different symptom: this layout renders ONCE for
// the whole tab group, so a server-computed `active` tab would freeze on whichever tab you landed
// on first. <UnderlineTabs> resolves it from usePathname, the only signal that stays true across
// soft navigation. It is the smallest client boundary on the page; everything else here is a Server
// Component. The strip is a <nav> of real links carrying aria-current="page" — these tabs are
// ROUTES, so they must never wear ARIA tab/tablist roles (the most common bug in this pattern).
//
// WHY THE RAIL IS UNTOUCHED. Nothing is registered in lib/layout/page-chrome.ts for this route and
// nothing should be: FOCUS_NONE_PREFIXES / SCOPED_PREFIXES / SCOPED_PATTERNS are empty on purpose
// (owner directive 2026-06-20, reaffirmed 2026-07-28 after the Channel 'scoped' experiment was
// reversed the same night), so /circles/<slug> and every tab under it keep the 'global' community
// rail. The circle ADMIN rail also needs no edit: adminScopeFor matches /^\/circles\/([^/]+)/ as a
// PREFIX, so a tab route resolves to the same circle scope its parent does (locked by
// lib/layout/page-chrome.test.ts).
//
// ── THE HEADER, REBUILT ON THE TEMPLATE'S OWN SLOTS (owner ruling, 2026-08-12) ───────────────────
//
// THE BUG WAS ONE PROP. This layout used to hand DetailTemplate a `band`, and `band` is documented
// to REPLACE the template's identity lockup wholesale (detail-template.tsx:136). That lockup is
// `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between` — the only rule in the kit
// that pushes actions to the right-hand side. Passing `band` opted the Circle out of it, so every
// last thing (host tools, chips, place, host, capacity bar) stacked down the left margin and the
// `title` prop was accepted and then silently ignored. The page had a title it never rendered.
//
// So the band is gone and the four real slots do the work:
//
//   1. TITLE      — the template owns the single page <h1>. Nothing else on this page emits one.
//   2. SUBTITLE   — the quiet identity lines: where it meets and how full it is, who hosts it, and
//                   the Hub it sits inside. Place first, hierarchy last: a member reads a Hub as
//                   "where this sits", never as an org chart (IA §3a/§4).
//   3. BADGES     — status and mode, on the kit's <Badge> primitive rather than a hand-rolled pill.
//   4. ACTIONS    — EXACTLY ONE primary (Polaris: one primary, at most three secondary). Join for
//                   someone who is not in yet; Post for someone who is. The old header had Join on
//                   the cover AND Create/Edit/Manage in the band, which is four primaries and no
//                   answer to "what do I do here". Leave stays as the single secondary, because it
//                   is the only place a member can leave a Circle from.
//
// HOST ACTIONS ARE NOT HERE, ON PURPOSE. Edit / Manage / the host menu moved to the admin rail. No
// host action goes in this header and there is no overflow menu: an operator affordance in the
// member's identity band is what made the header unreadable in the first place.
//
// NO BACK LINK. The app shell already draws the breadcrumb, and breadcrumbs are hierarchy while
// back links are history. A page showing both reads as a page that does not know where it is
// (NN/g). The breadcrumb stays; DetailTemplate's `back` slot is deliberately unused.
//
// THE COVER is DetailTemplate's own `coverImage` (PAGE-FRAMEWORK §8.5, "The standard Detail
// cover"): the 16:6 crop, or the neutral token gradient when a Circle has no photo yet. It carries
// no copy, which is what lets the identity lockup below it be the one heading on the page.
//
// ── SPEED (PAGE-FRAMEWORK §5) ────────────────────────────────────────────────────────────────────
// This file used to run FOUR serial awaits before it returned any JSX, which is §5.3's named
// anti-pattern: nothing can stream until the last one lands. It is now two rounds, and the second
// is a single Promise.all:
//   round 1 — the Circle itself + the viewer's profile id (both request-memoized).
//   round 2 — capabilities, the viewer's Crew hat, and the three tab-content facts, in parallel.
// Everything that is not identity streams behind its own <Suspense>: the demo-claim card (which
// reads the whole practice library) and the tab body below, whose skeleton lives in loading.tsx.
// The tab-content facts stay INLINE and are the one deliberate exception: the strip is navigation,
// and navigation that pops in after the page paints moves the content under the reader's cursor.
// They are three light reads that overlap with the capability resolution, and each one is memoized
// for the tab body that renders next, so the strip costs the page no extra round trip.

export default async function CircleDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Round 1. The circle + roster and the viewer, request-memoized: the tab page under `children`
  // calls the same loaders and gets memo hits, so the shell costs no extra reads.
  const [shell, myProfileId] = await Promise.all([loadCircleShell(slug), getMyProfileId()])
  if (!shell) notFound()
  const { circle, members } = shell

  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId

  // Round 2. Four independent reads in one batch. `user` gates the signed-in-only banners, caps
  // drives the manager rules, isPaidViewer feeds the Crew gate on Join, and the content facts
  // decide which tabs exist at all.
  const [user, caps, isCrew, content] = await Promise.all([
    getCachedUser(),
    // Request-memoized, so the tab page under `children` asking the same question is a memo hit
    // rather than a second capability resolution (lib/circles/detail-access.ts).
    circleCapabilities(circle.id),
    myProfileId ? isPaidViewer() : Promise.resolve(false),
    // `insider` keys the memoized events read, and it is derived from the roster (not from caps)
    // so the Events tab can derive the SAME key and hit the memo. See circleEventInsider.
    loadCircleContentFacts(circle.id, circleEventInsider({ isMember, isHost })),
  ])

  const canManage = caps.has('circle.editSettings')
  // Draft circles are private to their managers (ADR starter-circles draft status): a draft is a
  // not-yet-published circle only its host/stewards (and staff) may see, so it can be built up
  // before it goes live. Anyone else gets a 404 by direct link, exactly as if it did not exist —
  // and it is already excluded from every discovery surface (index, /discover, sitemap RPC). The
  // gate lives HERE so it covers every tab beneath the shell, not just the Feed one.
  const isDraft = circle.status === 'draft'
  if (isDraft && !canManage) notFound()

  const full = circle.member_count >= circle.member_cap
  const nearCap = circle.member_count >= circle.member_cap * 0.9

  // Status badge: draft → neutral, forming → success, active → primary, full/closed → danger.
  const status: { label: string; tone: BadgeTone } = isDraft
    ? { label: 'Draft', tone: 'neutral' }
    : full
      ? { label: 'Full', tone: 'danger' }
      : circle.status === 'forming'
        ? { label: 'Forming', tone: 'success' }
        : circle.status === 'active'
          ? { label: 'Active', tone: 'primary' }
          : { label: circle.status === 'archived' ? 'Closed' : 'Inactive', tone: 'danger' }

  const typeLabel = String(circle.type)
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const place = [circle.neighborhood, circle.city].filter(Boolean).join(', ')

  // Which tabs this Circle has earned. Pure + unit-tested in lib/circles/tabs.ts.
  const tabs = circleTabs({
    slug: circle.slug,
    memberCount: members.length,
    canManage,
    isMember,
    ...content,
  })

  // The ONE primary action, resolved to a single answer per viewer. A member's is Post: it lands on
  // the Feed tab at the composer, which is the thing a Circle is for. Everyone else's is Join.
  const canJoin = !isMember && !!myProfileId && !full && !isDraft
  const primary = isMember || isHost ? 'post' : canJoin ? 'join' : 'none'

  return (
    <div>
      {/* Draft notice: only a manager ever reaches this page while the circle is a draft (everyone
          else 404s above), so this line reassures the owner it is private until they publish. */}
      {isDraft && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-bg/50 px-4 py-3">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div className="text-body-sm">
            <p className="font-semibold text-text">This circle is in draft</p>
            <p className="mt-0.5 text-muted">
              Only you can see it. It stays off the Circles directory, map, and search until you set the
              status to Active in the settings panel.
            </p>
          </div>
        </div>
      )}

      {/* A pending handoff, shown ONLY to the person it was offered to (ADR-845). Self-fetching,
          so it costs this page no read and renders nothing for everyone else. */}
      {user && <div className="mb-4"><CircleHandoffBanner circleId={circle.id} /></div>}

      {/* Demo circles invite a real member to claim + host them in place. The card needs the whole
          practice library for its picker, so it streams: the header never waits on it. */}
      {circle.is_demo && user && (
        <Suspense fallback={null}>
          <DemoClaimCard circleId={circle.id} name={circle.name} about={circle.about} />
        </Suspense>
      )}

      <DetailTemplate
        coverImage={circle.image_url ?? null}
        title={circle.name}
        badges={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone="signal">{typeLabel}</Badge>
            {nearCap && !full && <Badge tone="warning">Almost full</Badge>}
          </>
        }
        subtitle={
          <div className="space-y-0.5">
            <p>
              {place && <>{place} · </>}
              <span className="font-semibold text-text">
                {circle.member_count} of {circle.member_cap} members
              </span>
            </p>
            {circle.host && (
              <p>
                Hosted by{' '}
                <Link
                  href={`/people/${circle.host.handle}`}
                  className="font-medium text-primary-strong hover:underline"
                >
                  {circle.host.display_name}
                </Link>
              </p>
            )}
            {/* Place-first context: the Hub this circle belongs to. Hubs/Nexuses surface here as the
                emergent "where this sits", never as primary nav (IA §3a/§4). */}
            {circle.hub && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">
                  {circle.hub.nexus?.outpost?.name && <>{circle.hub.nexus.outpost.name} · </>}
                  <Link href={`/hubs/${circle.hub.slug}`} className="hover:text-primary-strong hover:underline">
                    {circle.hub.name}
                  </Link>
                </span>
              </p>
            )}
          </div>
        }
        actions={
          <>
            {primary === 'post' && (
              <Link href={`/circles/${circle.slug}#circle-post`} className={buttonClasses('primary')}>
                <PenLine className="h-4 w-4" aria-hidden />
                Post
              </Link>
            )}

            {primary === 'join' && (
              <CrewGateButton isCrew={isCrew} label="Join Circle" buttonClassName={buttonClasses('primary')}>
                <JoinCircleButton
                  circleId={circle.id}
                  circleSlug={circle.slug}
                  label="Join Circle"
                  className={buttonClasses('primary')}
                />
              </CrewGateButton>
            )}

            {/* The one secondary. Leaving is only possible from here, so it cannot move to the
                admin rail with the host tools. A host does not get it: they hand the Circle over
                (ADR-845) rather than walking out of it. */}
            {isMember && !isHost && (
              <form action={leaveCircle.bind(null, circle.id)}>
                <button type="submit" className={buttonClasses('secondary')}>
                  Leave
                </button>
              </form>
            )}
          </>
        }
        tabs={tabs.length > 0 ? <UnderlineTabs tabs={tabs} label="Circle sections" /> : undefined}
      >
        {children}
      </DetailTemplate>
    </div>
  )
}

// The demo-claim card's practice picker needs the whole public practice library. Only a claimable
// demo circle seen by a signed-in viewer ever pays for that read, and now it pays for it BEHIND a
// Suspense boundary instead of in front of the header (PAGE-FRAMEWORK §5.3).
async function DemoClaimCard({
  circleId,
  name,
  about,
}: {
  circleId: string
  name: string
  about: string | null
}) {
  const practices = await listPublicPractices()
  return (
    <ClaimCircle
      circleId={circleId}
      name={name}
      about={about}
      practices={practices.map((p) => ({ id: p.id, title: p.title }))}
    />
  )
}
