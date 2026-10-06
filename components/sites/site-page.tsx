import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, Radio } from 'lucide-react'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { hasPage, readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readWebsitePublished } from '@/lib/spaces/website'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { AccentScope } from '@/components/spaces/accent-scope'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { SiteChrome } from '@/components/sites/site-chrome'

// THE EXTERNAL SPACE WEBSITE (ADR-508 U4-B, PROG-E10 phase 1). /sites/<slug> and /sites/<slug>/<page>
// render the Space's own pages (the same block docs the Space page editor saves, so the owner edits once
// and the site and the profile stay in sync) inside a slim site chrome with no Frequency app shell.
//
// FAIL-CLOSED twice: the Space is resolved with an ANONYMOUS viewer, so a Private Space 404s and this
// route never confirms one exists; and the site only renders once the owner has published it
// (preferences.websitePublished, written by setWebsitePublished). An unpublished site shows a friendly
// Coming soon page that points back to the Space on Frequency, so a shared link never dead-ends.
//
// noindex until the site SEO phase lands its own canonical, robots and sitemap: today the same content
// is also the indexable /spaces/<slug> profile, and two indexable copies would compete.

export async function siteMetadata(slug: string, pageSlug: string = HOME_SLUG): Promise<Metadata> {
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return { title: 'Site', robots: { index: false } }
  const brandName = space.brandName?.trim() || space.name
  if (!readWebsitePublished(space.preferences)) {
    return { title: `${brandName} website coming soon`, robots: { index: false } }
  }
  const page = readProfilePages(space.preferences).find((p) => p.slug === pageSlug)
  const title = !page || page.slug === HOME_SLUG ? brandName : `${page.label} | ${brandName}`
  return {
    // `absolute` so the root layout's "| Frequency" template never brands somebody's own website.
    title: { absolute: title },
    description: space.tagline ?? undefined,
    robots: { index: false },
  }
}

export async function SitePage({
  slug,
  pageSlug = HOME_SLUG,
  base,
}: {
  slug: string
  pageSlug?: string
  /** The path the site's links hang off: `/sites/<slug>` by default, `` on the Space's own domain. */
  base?: string
}) {
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()

  const brandName = space.brandName?.trim() || space.name
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const theme = parseSpaceTheme(space.preferences)
  const profileHref = `/spaces/${space.slug}`
  const siteBase = base ?? `/sites/${space.slug}`

  if (!readWebsitePublished(space.preferences)) {
    // A deep link into an unpublished site has nothing to show yet; only the root gets the notice.
    if (pageSlug !== HOME_SLUG) notFound()
    return (
      <AccentScope vars={accentVars} theme={theme}>
        <SiteComingSoon brandName={brandName} profileHref={profileHref} />
      </AccentScope>
    )
  }

  if (!hasPage(space.preferences, pageSlug)) notFound()

  return (
    // The Space's PAGE THEME rides the same wrapper as the accent (ADR-578), so the site wears the
    // owner's pick rather than the default Frequency look.
    <AccentScope vars={accentVars} theme={theme}>
      <SiteChrome
        brandName={brandName}
        logoUrl={space.brandLogoUrl}
        pages={readProfilePages(space.preferences)}
        activePageSlug={pageSlug}
        base={siteBase}
        profileHref={profileHref}
      >
        <Suspense fallback={<ProfileBodySkeleton />}>
          <SpaceLanding slug={space.slug} pageSlug={pageSlug} anonymous />
        </Suspense>
      </SiteChrome>
    </AccentScope>
  )
}

function SiteComingSoon({ brandName, profileHref }: { brandName: string; profileHref: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-16 text-text">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-primary-bg text-primary-strong">
          <Radio className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-display-h3 font-bold tracking-tight text-text">Coming soon</h1>
        <p className="mt-3 text-body leading-relaxed text-muted">
          The standalone website for {brandName} is on its way. For now, everything lives on the{' '}
          {brandName} page on Frequency.
        </p>
        <Link
          href={profileHref}
          className="mt-8 inline-flex items-center gap-2 rounded-control bg-primary px-5 py-3 text-body-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          Visit {brandName} on Frequency
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </main>
  )
}
