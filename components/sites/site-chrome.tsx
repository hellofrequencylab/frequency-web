import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mail, MapPin, Menu, Phone } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { buttonClasses } from '@/components/ui/button'
import { HOME_SLUG, type ProfilePage } from '@/lib/spaces/profile-pages'
import { SPACE_SOCIAL_PLATFORMS, type SpaceProfileData } from '@/lib/spaces/profile-data'
import { appOrigin } from '@/lib/sites/host'
import { SITE_BOOK_ANCHOR, SITE_NAV_MAX, siteNavCss, type SiteSectionLink } from './site-nav'

// THE EXTERNAL WEBSITE CHROME (PROG-E10 phase 1, redesigned 2026-10-06 on the owner's ask: a header
// menu built from the Space's own features, a real site footer, one column width throughout). A
// published Space website is the Space's own pages without any Frequency app chrome:
//
//   · HEADER: the brand, a menu of the Home sections the Space actually placed (site-nav.ts), its other
//     pages, and a Book button when it has a booking block. Sticky, so the menu is always one tap away.
//     On a phone the menu folds into a <details> disclosure, so the site still ships no client JS.
//   · FOOTER: the brand and tagline, the same links, the Space's contact details and social links, and
//     the "Frequency Partner" badge, the ONLY mention of Frequency on the site (owner ask 2026-10-06).
//
// Server Component, DAWN semantic tokens only, so the Space's accent and page theme (AccentScope, set by
// the route) paint it. Links are BASE-relative: `base` is `/sites/<slug>`, or `` on the Space's own domain
// and its free subdomain, so the same chrome serves every address without knowing which it is on.

/** The one column width the whole site shares: header, every section band and footer line up on it.
 *  66rem is the Space page's own center column (app/(public)/layout.tsx: 105rem less its two rails and
 *  gutters), so the blocks lay out exactly as they do on the Space page. */
export const SITE_CONTAINER = 'mx-auto w-full max-w-[66rem] px-4 sm:px-6'

/** A Home section band (site-page.tsx) whose blocks all rendered empty would leave a blank stripe of
 *  padding. A band holding no real content (no text, image, link, list or embed) collapses. Static. */
const SITE_BAND_CSS =
  '.site-band:not(:has(h1,h2,h3,h4,p,img,a,li,blockquote,iframe,video,form,details,button)){display:none}'

export function siteHref(base: string, pageSlug: string): string {
  if (pageSlug === HOME_SLUG) return base || '/'
  return `${base}/${pageSlug}`
}

/** A section link: a bare `#anchor` on Home, else Home's URL with the anchor. */
function sectionHref(base: string, onHome: boolean, anchor: string): string {
  return onHome ? `#${anchor}` : `${siteHref(base, HOME_SLUG)}#${anchor}`
}

/** Only an absolute http(s) URL reaches an href; anything else is dropped. */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function SiteChrome({
  brandName,
  logoUrl,
  tagline,
  pages,
  activePageSlug,
  base,
  sections,
  bookLabel,
  hasBooking,
  profile,
  children,
}: {
  brandName: string
  logoUrl: string | null
  tagline?: string | null
  pages: ProfilePage[]
  activePageSlug: string
  /** The path prefix every site link hangs off (`/sites/<slug>`, or `` on the Space's own domain). */
  base: string
  /** Home's section menu (site-nav.ts), in page order. */
  sections: SiteSectionLink[]
  /** The Book button's label (the Space type's primary call to action). */
  bookLabel: string
  hasBooking: boolean
  /** Contact details and social links for the footer. */
  profile: SpaceProfileData
  children: ReactNode
}) {
  const onHome = activePageSlug === HOME_SLUG
  const headerSections = sections.slice(0, SITE_NAV_MAX)
  const otherPages = pages.filter((p) => p.slug !== HOME_SLUG)
  const bookHref = hasBooking ? sectionHref(base, onHome, SITE_BOOK_ANCHOR) : null
  // Hide a link (or Book) whose section rendered empty. Only meaningful on Home, where the sections are.
  const sectionCss = onHome ? siteNavCss([...sections.map((s) => s.anchor), ...(hasBooking ? [SITE_BOOK_ANCHOR] : [])]) : ''
  const css = [SITE_BAND_CSS, sectionCss].filter(Boolean).join('\n')

  const links = (
    <>
      {headerSections.map((s) => (
        <li key={s.anchor} data-site-link={s.anchor}>
          <a
            href={sectionHref(base, onHome, s.anchor)}
            className="block rounded-control px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:text-text"
          >
            {s.label}
          </a>
        </li>
      ))}
      {otherPages.map((page) => {
        const active = page.slug === activePageSlug
        return (
          <li key={page.slug}>
            <Link
              href={siteHref(base, page.slug)}
              aria-current={active ? 'page' : undefined}
              className={`block rounded-control px-3 py-2 text-body-sm transition-colors ${
                active ? 'font-semibold text-primary-strong' : 'font-medium text-muted hover:text-text'
              }`}
            >
              {page.label}
            </Link>
          </li>
        )
      })}
    </>
  )
  const hasMenu = headerSections.length > 0 || otherPages.length > 0
  const book = bookHref ? (
    <a href={bookHref} data-site-link={SITE_BOOK_ANCHOR} className={buttonClasses('primary', 'md')}>
      {bookLabel}
    </a>
  ) : null

  const socials = (profile.socials ?? [])
    .map((s) => ({ url: safeUrl(s.url), label: SPACE_SOCIAL_PLATFORMS.find((p) => p.key === s.platform)?.label ?? null }))
    .filter((s): s is { url: string; label: string } => !!s.url && !!s.label)
  const email = profile.email?.trim()
  const phone = profile.phone?.trim()
  const address = profile.address?.trim()
  const hasContact = !!(email || phone || address || socials.length)

  return (
    <div data-site-root="" className="flex min-h-dvh flex-col bg-canvas text-text">
      <style>{css}</style>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className={`${SITE_CONTAINER} flex items-center justify-between gap-4 py-3`}>
          <Link href={siteHref(base, HOME_SLUG)} className="flex min-w-0 items-center gap-3">
            {logoUrl && <Avatar src={logoUrl} name={brandName} size="sm" />}
            <span className="truncate font-display text-lead font-bold tracking-tight">{brandName}</span>
          </Link>
          <div className="flex items-center gap-2">
            {hasMenu && (
              <nav aria-label={`${brandName} menu`} className="hidden md:block">
                <ul className="flex items-center gap-1">{links}</ul>
              </nav>
            )}
            {book}
            {hasMenu && (
              <details className="group relative md:hidden">
                <summary
                  aria-label="Menu"
                  className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-control text-text hover:bg-surface-elevated [&::-webkit-details-marker]:hidden"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </summary>
                <nav
                  aria-label={`${brandName} menu`}
                  className="absolute right-0 top-12 w-56 rounded-card border border-border bg-surface p-2 lift-3"
                >
                  <ul className="flex flex-col">{links}</ul>
                </nav>
              </details>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className={`${SITE_CONTAINER} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]`}>
          <div>
            <Link href={siteHref(base, HOME_SLUG)} className="flex items-center gap-3">
              {logoUrl && <Avatar src={logoUrl} name={brandName} size="sm" />}
              <span className="font-display text-lead font-bold tracking-tight">{brandName}</span>
            </Link>
            {tagline && <p className="mt-3 max-w-sm text-body-sm leading-relaxed text-muted">{tagline}</p>}
            {book && <div className="mt-5">{book}</div>}
          </div>

          {hasMenu && (
            <nav aria-label={`${brandName} footer`}>
              <h2 className="eyebrow text-muted">Explore</h2>
              <ul className="mt-3 -ml-3 flex flex-col">
                {sections.map((s) => (
                  <li key={s.anchor} data-site-link={s.anchor}>
                    <a
                      href={sectionHref(base, onHome, s.anchor)}
                      className="block rounded-control px-3 py-1.5 text-body-sm text-text transition-colors hover:text-primary-strong"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
                {otherPages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={siteHref(base, page.slug)}
                      className="block rounded-control px-3 py-1.5 text-body-sm text-text transition-colors hover:text-primary-strong"
                    >
                      {page.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {hasContact && (
            <div>
              <h2 className="eyebrow text-muted">Get in touch</h2>
              <ul className="mt-3 flex flex-col gap-2 text-body-sm text-text">
                {address && (
                  <li className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span>{address}</span>
                  </li>
                )}
                {phone && (
                  <li className="flex gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-primary-strong">
                      {phone}
                    </a>
                  </li>
                )}
                {email && (
                  <li className="flex gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a href={`mailto:${email}`} className="break-all hover:text-primary-strong">
                      {email}
                    </a>
                  </li>
                )}
              </ul>
              {socials.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
                  {socials.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} rel="noopener noreferrer" target="_blank" className="text-muted hover:text-text">
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border">
          <div className={`${SITE_CONTAINER} flex flex-wrap items-center justify-between gap-3 py-5 text-body-sm text-muted`}>
            <span>
              © {new Date().getFullYear()} {brandName}
            </span>
            <a
              href={appOrigin()}
              className="inline-flex items-center gap-2 rounded-control px-2 py-1 font-medium transition-colors hover:text-text"
            >
              <Image src="/icons/icon.svg" alt="" width={20} height={20} unoptimized />
              Frequency Partner
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
