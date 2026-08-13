import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getMyProfileId } from '@/lib/auth'
import { isPaidViewer, surfaceAccess } from '@/lib/core/viewer-hats'
import { insightAffordance } from '@/lib/core/scoped-surface-ui'
import { isoDaysAgo } from '@/lib/utils'
import { loadCirclePractice } from './tab-facts'
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

// ── THE FEED TAB (the default tab) ──────────────────────────────────────────────────────────────
// A BODY, not a shell. The identity — cover, title, badges, facts, tabs — belongs to the
// route-segment layout beside this file, which owns the single page <h1>. Composing a template
// here would emit a second one and trip `check:headers`; the shell is already composed above us
// (`check:templates` calls that the ancestor-layout form, and names this exact tree as its
// precedent).
//
// FEED IS THE DEFAULT TAB AND IT CARRIES THE REASON PEOPLE CAME (owner ruling, 2026-08-12), so it
// keeps the operator-arranged body.
//
// ⚠️ THE SUBSET SHRANK ON 2026-08-13, ON THE OWNER'S INSTRUCTION. The 2026-08-12 version pulled
// FOUR blocks off this tab on the argument that a block with a tab of its own would be read twice.
// The owner overruled two of them by name: *"Put the member list back in the right column on the
// main page"* and *"Put Events in the right column on the main"*. A rail box and a tab are not the
// same affordance — the box is the next thing / who is here, the tab is the full list you go and
// browse — so both render, and `circle-events` and `circle-members` are back in the set.
//
// `circle-momentum` came OUT in the same pass and for the opposite reason: it moved to the Circle
// Stats tab (*"Bring back Momentum blocks and put them in the leaderboard"*), so leaving it here
// WOULD put the same four numbers on the page twice.
//
// THE SUBSET IS PASSED AS `moduleIds`, which is PageModules' documented override for exactly this
// ("Override the route's module set"), and it is the caller-side version of what
// `moduleIdsForScope` does per route in lib/widgets/modules.ts. The blocks are NOT deleted: they
// stay registered and every one of them still renders, just on the tab that owns it. See the note
// in the report about folding these sets into the route-scoped registry, which is where they
// belong once the tab routes are known to lib/widgets.

// ── Anonymous share-card metadata (logged-in link unfurls; correct-by-construction
// for any future anon carve). Reads the SAME request-memoized shell load the page body uses, so the
// card costs no extra query, with the same archived filter the body applies.
// The Feed tab's module set. Order here does not decide layout; the saved '/circles/*' layout
// still does, and this only filters what it may place. `circle-momentum` is the one deliberate
// omission — it renders on the Circle Stats tab instead.
const FEED_TAB_MODULE_IDS = [
  'circle-feed',
  'circle-health',
  'circle-challenges',
  'circle-map',
  'circle-meeting',
  'circle-members',
  'circle-events',
  'circle-practice',
  'circle-invite',
  'circle-text',
] as const

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

  // This week's practice, from the memoized loader the shell already used to decide whether the
  // Practice tab exists — a memo hit, not a second query. It stays on the context because the
  // context type carries it; the block that renders it now lives on the Practice tab.
  const circlePractice = await loadCirclePractice(circle.id)

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

      {/* ── The arrangeable body: the feed + the info-rail blocks that did not become tabs, shared
              across every /circles/<slug> via the '/circles/*' scope. Operators rearrange it from
              Settings → Layout.

              `#circle-post` is the header's ONE primary action for a member. The composer is the
              first thing in the feed block, so the anchor lands on it from any tab. */}
      <div id="circle-post" className="scroll-mt-24">
        <PageModules route={`/circles/${circle.slug}`} moduleIds={FEED_TAB_MODULE_IDS} />
      </div>
    </>
  )
}
