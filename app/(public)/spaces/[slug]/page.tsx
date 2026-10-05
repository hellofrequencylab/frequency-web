import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DetailTemplate } from '@/components/templates'
import { SignInCta } from '@/components/discover/cards'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema, parseOpeningHours } from '@/lib/jsonld'
import { readProfileData } from '@/lib/spaces/profile-data'
import { getSpaceReviews } from '@/lib/spaces/content-data'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { readTagline } from '@/lib/spaces/tagline'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readCoverFocus } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { SpaceProfileMenuView } from '@/components/spaces/space-profile-menu-view'
import { buildPublicSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { SpaceFrontDoor } from '@/components/spaces/space-front-door'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

// Public share URL for a networked Space (SCAN-644 / ADR-1465). Auth during
// render is a dynamic API and would void ISR; signed-in members rewrite to
// /spaces/<slug>/full so follow, owner tools, and private Spaces stay on the
// existing profile. This file lives outside (main) so the share URL is not
// voided by that layout's cookies()/headers() or by getMyProfileId.
//
// ── IT SHOWS THE SPACE NOW. READ THIS BEFORE REDUCING IT AGAIN. ─────────────────────────────────
//
// 🔴 From 2026-09-19 (#2781) to this change, the ENTIRE body of this file was one <SignInCta>.
// Cover, name, tagline, then "Want to know X? Sign in free to follow this Space." A signed-out
// visitor — and Googlebot, which cannot sign in and which this URL is in the sitemap FOR
// (app/sitemap.ts) — saw none of the operator's page. Not one block.
//
// That was never ruled. It was collateral. #2781 moved this URL out of (main) so an auth read in
// that layout would stop voiding ISR, and GitHub records the old body as RENAMED to
// (profile)/full/page.tsx at +4/-0 — the block grid was not deleted, it was moved behind a URL a
// signed-out visitor is never routed to (lib/nav/member-space-rewrite.ts:12, `if (!signedIn)
// return null`). ADR-1465's Decision and Consequences are about cookies, ISR and keeping PRIVATE
// Spaces at 404; neither it nor ADR-1452 argues a public Space should show a stranger less.
// ADR-1080 had already ruled the other way, in terms that cover this exactly: "a signed-out
// visitor following a shared Circle or event link sees the thing instead of a form."
//
// So the body below is the same <SpaceProfileModules> render (profile)/full/page.tsx performs, off
// the same `preferences.profileLayout` node, parsed by the same pure `parseEntityLayout`. Not a
// public variant of the page — the page.
//
// HOW IT STAYS ISR-ELIGIBLE, which is the whole reason it was a stub. `markAnonymousRender()` is
// the FIRST statement of the body, before any read. It makes `getCachedUser()` return null without
// constructing a Supabase client, so nothing in the ~256 server modules this render reaches can
// touch `cookies()` — including the three that did at the time of writing (getSpaceCommunity,
// the Circles block's member check, getSpaceProgram) and, more importantly, the next block someone
// adds. lib/core/anonymous-render.ts explains why that is a seam and not an audit.
//
// This is not a privilege downgrade dressed up: an ISR document is built once and served to
// everyone, so "this render has no viewer" is not a policy choice here, it is the only true
// statement about a page in that cache. Read-only follows for free — with no viewer, every
// member/owner check resolves false, so join, follow and owner tools render as their signed-out
// selves rather than having to be hidden one by one.
//
// The sign-in card is not gone; it is DEMOTED, below the content, which is the shape the sibling
// public pages already use (app/(public)/events/[slug]/page.tsx puts the body in `interiorMain`
// and the CTA in `interiorSide`). A stranger reads what the Space is, and is asked to join at the
// point they might want to.
export const revalidate = 3600

export async function generateStaticParams() {
  const spaces = await listNetworkedSpaces({ sort: 'name' }).catch(() => [])
  return spaces.slice(0, 200).map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  markAnonymousRender()
  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return { title: 'Space not found', robots: { index: false, follow: false } }
  return spaceProfileMetadata(slug)
}

export default async function PublicSpacePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // FIRST, before any read: this document is cached and served to everyone, so it has no viewer.
  markAnonymousRender()

  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()
  // Stamp the tenant so any block that resolves its rows from the active Space reads THIS one —
  // the same line (profile)/full/page.tsx carries, for the same reason.
  setActiveSpace(space)

  const brandName = space.brandName?.trim() || space.name
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  // The cover resolves through the one detail-hero ladder (PROG-P5, ADR-1498), like the 20+
  // entity pages before it: the Space's own cover (or its deterministic stock stand-in, the same
  // photo the OG card draws) is rung 1, and the operator's FOCAL POINT travels with it, which the
  // plain 16:6 crop this page shipped with ignored. The band then renders through the canonical
  // PageHero at the header element's height and overlay, so /admin/elements retunes it with the
  // rest. Service-role reads only, so ISR (`revalidate` above) is untouched.
  const [tagline, hero, tiers, reviews] = await Promise.all([
    readTagline(space.id),
    resolveDetailHero(`/spaces/${space.slug}`, {
      entityImage: coverSrc,
      entityFocus: readCoverFocus(space.preferences),
    }),
    // The Space's published tiers, for the front door at the foot of the page (LIVE-524). SPACE
    // data, not VIEWER data, so it costs this route nothing: `listMembershipTiers` takes a spaceId
    // and reads no caller, unlike `getMyMembership` which is why that one can never appear here.
    // Request-cached through the same `readTiers` the Memberships tab renders from, so the door and
    // the page behind it can never disagree about whether there is anything to sell.
    listMembershipTiers(space.id),
    // The review summary feeds aggregateRating on the LocalBusiness node below (SCAN-663). A
    // service-role read of SPACE data, like the three above; a failed read drops the rating, never
    // the page.
    getSpaceReviews(space.id).catch(() => null),
  ])
  const tierCount = tiers.length
  // The LocalBusiness node the CRAWLER reads is this page's (self-canonical, in the sitemap), and
  // until SCAN-663 it was a name-only stub while the member layout under (main) passed the full
  // NAP, hours, links and rating to the same builder. Same sources, same shape: `readProfileData`
  // is a pure read of preferences, `parseOpeningHours` is pure, and the builder drops any half it
  // is not given, so a virtual Space still emits a valid node.
  const spaceProfile = readProfileData(space.preferences)
  const aggregateRating =
    reviews && reviews.average != null && reviews.count > 0
      ? { ratingValue: reviews.average, reviewCount: reviews.count }
      : undefined

  // The operator's saved arrangement, read and parsed EXACTLY as the member body reads it
  // ((profile)/full/page.tsx): `parseEntityLayout` is pure and takes no viewer, so the two renders
  // resolve the same rows. FAIL-SAFE: a malformed or absent node parses to null, and `?? {}` keeps
  // the grid truthy so the renderer resolves the kind's starter layout instead of dropping to its
  // flat single-column fallback.
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const grid = parseEntityLayout(rawLayout) ?? {}

  // 🔴 THE VISITOR GETS THE MENU TOO (LIVE-522). Until now this page mounted the blocks and a
  // sign-in card and NOTHING ELSE: no menu. So the canonical share URL -- the one every link,
  // QR code and search result points at -- offered a visitor no way to reach this Space's
  // Calendar, Memberships, Circles, Reviews or Shop. They could scroll Home or leave.
  //
  // The menu was never missing from the Space, only from this ROUTE. Every sub-page under
  // app/(main)/spaces/[slug]/(profile) renders the member chrome with the full menu and has no
  // auth gate, so a visitor who reached one by any other means DID get a menu, whose Home link
  // then returned them to this page, where it vanished. It appeared and disappeared inside one
  // Space.
  //
  // `buildPublicSpaceProfileNav` is the cookie-free entry point: reading a caller here would make
  // this route dynamic and cost the share URL its ISR (ADR-1465 / ADR-1526). profile-nav.public
  // .test.ts makes getCallerProfile throw and proves this call still resolves.
  const { tabs } = await buildPublicSpaceProfileNav(space)

  return (
    <>
      <JsonLd
        data={[
          spaceSchema({
            slug: space.slug,
            type: space.type,
            name: brandName,
            tagline,
            logoUrl: space.brandLogoUrl,
            aggregateRating,
            telephone: spaceProfile.phone,
            address:
              spaceProfile.address || space.city
                ? {
                    ...(spaceProfile.address ? { streetAddress: spaceProfile.address } : {}),
                    ...(space.city ? { addressLocality: space.city } : {}),
                  }
                : null,
            sameAs: [spaceProfile.website, ...(spaceProfile.socials ?? []).map((s) => s.url)],
            priceRange: spaceProfile.priceRange,
            openingHours: parseOpeningHours(spaceProfile.hours),
          }),
          breadcrumbSchema([
            { name: 'Spaces', path: '/spaces' },
            { name: brandName, path: `/spaces/${space.slug}` },
          ]),
        ]}
      />
      <DetailTemplate
        {...hero}
        title={brandName}
        subtitle={tagline ?? undefined}
        back={{ href: '/discover/spaces', label: 'Spaces' }}
        // The HOOK-FREE view, not the client wrapper: `useSearchParams()` in a prerendered page
        // bails the subtree out of the static HTML, and this is the page crawlers read. Measured --
        // mounting the wrapper here failed the Vercel build outright on /spaces/encinitas-nexus with
        // "useSearchParams() should be wrapped in a suspense boundary".
        //
        // `pathname` is the canonical Space URL, which is the only path this route serves, and
        // `canManage` is false by construction rather than by choice: this tree has no viewer to be
        // a manager. An operator who signs in is rewritten to the member body by
        // lib/nav/member-space-rewrite.ts and never renders this page at all.
        stickyNav={<SpaceProfileMenuView tabs={tabs} canManage={false} pathname={`/spaces/${space.slug}`} />}
      >
        <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
        {/* THE VISITOR'S FRONT DOOR (LIVE-524), and it sits BELOW the operator's blocks on purpose.
            LIVE-500's probe fails if `<SpaceProfileModules` appears after `<SignInCta` in this
            file, because a sign-in card in front of the content is the exact defect ADR-1526
            closed. The Space's own page comes first; the door follows it.

            `anonymous` is the only viewer this tree can pass, and that is a fact rather than a
            choice: markAnonymousRender() above means every caller read resolves false, so this
            render genuinely does not know whether the reader is already a member. The tiers are
            Space data, not viewer data, so reading them costs the page nothing.

            When the Space sells nothing the door returns null and the original sign-in card below
            is what renders, unchanged. */}
        {tierCount > 0 ? (
          <SpaceFrontDoor
            viewer="anonymous"
            brandName={brandName}
            spaceSlug={space.slug}
            tierCount={tierCount}
          />
        ) : (
          <div className="mx-auto mt-14 max-w-xl">
            <SignInCta
              title={`Want to know ${brandName}?`}
              body="Sign in free to follow this Space, see what's on, and be a face the host recognizes."
              action={BETA_CTA_LABEL}
              href={BETA_CTA_HREF}
            />
          </div>
        )}
      </DetailTemplate>
    </>
  )
}
