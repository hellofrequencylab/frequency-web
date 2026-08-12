import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getMyProfileId } from '@/lib/auth'
import { isPaidViewer, surfaceAccess } from '@/lib/core/viewer-hats'
import { insightAffordance } from '@/lib/core/scoped-surface-ui'
import { getCircleActivePractice } from '@/lib/practices'
import { listPublicPlans } from '@/lib/journey-plans'
import { isoDaysAgo } from '@/lib/utils'
import { getCircleHealth } from '@/lib/circles/earned'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { SITE_NAME } from '@/lib/site'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
// The circle BODY (feed + info-rail) is the page-settings module engine (ADR-270/294): this tab
// resolves all the per-viewer data once, stamps it into the request-scoped circle context, and
// <PageModules> renders the arrangeable blocks (components/widgets/circles/*) — so operators
// arrange the circle page from Settings → Layout, shared across every /circles/<slug> via the
// '/circles/*' scope, exactly like the Practices detail page.
import { PageModules } from '@/components/widgets/page-modules'
import { setCircleContext } from '@/lib/circles/active-circle'
import { circleTextOverride, resolveCircleText } from '@/lib/circles/circle-text'

// ── THE HOME TAB ────────────────────────────────────────────────────────────────────────────────
// A BODY, not a shell. The identity — cover, title, badges, facts, capacity bar, tabs — belongs to
// the route-segment layout beside this file, which owns the single page <h1>. Composing a template
// here would emit a second one and trip `check:headers`; the shell is already composed above us
// (`check:templates` calls that the ancestor-layout form, and names this exact tree as its
// precedent).

// ── Anonymous share-card metadata (logged-in link unfurls; correct-by-construction
// for any future anon carve). Reads the SAME request-memoized shell load the page body uses, so the
// card costs no extra query, with the same archived filter the body applies.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const shell = await loadCircleShell(slug)
  if (!shell) return { title: 'Circle not found' }
  const circle = shell.circle

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

export default async function CircleHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The same memoized load the shell above already made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, members } = shell

  // Member ids — used below for the circle's engagement signals (only read for a viewer
  // who can see the health panel).
  const memberProfileIds = members.map((m) => m.profile?.id).filter(Boolean)

  // Three independent, request-cached reads — the viewer's profile id, this circle's inline-admin
  // capabilities, and scoped Insight access — fetched together instead of in series (site audit
  // 2026-06-18). Caps + Insight are viewer-aware internally and resolve to "none" for a visitor, so
  // they're always safe to ask.
  const [myProfileId, caps, insightAccess] = await Promise.all([
    getMyProfileId(),
    // Inline-admin gating via the one capability resolver: host + janitors, plus
    // guides/mentors who lead this circle's hub/nexus (scope-aware).
    circleCapabilities(circle.id),
    // Scoped Insight surface (P1.6 adoption, ADR-225): ask the matrix the IN-SCOPE question, so a
    // steward who leads THIS circle by stewardship edge — even a global-member Host — gets the
    // circle's Insight view at the matrix-granted depth (Host ⇒ limited basic view; a Guide/Mentor
    // who leads the parent ⇒ full). Additive: a non-leader resolves `none` and stays hidden.
    surfaceAccess('insight', { type: 'circle', id: circle.id }),
  ])

  const isMember = !!myProfileId && members.some((m) => m.profile.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId
  const isCrew = myProfileId ? await isPaidViewer() : false

  // First-visit signal: the viewer is a member whose own membership is brand-new (joined within the
  // last week). Read straight off the member rows the shell already loaded — no extra round trip — so
  // a just-joined member gets a warm "welcome" nudge in the feed instead of an empty room.
  const weekAgo = isoDaysAgo(7)
  const justJoined =
    isMember && members.some((m) => m.profile.id === myProfileId && m.joined_at >= weekAgo)

  const canManage = caps.has('circle.editSettings')
  // The health rail below lights for managers (capability) OR in-scope Insight.
  const insight = insightAffordance(insightAccess)
  const showsHealth = canManage || insight.visible

  // Circle health — honest, circle-scoped signals only. "Zaps earned here" is what was
  // earned THROUGH this circle (its practice logs + Expression-at-Circle), never members'
  // personal season totals; streaks + new-this-week are the circle's own member activity.
  // All gated behind showsHealth so non-managers never trigger the reads.
  const health = showsHealth
    ? await getCircleHealth(circle.id, memberProfileIds, isoDaysAgo(7))
    : { earnedZaps: 0, activeStreaks: 0, newThisWeek: 0 }

  // This week's practice (host-assigned). The practice LIBRARY is no longer read here: the only
  // consumer was the demo-claim card, which now lives in the shell layout with the rest of the
  // identity-level notices, so this tab stopped paying for a list it never rendered.
  const circlePractice = await getCircleActivePractice(circle.id)

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
    members,
    myProfileId,
    isMember,
    isHost,
    isCrew,
    justJoined,
    canManage,
    showsHealth,
    insightLabel: insight.visible ? insight.label : null,
    circleEarnedZaps: health.earnedZaps,
    activeStreaks: health.activeStreaks,
    newThisWeek: health.newThisWeek,
    circlePractice,
    runnableJourneys,
    layoutText,
  })

  return (
    <>
      {/* ── About (boxless, collapsible) — part of the fixed identity, above the body. It stays on
              the Home tab rather than in the shell: a roster does not want the circle's story
              repeated above it. */}
      {circle.about && (
        <div className="mb-6">
          <CollapsibleAbout text={circle.about} />
        </div>
      )}

      {/* ── The arrangeable body: feed + info-rail as layout modules, shared across every
              /circles/<slug> via the '/circles/*' scope (default: feed MAIN, rail SIDE).
              Operators rearrange it from Settings → Layout. */}
      <PageModules route={`/circles/${circle.slug}`} />
    </>
  )
}
