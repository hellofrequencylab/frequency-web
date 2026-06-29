import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle, joinCircle } from '../actions'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { EditCircleButton } from '@/components/circles/edit-circle-button'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { isPaidViewer, surfaceAccess } from '@/lib/core/viewer-hats'
import { insightAffordance } from '@/lib/core/scoped-surface-ui'
import { getCircleActivePractice, listPublicPractices } from '@/lib/practices'
import { listPublicPlans } from '@/lib/journey-plans'
import { DetailTemplate } from '@/components/templates/detail-template'
import { isoDaysAgo } from '@/lib/utils'
import { getCircleEarnedZaps } from '@/lib/circles/earned'
import { SITE_NAME } from '@/lib/site'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { CircleCover } from '@/components/circles/circle-cover'
// The circle BODY (feed + info-rail) is now the page-settings module engine (ADR-270/294): the
// page resolves all the per-viewer data once, stamps it into the request-scoped circle context,
// and <PageModules> renders the arrangeable blocks (components/widgets/circles/*) — so operators
// arrange the circle page from Settings → Layout, shared across every /circles/<slug> via the
// '/circles/*' scope, exactly like the Practices detail page.
import { PageModules } from '@/components/widgets/page-modules'
import { setCircleContext } from '@/lib/circles/active-circle'
import { circleTextOverride, resolveCircleText } from '@/lib/circles/circle-text'
import type { CircleDetail, MemberRow } from '@/lib/circles/detail-types'

// ── Anonymous share-card metadata (logged-in link unfurls; correct-by-construction
// for any future anon carve). Admin client only — no auth round-trip — reading just
// the card fields, with the same archived filter the page body applies.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: c } = await admin
    .from('circles')
    .select('name, about, city, image_url')
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()
  if (!c) return { title: 'Circle not found' }
  const circle = c as {
    name: string
    about: string | null
    city: string | null
    image_url: string | null
  }

  const where = circle.city ? ` in ${circle.city}` : ''
  const full =
    circle.about ??
    `${circle.name} is a Frequency circle${where}. Join to meet your neighbors and show up in person.`
  // Search snippets truncate around 155 chars — keep the meta description tight
  // (matches the discover detail pages).
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${circle.name} · ${SITE_NAME}`
  const coverUrl = circle.image_url

  return {
    title: circle.name,
    description,
    openGraph: {
      title: ogTitle,
      description,
      ...(coverUrl ? { images: [{ url: coverUrl }] } : {}),
    },
    twitter: {
      card: coverUrl ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description,
    },
  }
}

export default async function CirclePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: rawCircle } = await admin
    .from('circles')
    .select(
      `id, name, slug, about, image_url, type, member_count, member_cap, status, is_demo, resonance_public,
       latitude, longitude, neighborhood, city, sidebar_order,
       host:profiles!host_id ( id, display_name, handle, avatar_url ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id (
           id, name, slug,
           outpost:outposts!outpost_id (
             id, name,
             region:nexus_regions!region_id ( name )
           )
         )
       )`
    )
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()

  if (!rawCircle) notFound()
  const circle = rawCircle as unknown as CircleDetail

  // Fetch members
  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, membership_tier, current_season_rank, current_streak, achievement_count )`
    )
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Member ids — used below for the circle's engagement signals (only read for a viewer
  // who can see the health panel).
  const memberProfileIds = members.map((m) => m.profile?.id).filter(Boolean)

  // Current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isMember = false
  let isHost = false
  let isCrew = false

  // Four independent reads — the viewer's profile, paid-viewer status, this circle's inline-admin
  // capabilities, and scoped Insight access — fetched together instead of in series (site audit
  // 2026-06-18). The profile/paid checks only run for a signed-in viewer; caps + Insight are
  // viewer-aware internally and resolve to "none" for a visitor, so they're always safe to ask.
  const [myProfile, isCrewResolved, caps, insightAccess] = await Promise.all([
    user
      ? admin.from('profiles').select('id, community_role').eq('auth_user_id', user.id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    user ? isPaidViewer() : Promise.resolve(false),
    // Inline-admin gating via the one capability resolver: host + janitors, plus
    // guides/mentors who lead this circle's hub/nexus (scope-aware).
    getCircleCapabilities(circle.id),
    // Scoped Insight surface (P1.6 adoption, ADR-225): ask the matrix the IN-SCOPE question, so a
    // steward who leads THIS circle by stewardship edge — even a global-member Host — gets the
    // circle's Insight view at the matrix-granted depth (Host ⇒ limited basic view; a Guide/Mentor
    // who leads the parent ⇒ full). Additive: a non-leader resolves `none` and stays hidden.
    surfaceAccess('insight', { type: 'circle', id: circle.id }),
  ])
  if (myProfile) {
    myProfileId = myProfile.id
    isMember = members.some((m) => m.profile.id === myProfileId)
    isHost = circle.host?.id === myProfileId
    isCrew = isCrewResolved
  }
  const canManage = caps.has('circle.editSettings')
  // The health rail below lights for managers (capability) OR in-scope Insight.
  const insight = insightAffordance(insightAccess)
  const showsHealth = canManage || insight.visible

  // Circle health — honest, circle-scoped signals only. "Zaps earned here" is what was
  // earned THROUGH this circle (its practice logs + Expression-at-Circle), never members'
  // personal season totals; streaks + new-this-week are the circle's own member activity.
  // All gated behind showsHealth so non-managers never trigger the reads.
  let circleEarnedZaps = 0
  let activeStreaks = 0
  let newThisWeek = 0
  if (showsHealth) {
    const [earned, { data: streakRows }, { data: recentJoins }] = await Promise.all([
      getCircleEarnedZaps(circle.id),
      memberProfileIds.length > 0
        ? admin.from('profiles').select('current_streak').in('id', memberProfileIds)
        : Promise.resolve({ data: [] as { current_streak: number | null }[] }),
      admin
        .from('memberships')
        .select('id')
        .eq('circle_id', circle.id)
        .eq('status', 'active')
        .gte('joined_at', isoDaysAgo(7)),
    ])
    circleEarnedZaps = earned
    activeStreaks = ((streakRows ?? []) as { current_streak: number | null }[]).filter(
      (p) => (p.current_streak ?? 0) > 0,
    ).length
    newThisWeek = recentJoins?.length ?? 0
  }

  // This week's practice (host-assigned). Library only needed for the host picker.
  const [circlePractice, practiceLibrary] = await Promise.all([
    getCircleActivePractice(circle.id),
    canManage || circle.is_demo ? listPublicPractices() : Promise.resolve([]),
  ])

  // Sort: host first → by join date
  const sorted = [...members].sort((a, b) => {
    const aHost = circle.host?.id === a.profile.id ? 0 : 1
    const bHost = circle.host?.id === b.profile.id ? 0 : 1
    if (aHost !== bHost) return aHost - bHost
    return 0
  })

  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap

  // Header status pill: forming → green, active → blue, full/closed → red.
  const statusPill = full
    ? { label: 'Full', cls: 'bg-danger-bg text-danger' }
    : circle.status === 'forming'
      ? { label: 'Forming', cls: 'bg-success-bg text-success' }
      : circle.status === 'active'
        ? { label: 'Active', cls: 'bg-info-bg text-info' }
        : { label: circle.status === 'archived' ? 'Closed' : 'Inactive', cls: 'bg-danger-bg text-danger' }

  const typeLabel = String(circle.type)
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  // Journeys the host can start a run of (ADR-252) — only loaded for a manager (the
  // journey-run block self-gates to managers, so a visitor never triggers this read).
  const runnableJourneys = canManage
    ? (await listPublicPlans()).slice(0, 50).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        emoji: p.emoji ?? null,
      }))
    : []

  // The movable Page-text block's copy: this circle's override, else the network default ('' when
  // neither is set → the block renders nothing). One platform_settings read (request-memoized) only
  // when there's no per-circle override.
  const layoutText = await resolveCircleText(circleTextOverride(circle.sidebar_order))

  // Stamp the resolved per-viewer context into the request-scoped holder so the circle's body
  // modules (components/widgets/circles/*) read it without prop-drilling — then <PageModules>
  // renders them in the operator-arranged layout (default: feed in MAIN, info-rail in SIDE).
  setCircleContext({
    circle,
    members: sorted,
    myProfileId,
    isMember,
    isHost,
    isCrew,
    canManage,
    showsHealth,
    insightLabel: insight.visible ? insight.label : null,
    circleEarnedZaps,
    activeStreaks,
    newThisWeek,
    circlePractice,
    runnableJourneys,
    layoutText,
  })

  return (
    <div>
      {/* Demo circles invite a real member to claim + host them in place. */}
      {circle.is_demo && user && (
        <ClaimCircle
          circleId={circle.id}
          name={circle.name}
          about={circle.about}
          practices={practiceLibrary.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      <CircleCover imageUrl={circle.image_url} name={circle.name} />

      {/* Unified Detail header: title + status/type badges, member/host + capacity
          below, capability-gated actions right. Editing is in the Settings panel. */}
      <DetailTemplate
        title={circle.name}
        badges={
          <>
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${statusPill.cls}`}>
              {statusPill.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-signal-bg text-signal-strong font-medium">
              {typeLabel}
            </span>
            {nearCap && !full && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-medium">
                Almost full
              </span>
            )}
          </>
        }
        subtitle={
          <>
            {/* Place-first context: the locale, then the Hub this circle belongs to.
                Hubs/Nexuses surface here as the emergent "where this sits", never as
                primary nav — a member reads it as place, not an org chart (IA §3a/§4). */}
            {circle.hub && (
              <div className="mb-1.5 flex items-center gap-1.5 text-sm text-subtle">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {circle.hub.nexus?.outpost?.name && <>{circle.hub.nexus.outpost.name} · </>}
                  <Link href={`/hubs/${circle.hub.slug}`} className="hover:text-primary-strong hover:underline">
                    {circle.hub.name}
                  </Link>
                </span>
              </div>
            )}
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {circle.member_count} of {circle.member_cap} members
              </span>
              {circle.host && (
                <span>
                  Host{' '}
                  <Link
                    href={`/people/${circle.host.handle}`}
                    className="text-primary-strong hover:underline font-medium"
                  >
                    {circle.host.display_name}
                  </Link>
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 max-w-xs rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${full ? 'bg-danger' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        }
        actions={
          <>
            {canManage && <CircleHostMenu circleId={circle.id} />}

            {canManage && <EditCircleButton />}

            {isMember && !isHost && (
              <form action={leaveCircle.bind(null, circle.id)}>
                <button
                  type="submit"
                  className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:text-danger hover:border-danger transition-colors"
                >
                  Leave
                </button>
              </form>
            )}

            {!isMember && myProfileId && !full && (
              <CrewGateButton
                isCrew={isCrew}
                label="Join circle"
                buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                <form action={joinCircle.bind(null, circle.id, circle.slug)}>
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
                  >
                    Join circle
                  </button>
                </form>
              </CrewGateButton>
            )}

            {!isMember && myProfileId && full && (
              <span className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-subtle cursor-not-allowed">
                Circle full
              </span>
            )}
          </>
        }
      >
        {/* ── About (boxless, collapsible) — part of the fixed identity, above the body. */}
        {circle.about && (
          <div className="mb-6">
            <CollapsibleAbout text={circle.about} />
          </div>
        )}

        {/* ── The arrangeable body: feed + info-rail as layout modules, shared across every
                /circles/<slug> via the '/circles/*' scope (default: feed MAIN, rail SIDE).
                Operators rearrange it from Settings → Layout. */}
        <PageModules route={`/circles/${circle.slug}`} />
      </DetailTemplate>
    </div>
  )
}
