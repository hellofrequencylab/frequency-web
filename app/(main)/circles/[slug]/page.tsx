import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, MapPin, Settings, EyeOff, LayoutDashboard } from 'lucide-react'
import { ProgressTrack } from '@/components/ui/progress-track'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle } from '../actions'
import { JoinCircleButton } from '@/components/circles/join-circle-button'
import { CircleHandoffBanner } from '@/components/circles/circle-handoff-banner'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { isPaidViewer, surfaceAccess } from '@/lib/core/viewer-hats'
import { insightAffordance } from '@/lib/core/scoped-surface-ui'
import { getCircleActivePractice, listPublicPractices } from '@/lib/practices'
import { listPublicPlans } from '@/lib/journey-plans'
import { DetailTemplate, PageHero, HERO_ACTION_CLASS } from '@/components/templates'
import { resolveHeaderElement } from '@/lib/elements/header'
import { isoDaysAgo } from '@/lib/utils'
import { getCircleEarnedZaps } from '@/lib/circles/earned'
import { readCircleCoverFocus, readCircleHeroHeight, hasCircleHeroHeight } from '@/lib/circles/hero'
import { SITE_NAME } from '@/lib/site'
import { ClaimCircle } from '@/components/circles/claim-circle'
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
       latitude, longitude, neighborhood, city, sidebar_order, theme,
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
  // The saved header settings (circles.theme, the ADR-886 pattern applied to Circles). The column
  // is newer than the generated types and CircleDetail, so it is read off the raw row through the
  // ADR-246 seam. An untouched circle resolves to the centered default and NO explicit height,
  // which is exactly today's render.
  //
  // savedHeroHeight is deliberately null-unless-chosen rather than always a value: the header
  // ELEMENT config (resolveHeaderElement, ADR-793) also has an opinion about height, and it should
  // keep deciding for every circle no host has tuned. Once a host picks one, theirs wins.
  const circleTheme = (rawCircle as unknown as { theme?: unknown }).theme
  const circleCoverFocus = readCircleCoverFocus(circleTheme)
  const savedHeroHeight = hasCircleHeroHeight(circleTheme) ? readCircleHeroHeight(circleTheme) : null

  // The members read (needs circle.id) and the viewer's session (needs nothing) are independent,
  // so fetch them together instead of letting auth.getUser() wait behind the members read.
  const [{ data: rawMembers }, { data: { user } }] = await Promise.all([
    admin
      .from('memberships')
      .select(
        `id, volunteer_role, joined_at,
         profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, membership_tier, current_season_rank, current_streak, achievement_count )`
      )
      .eq('circle_id', circle.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true }),
    supabase.auth.getUser(),
  ])

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Member ids — used below for the circle's engagement signals (only read for a viewer
  // who can see the health panel).
  const memberProfileIds = members.map((m) => m.profile?.id).filter(Boolean)

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
  // First-visit signal: the viewer is a member whose own membership is brand-new (joined within the
  // last week). Read straight off the member rows the page already loaded — no extra round trip — so
  // a just-joined member gets a warm "welcome" nudge in the feed instead of an empty room.
  const weekAgo = isoDaysAgo(7)
  const justJoined =
    isMember &&
    members.some((m) => m.profile.id === myProfileId && m.joined_at >= weekAgo)

  const canManage = caps.has('circle.editSettings')
  // Draft circles are private to their managers (ADR starter-circles draft status): a draft is a
  // not-yet-published circle only its host/stewards (and staff) may see, so it can be built up
  // before it goes live. Anyone else gets a 404 by direct link, exactly as if it did not exist —
  // and it is already excluded from every discovery surface (index, /discover, sitemap RPC).
  const isDraft = circle.status === 'draft'
  if (isDraft && !canManage) notFound()
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

  // This week's practice (host-assigned) + the standardized header element config (ADR-793) —
  // independent reads, one concurrent batch. Library only needed for the host picker.
  const [circlePractice, practiceLibrary, header] = await Promise.all([
    getCircleActivePractice(circle.id),
    canManage || circle.is_demo ? listPublicPractices() : Promise.resolve([]),
    // The operator-tunable header (the Journey/Profile/Space idiom): identity layout at the
    // standard height unless an /admin/elements master (or Space override) retunes it.
    resolveHeaderElement({ defaults: { layout: 'identity', height: 'standard' } }),
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

  // Header status pill: draft → muted, forming → green, active → blue, full/closed → red.
  const statusPill = isDraft
    ? { label: 'Draft', cls: 'bg-surface-elevated text-subtle' }
    : full
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
    justJoined,
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

      {/* Demo circles invite a real member to claim + host them in place. */}
      {circle.is_demo && user && (
        <ClaimCircle
          circleId={circle.id}
          name={circle.name}
          about={circle.about}
          practices={practiceLibrary.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      {/* ── UNIFIED ENTITY HEADER (the events/Spaces grammar, ADR-793) ─────────────────────────
          Extracted rules, mirrored from the Space profile ((profile)/layout.tsx), the Journey page,
          and the person profile — the ONE header system every destination page now opens on:
            1. COVER: one immersive PageHero band as DetailTemplate's `hero` slot (rounded-3xl,
               border, min-height off the header element's size ladder), never a standalone cover
               card with the title stranded below it. No cover = the neutral token gradient.
            2. TUNABLE: layout/height/overlay resolve through resolveHeaderElement (identity/
               standard defaults, the entity-page idiom), so /admin/elements retunes it, no deploy.
            3. TITLE: the single h1 rides the cover, bottom-left, over the ink scrim (on-ink copy),
               with the uppercase accent eyebrow above it — the Space-page lockup.
            4. SUBTITLE: one quiet on-ink line on the cover (the place line here).
            5. ACTIONS: bottom-right ON the cover. ONE filled primary CTA (Join, the Space pattern:
               accent fill + lift-1 so it lifts off the photo); secondaries use the glassy
               on-ink HERO_ACTION_CLASS.
            6. ADMIN: never on the cover — Edit/host tools read as a light row in the `band`
               below the hero (the Journey/Profile placement).
            7. BAND: badge chips (rounded-pill), then icon fact rows (key fact semibold, the
               events subtitle idiom), then the capacity bar.
            8. BACK: DetailTemplate's `back` slot, above the band. Tabs stay in `tabs`. */}
      <DetailTemplate
        back={{ href: '/circles', label: 'Circles' }}
        title={circle.name}
        hero={
          <PageHero
            variant={header.layout}
            size={savedHeroHeight ?? header.height}
            overlayStyle={header.overlayStyle}
            coverImage={circle.image_url}
            coverFocus={circleCoverFocus}
            eyebrow="Circle"
            title={circle.name}
            subtitle={
              [circle.neighborhood, circle.city].filter(Boolean).join(', ') || undefined
            }
            actions={
              <>
                {isMember && !isHost && (
                  <form action={leaveCircle.bind(null, circle.id)}>
                    <button type="submit" className={HERO_ACTION_CLASS}>
                      Leave
                    </button>
                  </form>
                )}

                {!isMember && myProfileId && !full && (
                  <CrewGateButton
                    isCrew={isCrew}
                    label="Join"
                    buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 hover:bg-primary-hover transition-colors"
                  >
                    <JoinCircleButton
                      circleId={circle.id}
                      circleSlug={circle.slug}
                      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 hover:bg-primary-hover transition-colors"
                    />
                  </CrewGateButton>
                )}

                {!isMember && myProfileId && full && (
                  <span className="shrink-0 inline-flex items-center justify-center rounded-lg border border-on-ink/40 bg-on-ink/10 px-3 py-1.5 text-body-sm font-semibold text-on-ink/70 backdrop-blur-sm cursor-not-allowed">
                    Full
                  </span>
                )}
              </>
            }
          />
        }
        band={
          <div className="min-w-0 space-y-2">
            {/* Host/admin tools read as a normal light row BELOW the header (never riding the
                cover) — the Journey/Profile placement for the standardized admin affordances. */}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <CircleHostMenu circleId={circle.id} />
                <OpenAdminBarButton
                  scope={{ kind: 'circle', id: circle.id }}
                  caps={Array.from(caps)}
                  label="Edit"
                  icon={<Settings className="h-4 w-4" />}
                />
                <Link
                  href={`/circles/${circle.slug}/manage`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                >
                  <LayoutDashboard className="h-4 w-4 text-subtle" />
                  Manage
                </Link>
              </div>
            )}

            {/* Status / mode chips — the rounded-pill chip grammar the event + Journey bands use. */}
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-meta font-semibold ${statusPill.cls}`}>
                {statusPill.label}
              </span>
              <span className="inline-flex items-center rounded-pill bg-signal-bg px-2 py-0.5 text-meta font-medium text-signal-strong">
                {typeLabel}
              </span>
              {nearCap && !full && (
                <span className="inline-flex items-center rounded-pill bg-warning-bg px-2 py-0.5 text-meta font-medium text-warning">
                  Almost full
                </span>
              )}
            </span>

            {/* Place-first context: the locale, then the Hub this circle belongs to.
                Hubs/Nexuses surface here as the emergent "where this sits", never as
                primary nav — a member reads it as place, not an org chart (IA §3a/§4). */}
            {circle.hub && (
              <div className="flex items-center gap-1.5 text-body-sm text-subtle">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {circle.hub.nexus?.outpost?.name && <>{circle.hub.nexus.outpost.name} · </>}
                  <Link href={`/hubs/${circle.hub.slug}`} className="hover:text-primary-strong hover:underline">
                    {circle.hub.name}
                  </Link>
                </span>
              </div>
            )}

            {/* Fact row — the events-header idiom: icon rows, the key fact a step stronger. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary-strong shrink-0" />
                <span className="font-semibold text-text">
                  {circle.member_count} of {circle.member_cap} members
                </span>
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
            <ProgressTrack
              value={pct}
              tone={full ? 'danger' : 'primary'}
              track="border"
              animate
              className="mt-2 max-w-xs"
              label={`${circle.member_count} of ${circle.member_cap} seats taken`}
            />
          </div>
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
