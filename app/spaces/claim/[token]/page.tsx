import type { Metadata } from 'next'
import { Suspense, cache } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { SHELL_ROW_CLASS, SHELL_CONTENT_WIDTH_CLASS } from '@/lib/layout/shell-metrics'
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

// THE COLUMN. Same width as the app shell's content column — the region between the two rails on
// a live Space page — at EVERY breakpoint, and centred.
//
// 🔴 WHY IT IS TWO NESTED DIVS AND NOT A max-w CONSTANT. The shell's content column is
// `flex-1 min-w-0`: it has no width of its own, it is the remainder after the rails, and the rails
// hide at DIFFERENT breakpoints (left at `md`, right at `lg`). A single constant was tried here
// (`max-w-[69rem]`, derived by hand from the 105rem case). It lands within 4px on a 1680px monitor
// and **232px too wide at ~1000px**, where the right rail has already hidden — reported three
// times by the owner as "still a random width, too wide".
//
// So: OUTER reproduces the shell row's box (same max-width, same responsive padding), and INNER
// subtracts exactly what the rails and gaps take at that breakpoint. `100%` inside the calc is the
// outer's inner width, which is the same quantity the shell's flex row divides up. The numbers
// live in lib/layout/shell-metrics.ts and are pinned against app-shell.tsx by a test, so widening
// a rail there cannot silently desync this page again.
const CLAIM_ROW = SHELL_ROW_CLASS
const CLAIM_COLUMN = SHELL_CONTENT_WIDTH_CLASS

// ONE `spaces` row read per request, shared by generateMetadata and the page body.
//
// 🔴 Next runs generateMetadata and the page component in the SAME request scope, so anything both
// of them call runs twice unless it is request-cached. `resolveSpaceClaimAny` already is (it is
// wrapped in cache() at its definition); `getSpaceById` is NOT, so every claim pageview paid for a
// second full-column `spaces` select — on the render path of the one page whose entire job is to
// paint a button fast. lib/spaces/operated.ts even carries a comment asserting getSpaceById is
// request-cached, which it is not; that is how this went unnoticed.
//
// Wrapped HERE rather than at the definition on purpose. getSpaceById has ~168 call sites,
// including server actions that read a Space, write it, and read it again inside one request
// (lib/importer/materialize.ts does exactly that). Caching it globally would hand those the
// pre-write snapshot — a silent correctness change traded for a perf win on one page. A local
// wrapper gets the dedupe with none of the blast radius.
const claimTargetSpace = cache(async (token: string) => {
  const claim = await resolveSpaceClaimAny(token)
  return claim && !claim.claimed ? await getSpaceById(claim.spaceId) : null
})

/** The business's display name, TRIMMED. generateMetadata trimmed and the page body did not, so a
 *  Space whose `brand_name` is whitespace produced a correctly-named share card above a blank <h1>
 *  and blank BrandAnchor initials. One helper, so the two cannot disagree again. */
function displayBrandName(brandName: string | null | undefined, fallback: string): string {
  return brandName?.trim() || fallback?.trim() || ''
}

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
  const space = await claimTargetSpace(token)

  // Unknown, used, or removed: a neutral card that names no business. The OG image already
  // falls back the same way, so the two never disagree about what a dead token reveals.
  if (!space) {
    return {
      title: { absolute: `Claim this business · ${SITE_NAME}` },
      robots: { index: false },
      openGraph: {
        title: `Claim your business on ${SITE_NAME}`,
        description: 'Frequency builds a page for local businesses. If one is yours, claim it.',
        type: 'website',
      },
      twitter: { card: 'summary_large_image' },
    }
  }

  const brandName = displayBrandName(space.brandName, space.name)
  // 🔴 ABSOLUTE, not a plain string. The root layout declares `title.template = '%s · Frequency'`
  // (app/layout.tsx), which wraps every child title that is not absolute — and this one already
  // ends in the site name, so the browser tab and the og:title read
  // "…Claim your business on Frequency · Frequency". `absolute` opts this segment out of the
  // template; the site name stays because it is written here deliberately, once.
  const title = `${brandName} · Claim your business on ${SITE_NAME}`
  // The page's own words, so the preview reads like the page rather than like the site:
  // the tagline the owner will actually see under their name in the hero.
  const description = space.tagline?.trim()
    ? `${space.tagline.trim()} Claim this page to edit it and run it from your own account.`
    : `Frequency built a page for ${brandName}. Claim it to edit it and run it from your own account.`

  return {
    title: { absolute: title },
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

// THE CLAIM BAR'S CONTENT, authored ONCE and rendered TWICE: once fixed to the viewport bottom, and
// once invisibly in the document flow as a spacer.
//
// 🔴 WHY A CLONE AND NOT PADDING. The page reserved room for the fixed bar with a hand-tuned
// `pb-48 sm:pb-28`. That is a guess at the bar's rendered height, and it went stale the moment the
// footer copy was rewritten ~50% longer: at 375px the sell wraps to about seven lines and the bar
// grew past the 12rem reserved for it, so it sat on top of the last profile block — worst exactly
// where the page is hardest to scroll around it. Any future copy edit re-breaks it silently,
// because nothing connects the two numbers.
//
// An invisible clone cannot go stale: it IS the bar, laid out by the same rules in the same column
// at the same breakpoint, so it reserves the exact height at every width with no number to maintain.
// `invisible` is visibility:hidden (it still occupies space, unlike `hidden`), and `inert` +
// `aria-hidden` keep the duplicate button out of the tab order, off the accessibility tree, and
// unclickable — without it there would be two controls named "Claim this business".
function ClaimBarContent({ token, signedIn }: { token: string; signedIn: boolean }) {
  return (
    <div className={cn(CLAIM_COLUMN, 'flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between')}>
      {/* The sell names what actually ships TODAY, and nothing else. Deliberately absent:
          "take bookings" (paid booking is double-gated behind a Stripe key AND the
          host_payouts_enabled flag, which defaults OFF, so it promises money that cannot
          move), and the CRM / Email / Automation modules (marketed as freemium but sitting
          behind a Business-plan floor in FEATURE_GATES, so a free claimer would lose them the
          day that flag flips). Memberships, tickets and donations are record-only in v1 and
          would read as a revenue promise beside the rest. Every noun here is canon
          (docs/NAMING.md) and there are no em dashes (docs/CONTENT-VOICE.md). */}
      <p className="text-body-sm text-text">
        <span className="font-semibold">Is this your business?</span> This page is already built and
        already found. Claim it to edit anything on it, list your events and let people book a time,
        and answer the people who show up. It takes one tap.
      </p>
      <div className="shrink-0 sm:w-64">
        {signedIn ? (
          <ClaimSpaceButton token={token} size="lg" />
        ) : (
          <div className="space-y-1.5">
            <Link
              href={`/sign-in?next=/spaces/claim/${token}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-primary px-8 py-4 text-body font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
            >
              <Zap className="h-5 w-5" aria-hidden /> Claim this business
            </Link>
            <p className="text-center text-meta text-subtle">Signing in creates your account in a minute.</p>
          </div>
        )}
      </div>
    </div>
  )
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
  //
  // Through the request-cached wrapper, so generateMetadata's read of the same row is reused rather
  // than repeated. Safe to reach for it after the `claim.claimed` branch above: the wrapper returns
  // null for a claimed token, and a claimed token has already redirected or 404'd by now.
  const space = await claimTargetSpace(token)
  if (!space) notFound()
  setActiveSpace(space)

  const name = displayBrandName(space.brandName, space.name) || claim.name || 'Your business'

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
      {/* No bottom padding here: the room for the fixed claim bar is reserved by an exact invisible
          clone of it at the end of this column (see ClaimBarContent). */}
      <div className="min-h-screen bg-canvas px-safe">
        {/* Claim ribbon — sets the context above the page it introduces. Its inner content aligns to the
            same column as the page below it. */}
        <div className="border-b border-primary/20 bg-primary-bg/40">
          <div className={CLAIM_ROW}>
            <div className={cn(CLAIM_COLUMN, "flex items-start gap-2 py-2.5 text-body-sm text-primary-strong")}>
            <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {/* "so people nearby could find you" was not true for every Space that renders here. An
                unlisted seed is `visibility = 'private'` and never appears in the directory, and this
                page deliberately bypasses the visibility gate so it renders anyway. The claim below
                holds in both cases: the page exists, and claiming it is what makes it theirs. */}
            <span>
              Frequency built this page for your business. If it is yours, claim it to make it your own.
            </span>
            </div>
          </div>
        </div>

        {/* ONE content column, matching the business space page's boundaries: hero + body sit inside the
            same max-width + padding.

            <main> WRAPS THE HERO TOO, not just the module body. It used to open below the header, which
            left the <h1> outside every landmark — so a screen-reader scan by landmark reached the page's
            content and never its title. The claim bar gets its own labelled region below for the same
            reason: it is the one action this page exists for and it was in no landmark at all. */}
        <div className={CLAIM_ROW}>
          <main className={cn(CLAIM_COLUMN, "py-6")}>
          {/* The REAL live hero — the SAME node the (profile) page renders. The three theme-carrying
              classes below (`--radius-cover`, `font-eyebrow`, `font-section`) are what make it read as
              the owner's page rather than a generic one: on the 'classic' theme they resolve to
              Playfair and a 2px cover radius, and this copy had drifted to `rounded-xl` and the
              inherited body face. They are the exact tokens app/(main)/spaces/[slug]/(profile)/
              layout.tsx uses, and drift here is invisible on the default theme, which is why it
              survived — every un-themed Space looks identical either way.

              ⚠️ This hero is a SECOND COPY of that layout's heroCoverNode + nameLockup, and the
              duplication is the actual defect. Three drifts had already accumulated. The durable fix
              is extracting the lockup into one shared component with Follow / actions / badge as
              optional slots; deliberately not folded in here because it touches the live Space page
              too. The Founding Business badge is still absent from this copy on purpose: the claim
              page never fetches foundingBadgeForSpace, and adding a second identity flourish beside
              the fixed claim bar competes with the one action this page exists for.

              Original note follows: the operator's Hero-size cover
              with the identity (logo + eyebrow + name + tagline) overlaid on a bottom scrim. Visitor view:
              no Follow / owner actions. Mirrors layout.tsx `heroCoverNode`. */}
          <header className={cn('relative w-full overflow-hidden rounded-[var(--radius-cover,1.5rem)] bg-surface-elevated', coverH)}>
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
                        'font-eyebrow mb-1 text-2xs font-semibold uppercase tracking-wide',
                        heroOnInk ? 'text-on-ink-muted' : 'text-primary-strong',
                      )}
                    >
                      {hero.eyebrow}
                    </p>
                  )}
                  <h1
                    className={cn(
                      'font-section min-w-0 break-words text-display-h3 font-bold leading-tight',
                      heroOnInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : 'text-text',
                    )}
                  >
                    {hero.heading}
                  </h1>
                  {hero.tagline && (
                    <p className={cn('mt-1 max-w-2xl text-body font-medium', heroOnInk ? 'text-on-ink' : 'text-muted')}>
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
          {/* `@container` is load-bearing, not decoration. ProfileBodySkeleton lays its cards out with
              `@lg:grid-cols-2`, which needs an @container ANCESTOR — and the only one on this route
              (`@container/profile`) is inside the Suspense CHILD, so it does not exist while the
              fallback is showing. Without this the skeleton was always a tall single column and the
              page visibly snapped to two when the body streamed in. */}
          <div className="@container py-8">
            <Suspense fallback={<ProfileBodySkeleton />}>
              <SpaceProfileModules space={toProfileContext(space)} grid={grid} />
            </Suspense>
          </div>
          </main>
        </div>

        {/* THE SPACER. An invisible, inert clone of the fixed bar below, in the document flow, so the
            page reserves the bar's EXACT height at every breakpoint instead of a hand-tuned padding
            that goes stale the next time this copy is edited. `border-t` is matched too, because it
            adds a pixel to the real bar's box. */}
        <div aria-hidden inert className="invisible border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className={CLAIM_ROW}>
            <ClaimBarContent token={token} signedIn={!!myProfileId} />
          </div>
        </div>
      </div>

      {/* The always-visible claim bar — the big button rides along the whole page. A labelled
          <section> so it is reachable by landmark: it is the page's only CTA and sat outside every
          landmark, which a landmark-driven scan skips entirely. */}
      <section
        aria-label="Claim this business"
        className="px-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-pop backdrop-blur">
        <div className={CLAIM_ROW}>
          <ClaimBarContent token={token} signedIn={!!myProfileId} />
        </div>
      </section>
    </AccentScope>
  )
}
