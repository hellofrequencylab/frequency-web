import type { ReactNode } from 'react'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { appOrigin } from '@/lib/sites/host'
import type { MensworkSeason } from '@/lib/theme/menswork'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { HouseMenu } from './house-menu'

// THE WEBSITE CHROME, house theme (owner ask 2026-10-07: the "Daniel Tyack Site v4" design is the default
// look of every Space website). A published Space website is the Space's own pages without any Frequency
// app chrome:
//
//   · HEADER: a floating frosted pill, sticky, 12px from the top. The brand name, a menu of the Home
//     sections the Space actually placed (each link labelled with that section's own eyebrow), and the
//     Space's own header button (its label and target are the owner's, preferences.headerCta). Under 940px
//     the menu folds into a round button (house-menu.tsx). The pill firms up once the page scrolls, with a
//     CSS scroll timeline, so the header itself needs no script.
//   · SKIN: a Space on the Menswork page theme gets the Menswork website skin layered over the house CSS
//     (components/sites/menswork-css.ts): the same sections and words in that theme's palette and shapes,
//     with the current season's accent.
//   · FOOTER: the copyright line and the "Frequency Partner" badge, the ONLY mention of Frequency on the
//     site (owner ask 2026-10-06).
//
// Every word comes from the Space. Colors are DAWN tokens, so the Space's brand accent (AccentScope) paints
// the whole site; the faces follow the Space's page theme when it chose one (HOUSE_CSS). Links are
// BASE-relative: `base` is `/sites/<slug>`, or `` on the Space's own domain and its free subdomain.

/** The column a custom page's body sits in. */
export const SITE_CONTAINER = 'mx-auto w-full max-w-[72.5rem] px-5 sm:px-8'

export function siteHref(base: string, pageSlug: string): string {
  if (pageSlug === HOME_SLUG) return base || '/'
  return `${base}/${pageSlug}`
}

export interface SiteLink {
  href: string
  label: string
}

interface SiteSkin {
  theme: 'menswork'
  season: MensworkSeason
}

export function SiteChrome({
  brandName,
  homeHref,
  links,
  cta,
  themeFonts,
  skin = null,
  children,
}: {
  brandName: string
  homeHref: string
  /** The header menu, in page order. */
  links: SiteLink[]
  /** The Space's own header button, or null. */
  cta: (SiteLink & { external: boolean }) | null
  /** True when the Space picked a page theme, so its faces replace the house serif and sans. */
  themeFonts: boolean
  /** A full website skin from the Space's page theme (only Menswork has one), with its season. */
  skin?: SiteSkin | null
  children: ReactNode
}) {
  return (
    <div
      data-site-root=""
      data-house-site=""
      data-house-fonts={themeFonts ? 'theme' : 'house'}
      data-house-theme={skin?.theme}
      data-season={skin?.season}
      className="hs-root"
    >
      <style>{skin ? HOUSE_CSS + MENSWORK_CSS : HOUSE_CSS}</style>
      <header className="hs-header">
        <div className="hs-pill">
          <a href={homeHref} className="hs-brand">
            {brandName}
          </a>
          {links.length > 0 && (
            <nav aria-label={`${brandName} menu`} className="hs-nav">
              {links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          )}
          <div className="hs-header-actions">
            {cta && (
              <a
                href={cta.href}
                className="hs-btn hs-btn-dark"
                {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {cta.label}
              </a>
            )}
            <HouseMenu label={`${brandName} menu`} links={links} />
          </div>
        </div>
      </header>

      <main id="top">{children}</main>

      <footer className="hs-footer">
        <span>
          © {new Date().getFullYear()} {brandName}
        </span>
        <a href={appOrigin()}>Frequency Partner</a>
      </footer>
    </div>
  )
}
