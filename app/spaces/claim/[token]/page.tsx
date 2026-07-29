import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { getMyProfileId } from '@/lib/auth'
import { resolveSpaceClaimAny } from '@/lib/spaces/claim'
import { getSpaceById } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { readHeroConfig, resolveHero, heroHeightClass } from '@/lib/spaces/hero-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readCoverScrim, readCoverFocus } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { cn } from '@/lib/utils'
import { AccentScope } from '@/components/spaces/accent-scope'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { ClaimSpaceButton } from './claim-button'

export const dynamic = 'force-dynamic'

// ONE column literal for the whole page: the ribbon, the body and the fixed claim bar all use it.
// They were three independent copies of `max-w-6xl`, which matched only by luck and would desync the
// first time one was edited.
//
// WHY 69rem. The public Space page has no max-width of its own — its body is whatever is left of the
// app shell row after both rails, so it is FLUID and this page is FIXED. There is no literal that
// matches at every breakpoint; this matches at the width that matters, the widest:
//
//   shell row      max-w-[105rem]  1680
//   minus lg:px-8   -64            1616
//   minus left rail w-48 + gap-10  -232
//   minus right rail w-72 + ml-3 + gap-10  -340
//   = Space page body               ~1044
//   + this page's own lg:px-8       +64
//   = 1108  ->  69rem (1104)        (was max-w-6xl = 1152, i.e. 1088 of content)
//
// The remaining difference the owner sees is NOT width, it is that this page renders outside the
// (main) route group, so the shell never mounts and there are no rails to flank the column. That is
// deliberate: a signed-out business owner must be able to see what they are claiming.
const CLAIM_COLUMN = 'mx-auto w-full max-w-[69rem] px-4 sm:px-6 lg:px-8'

// Never index a claim landing. This page renders the SAME block body as the live
// /spaces/<slug> profile, so an indexed copy would compete with the canonical Space
// page for its own brand terms — the exact cannibalization robots.ts avoids for the
// /spaces/directory twin. It is also a one-time token URL: indexing it publishes a
// single-use claim link. Same posture as the (capture) funnel pages, which pair a
// per-page noindex with a robots.ts Disallow.
//
// 🔴 NOINDEX IS NOT NO-PREVIEW. A static `metadata` object with only `title` + `robots`
// INHERITS the root layout's entire openGraph/twitter block, because Next shallow-merges
// metadata down the segment tree and a segment that never declares `openGraph` keeps the
// parent's verbatim. That is why pasting a claim link into Apple Mail produced
// "Frequency · The Community Collective / frequencylocal.com" pointing at the homepage:
// not a malformed tag, an INHERITED one. Messaging clients and mail previewers do not read
// robots directives, so the card must be authored here even though the page is noindexed.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const claim = await resolveSpaceClaimAny(token)
  const space = claim && !claim.claimed ? await getSpaceById(claim.spaceId) : null

  // Unknown, used, or removed: a neutral card that names no business. The OG image already
  // falls back the same way, so the two never disagree about what a dead token reveals.
  if (!space) {
    return {
      title: 'Claim this business',
      robots: { index: false },
      openGraph: {
        title: `Claim your business on ${SITE_NAME}`,
        description: 'Frequency builds a page for local businesses. If one is yours, claim it.',
        type: 'website',
      },
      twitter: { card: 'summary_large_image' },
    }
  }

  const brandName = space.brandName?.trim() || space.name
  const title = `${brandName} · Claim your business on ${SITE_NAME}`
  // The page's own words, so the preview reads like the page rather than like the site:
  // the tagline the owner will actually see under their name in the hero.
  const description = space.tagline?.trim()
    ? `${space.tagline.trim()} Claim this page to edit it and run it from your own account.`
    : `Frequency built a page for ${brandName}. Claim it to edit it and run it from your own account.`

  return {
    title,
    robots: { index: false },
    // Declared explicitly so NOTHING is inherited from the root: an inherited `url` pointed
    // every claim preview at the homepage.
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: SITE_NAME,
      url: `${SITE_URL}/spaces/claim/${token}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// The claim landing the real business owner reaches from an operator's outreach. PUBLIC (outside the
// (main) shell) so a signed-out owner can see what they are claiming. It now shows the REAL, FULL public
// page Frequency built for them (the same block body the live profile renders) so they see exactly what
// they are getting, with a big always-visible "Claim this business" bar. Resolves the seeded, UNCLAIMED
// Space by its one-time token; 404 when the token is unknown, already used, or the Space was removed, so
// a guessed token learns nothing. Signed-out -> a sign-in CTA that returns here; signed-in -> one-tap claim.

export default async function ClaimSpacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [claim, myProfileId] = await Promise.all([resolveSpaceClaimAny(token), getMyProfileId()])
  if (!claim) notFound()

  // Already claimed: send the real owner who re-opens their used link straight to their Space, and reveal
  // nothing to anyone else.
  if (claim.claimed) {
    if (myProfileId && claim.ownerProfileId === myProfileId) redirect(`/spaces/${claim.slug}`)
    notFound()
  }

  // Resolve the FULL Space by id (admin read — bypasses the active-only RLS AND the visibility gate, so an
  // unlisted seeded Space still renders here, unlike getVisibleSpaceBySlug). Stamp it active so the
  // self-fetching dynamic profile blocks read THIS tenant's rows.
  const space = await getSpaceById(claim.spaceId)
  if (!space) notFound()
  setActiveSpace(space)

  const name = space.brandName || space.name || claim.name || 'Your business'

  // The HERO + cover resolved EXACTLY as the live (profile) layout does, so the claim page reads as the real
  // page: the operator's hero copy (eyebrow / heading / tagline), their chosen cover scrim + focal point, and
  // the shared deterministic placeholder when no cover is uploaded. (ADR-526: Space covers are always Hero
  // size, so the claim page renders that one variant — the cover with the identity overlaid on a scrim.)
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base: `/spaces/${space.slug}`,
    brandName: name,
    tagline: space.tagline ?? null,
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const coverH = heroHeightClass(hero.height)
  const coverFocus = readCoverFocus(space.preferences)
  const coverScrim = readCoverScrim(space.preferences)
  const heroOnInk = coverScrim !== 'blend'
  const heroScrimGradient =
    coverScrim === 'none'
      ? null
      : heroOnInk
        ? 'from-ink/80 via-ink/30 to-transparent'
        : 'from-canvas via-canvas/40 to-transparent'

  // The public grid: read the operator's saved arrangement (preferences.profileLayout) and resolve it the
  // SAME way the live visitor page does (parseEntityLayout -> resolveRows), fail-safe to the kind starter.
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const grid = parseEntityLayout(rawLayout) ?? {}

  // Match the real profile's accent + typography so the preview reads as the actual page, not a generic one.
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const spaceTheme = parseSpaceTheme(space.preferences)

  return (
    <AccentScope vars={accentVars} theme={spaceTheme}>
      {/* Generous bottom padding so the fixed claim bar never overlaps the last block. The bar is a
          single row at sm+ but stacks (message + big button + helper line) on mobile, so it needs more. */}
      <div className="min-h-screen bg-canvas pb-48 sm:pb-28">
        {/* Claim ribbon — sets the context above the page it introduces. Its inner content aligns to the
            same column as the page below it. */}
        <div className="border-b border-primary/20 bg-primary-bg/40">
          <div className={cn(CLAIM_COLUMN, "flex items-start gap-2 py-2.5 text-sm text-primary-strong")}>
            <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Frequency built this page so people nearby could find you. If it is yours, claim it to make it your own.
            </span>
          </div>
        </div>

        {/* ONE content column, matching the business space page's boundaries: hero + body sit inside the
            same max-width + padding. */}
        <div className={cn(CLAIM_COLUMN, "py-6")}>
          {/* The REAL live hero — the SAME node the (profile) page renders: the operator's Hero-size cover
              with the identity (logo + eyebrow + name + tagline) overlaid on a bottom scrim. Visitor view:
              no Follow / owner actions. Mirrors layout.tsx `heroCoverNode`. */}
          <header className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
            <Image
              src={coverSrc}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 1344px"
              preload
              className="object-cover"
              style={{ objectPosition: coverFocus }}
            />
            {heroScrimGradient && <div className={cn('absolute inset-0 bg-gradient-to-t', heroScrimGradient)} />}
            <div className={cn('absolute inset-x-0 bottom-0 p-6 sm:p-8', coverScrim === 'none' && 'on-image-text')}>
              <div className="flex min-w-0 items-end gap-4">
                <div className="shrink-0">
                  <BrandAnchor name={name} logoUrl={space.brandLogoUrl} />
                </div>
                <div className="min-w-0 pb-1">
                  {hero.eyebrow && (
                    <p
                      className={cn(
                        'mb-1 text-2xs font-semibold uppercase tracking-wide',
                        heroOnInk ? 'text-on-ink-muted' : 'text-primary-strong',
                      )}
                    >
                      {hero.eyebrow}
                    </p>
                  )}
                  <h1
                    className={cn(
                      'min-w-0 break-words text-2xl font-bold leading-tight sm:text-3xl',
                      heroOnInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : 'text-text',
                    )}
                  >
                    {hero.heading}
                  </h1>
                  {hero.tagline && (
                    <p className={cn('mt-1 max-w-2xl text-base font-medium', heroOnInk ? 'text-on-ink' : 'text-muted')}>
                      {hero.tagline}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* The REAL public profile body — byte-for-byte the visitor render, minus the shell chrome. */}
          {/* PAGE-FRAMEWORK section 5: never block the shell on a slow await. SpaceProfileModules
              awaits getSpaceContentData, and without a boundary the claim ribbon, the hero and the
              fixed claim bar all waited on it — so the one thing this page exists to show (the
              claim button) was the last thing to paint. The live Space page already wraps the
              equivalent body; this matches it. */}
          <main className="py-8">
            <Suspense fallback={<ProfileBodySkeleton />}>
              <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
            </Suspense>
          </main>
        </div>
      </div>

      {/* The always-visible claim bar — the big button rides along the whole page. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-pop backdrop-blur">
        <div className={cn(CLAIM_COLUMN, "flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between")}>
          {/* The sell names what actually ships TODAY, and nothing else. Deliberately absent:
              "take bookings" (paid booking is double-gated behind a Stripe key AND the
              host_payouts_enabled flag, which defaults OFF, so it promises money that cannot
              move), and the CRM / Email / Automation modules (marketed as freemium but sitting
              behind a Business-plan floor in FEATURE_GATES, so a free claimer would lose them the
              day that flag flips). Memberships, tickets and donations are record-only in v1 and
              would read as a revenue promise beside the rest. Every noun here is canon
              (docs/NAMING.md) and there are no em dashes (docs/CONTENT-VOICE.md). */}
          <p className="text-sm text-text">
            <span className="font-semibold">Is this your business?</span> This page is already
            built and already found. Claim it to edit anything on it, list your events and let
            people book a time, and answer the people who show up. It takes one tap.
          </p>
          <div className="shrink-0 sm:w-64">
            {myProfileId ? (
              <ClaimSpaceButton token={token} size="lg" />
            ) : (
              <div className="space-y-1.5">
                <Link
                  href={`/sign-in?next=/spaces/claim/${token}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
                >
                  <Zap className="h-5 w-5" aria-hidden /> Claim this business
                </Link>
                <p className="text-center text-xs text-subtle">Signing in creates your account in a minute.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AccentScope>
  )
}
