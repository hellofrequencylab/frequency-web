import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, Radio } from 'lucide-react'
import { readHeaderCtaPreference, resolveHeaderCta } from '@/lib/spaces/header-cta'
import { SITE_BOOK_SLUG, SITE_CONTACT_SLUG, siteHasContactPage, siteLocalHref, withoutAccentMarks, type SiteLinkMap } from '@/lib/sites/house-theme'
import { readProfileData } from '@/lib/spaces/profile-data'
import { readSiteBooking } from '@/lib/sites/site-booking'
import { SiteBooking } from '@/components/sites/site-booking'
import { buildHouseContact, buildHouseHome, HouseHome } from '@/components/sites/house-home'
import { HouseBlock } from '@/components/sites/house-sections'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { hasPage, readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readSiteHero, readWebsitePublished } from '@/lib/spaces/website'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { AccentScope } from '@/components/spaces/accent-scope'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'
import { SiteChrome, SITE_CONTAINER, siteHref } from '@/components/sites/site-chrome'
import { buttonClasses } from '@/components/ui/button'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SpaceProfileModules } from '@/components/widgets/space-profile/space-profile-modules'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { readTagline } from '@/lib/spaces/tagline'
import { parseEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { Space } from '@/lib/spaces/types'
import { appOrigin } from '@/lib/sites/host'
import { siteBaseUrl, sitePageUrl } from '@/lib/sites/seo'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { JsonLd } from '@/components/json-ld'
import { siteEntitySchema } from '@/lib/jsonld'

// THE EXTERNAL SPACE WEBSITE (ADR-508 U4-B, PROG-E10 phase 1). The Space's own website, served on its
// free subdomain (`<slug>.frequencylocal.com`, LIVE-782), on its own domain once connected, and at
// /sites/<slug> inside a slim site chrome with no Frequency app shell.
//
// THE HOUSE THEME (owner ask 2026-10-07: the "Daniel Tyack Site v4" design is the default look of every
// Space website). Home is the Space's own Home blocks, in the owner's order, each drawn as a themed section
// (components/sites/house-home.tsx); a block the theme does not style keeps the Space page's own render in a
// plain band. Every word, photo and link comes from the Space: its block fields, Hero settings, header
// button, offerings, memberships, FAQ and contact details. The Space's brand accent and page theme carry
// through (AccentScope), so the site wears the owner's color and, once chosen, their faces. A custom page
// renders its own page doc through SpaceLanding, here with an anonymous viewer. Left out on purpose,
// because they are Frequency's and not the owner's: the app shell and Frequency menu, the sign-in and BETA
// cards, Follow and Share, and owner tools. With no viewer (markAnonymousRender), every member and owner
// check resolves false.
//
// FAIL-CLOSED twice: the Space is resolved with an ANONYMOUS viewer, so a Private Space 404s and this
// route never confirms one exists; and the site only renders once the owner has published it
// (preferences.websitePublished, written by setWebsitePublished). An unpublished site shows a friendly
// Coming soon page that points back to the Space on Frequency, so a shared link never dead-ends.
//
// CACHED (PROG-E10 phase 5, LIVE-784). The routes are ISR and the Space row comes through getSiteSpace,
// cached under `site:<slug>`; the owner's saves and the publish switch expire it (lib/sites/site-cache.ts),
// so the publish gate below is re-decided on the first request after a toggle.
//
// INDEXABLE ONCE PUBLISHED (PROG-E10 phase 4, LIVE-783). A published site is its own site to a search
// engine: its canonical is the Space's bound domain when it has one, else its free `<slug>.frequencylocal.com`
// subdomain (lib/sites/seo.ts siteBaseUrl), and its title,
// description, share card and favicon come from the Space's brand. The /spaces/<slug> profile points
// its canonical at the domain too (lib/spaces/profile-metadata.ts), so the two copies never compete.
// An unpublished site, a Private Space and an unknown page all stay noindex.
//
// THE BOOK PAGE (LIVE-835, owner ask 2026-10-07: "If someone clicks book, that happens through the site.").
// `/book` (SITE_BOOK_SLUG, a reserved page slug like `contact`) is served once the Space takes bookings
// (lib/sites/site-booking.ts) and 404s otherwise. A visitor books there with a name and an email, through the
// guest-mode picker (components/sites/site-booking.tsx), and is never sent to Frequency.

export async function siteMetadata(slug: string, pageSlug: string = HOME_SLUG): Promise<Metadata> {
  const space = await getSiteSpace(slug)
  if (!space) return { title: 'Site', robots: { index: false } }
  const brandName = space.brandName?.trim() || space.name
  if (!readWebsitePublished(space.preferences)) {
    return { title: `${brandName} website coming soon`, robots: { index: false } }
  }
  const page =
    readProfilePages(space.preferences).find((p) => p.slug === pageSlug) ??
    (pageSlug === SITE_CONTACT_SLUG && siteHasContactPage(space.preferences) ? { slug: SITE_CONTACT_SLUG, label: 'Contact' } : null) ??
    (pageSlug === SITE_BOOK_SLUG && (await readSiteBooking(space.id)).takesBookings ? { slug: SITE_BOOK_SLUG, label: 'Book' } : null)
  if (!page) return { title: { absolute: brandName }, robots: { index: false } }
  const title = page.slug === HOME_SLUG ? brandName : `${page.label} | ${brandName}`
  const description = siteDescription(space, brandName, page.slug)
  const canonical = sitePageUrl(siteBaseUrl(space.slug, await boundSiteDomain(space), appOrigin()), page.slug)
  const shareImage = space.coverImageUrl || space.brandLogoUrl || null
  const images = shareImage ? [{ url: shareImage, alt: brandName }] : undefined
  return {
    // `absolute` so the root layout's "| Frequency" template never brands somebody's own website.
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical, siteName: brandName, type: 'website', images },
    twitter: { card: shareImage ? 'summary_large_image' : 'summary', title, description, images: shareImage ? [shareImage] : undefined },
    // The Space's logo as the tab icon, so the site never wears Frequency's favicon.
    ...(space.brandLogoUrl
      ? { icons: { icon: [{ url: space.brandLogoUrl }], apple: [{ url: space.brandLogoUrl }] } }
      : {}),
  }
}

export async function SitePage({
  slug,
  pageSlug = HOME_SLUG,
  base,
}: {
  slug: string
  pageSlug?: string
  /** The path the site's links hang off: `/sites/<slug>` by default, `` on the Space's own domain or
   *  its free subdomain. */
  base?: string
}) {
  // FIRST, before any read: the site is cached and served to everyone, so it has no viewer.
  markAnonymousRender()
  const space = await getSiteSpace(slug)
  if (!space) notFound()

  const brandName = space.brandName?.trim() || space.name
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const theme = parseSpaceTheme(space.preferences)
  // The Coming soon notice's one way on: a clearly labelled Frequency link, absolute (on the Space's own
  // host a `/spaces/...` path is not a site page).
  const profileHref = `${appOrigin()}/spaces/${space.slug}`
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

  const hasContact = siteHasContactPage(space.preferences)
  const contactPage = pageSlug === SITE_CONTACT_SLUG && hasContact
  // LIVE-835: the Book page reads the Space's services and windows; a Space that takes no bookings 404s.
  // Every page reads it: Book links on Home and in the header open /book only when it is served.
  const booking = await readSiteBooking(space.id)
  const bookPage = pageSlug === SITE_BOOK_SLUG && booking.takesBookings
  if (!contactPage && !bookPage && !hasPage(space.preferences, pageSlug)) notFound()

  // Stamp the tenant so any block that resolves its rows from the active Space reads THIS one, the same
  // line the public page carries.
  setActiveSpace(space)
  const origin = appOrigin()
  const home = pageSlug === HOME_SLUG
  const homeHref = siteHref(siteBase, HOME_SLUG)
  const pages = readProfilePages(space.preferences)
  const tagline = await readTagline(space.id)
  const siteLinks: SiteLinkMap = {
    origin,
    slug: space.slug,
    siteBase,
    pages: pages.map((p) => p.slug),
    contactHref: hasContact ? siteHref(siteBase, SITE_CONTACT_SLUG) : null,
    bookHref: booking.takesBookings ? siteHref(siteBase, SITE_BOOK_SLUG) : null,
    email: readProfileData(space.preferences).email?.trim() || null,
  }
  const cta = siteCta(space, siteLinks)
  const pageLinks = pages
    .filter((p) => p.slug !== HOME_SLUG)
    .map((p) => ({ href: siteHref(siteBase, p.slug), label: p.label }))
  if (hasContact) pageLinks.push({ href: siteHref(siteBase, SITE_CONTACT_SLUG), label: 'Contact' })

  // Home is the house theme (components/sites/house-home.tsx) over the operator's own Home blocks; a
  // custom page renders its own page doc the way the profile renders it, inside the same chrome.
  const model = home
    ? await buildHouseHome({
        space,
        grid: profileGrid(space.preferences),
        brandName,
        tagline,
        origin,
        links: siteLinks,
        cta,
        // A block the theme does not style keeps the Space page's own render (same component, same grid).
        renderRow: (row) => <SpaceProfileModules space={toProfileContext(space)} grid={row} />,
      })
    : null
  const contactModel = contactPage ? buildHouseContact({ space, grid: profileGrid(space.preferences), links: siteLinks, cta }) : null
  const links = [...(model?.nav ?? []), ...pageLinks]
  // The site's own entity, on its own origin: the root layout only carries Frequency's Organization.
  const entity = siteEntitySchema({
    type: space.type,
    name: brandName,
    url: siteBaseUrl(space.slug, await boundSiteDomain(space), origin),
    description: siteDescription(space, brandName, HOME_SLUG) ?? null,
    images: [space.coverImageUrl, space.brandLogoUrl],
  })

  return (
    // The Space's PAGE THEME rides the same wrapper as the accent (ADR-578), so the site wears the
    // owner's accent and faces rather than the default Frequency look.
    <AccentScope vars={accentVars} theme={theme}>
      <JsonLd data={entity} />
      <SiteChrome
        brandName={brandName}
        homeHref={homeHref}
        links={links}
        cta={cta}
        themeFonts={hasChosenTheme(space.preferences)}
      >
        {model ? (
          <HouseHome model={model} />
        ) : contactModel ? (
          <>
            <h1 className="sr-only">Contact {brandName}</h1>
            {contactModel.blocks.map((b, i) => (
              <HouseBlock key={b.key} block={b} first={i === 0} />
            ))}
          </>
        ) : bookPage && booking ? (
          <div className={`${SITE_CONTAINER} pb-16 pt-28 sm:pb-24`}>
            <h1 className="hs-h2">Book a time with {brandName}</h1>
            <div className="mt-10">
              <SiteBooking
                spaceId={space.id}
                slug={space.slug}
                services={booking.services}
                timezone={booking.timezone}
              />
            </div>
          </div>
        ) : (
          <div className={`${SITE_CONTAINER} pb-16 pt-28 sm:pb-24`}>
            <h1 className="hs-h2">{pages.find((p) => p.slug === pageSlug)?.label ?? brandName}</h1>
            <div className="mt-10">
              <Suspense fallback={<ProfileBodySkeleton />}>
                <SpaceLanding slug={space.slug} pageSlug={pageSlug} anonymous />
              </Suspense>
            </div>
          </div>
        )}
      </SiteChrome>
    </AccentScope>
  )
}

/** A site page's meta description: the website intro (the line the hero leads with), else the Space
 *  tagline. The Contact and Book pages say what they are for, so they never repeat Home's. */
function siteDescription(space: Space, brandName: string, pageSlug: string): string | undefined {
  const intro = readSiteHero(space.preferences).tagline ?? space.tagline?.trim() ?? ''
  const line = intro ? withoutAccentMarks(intro) : ''
  if (pageSlug === SITE_CONTACT_SLUG) return line ? `Contact ${brandName}. ${line}` : `Contact ${brandName}.`
  if (pageSlug === SITE_BOOK_SLUG) return line ? `Book a time with ${brandName}. ${line}` : `Book a time with ${brandName}.`
  return line || undefined
}

/** The Space's own header button (preferences.headerCta, else its type's default), pointed at the website:
 *  Book opens the site's Contact form, never Frequency (siteLocalHref). An owner's link to another site
 *  stays as they set it. */
function siteCta(space: Space, links: SiteLinkMap): { label: string; href: string; external: boolean } | null {
  const resolved = resolveHeaderCta(
    readHeaderCtaPreference(space.preferences),
    `/spaces/${space.slug}`,
    defaultPrimaryCtaLabel(space.type),
  )
  const to = siteLocalHref(resolved.href, links)
  return to ? { label: resolved.label, ...to } : null
}

/** Whether the owner picked a page theme (preferences.theme). Unset, the site wears the house faces. */
function hasChosenTheme(prefs: unknown): boolean {
  return !!prefs && typeof prefs === 'object' && typeof (prefs as Record<string, unknown>).theme === 'string'
}

/** The operator's saved Home arrangement, read exactly as the public page reads it. FAIL-SAFE: a
 *  malformed or absent node parses to null, and `?? {}` keeps the grid truthy so the renderer resolves
 *  the kind's starter layout instead of its flat fallback. */
function profileGrid(prefs: unknown): EntityLayout {
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  return parseEntityLayout(rawLayout) ?? {}
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
          className={buttonClasses('primary', 'md', 'mt-8')}
        >
          Visit {brandName} on Frequency
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </main>
  )
}
