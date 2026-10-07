import type { ReactNode } from 'react'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { appOrigin } from '@/lib/sites/host'
import { MENSWORK_SEASON_INFO, type MensworkSeason } from '@/lib/theme/menswork'
import { dateLabel } from '@/lib/sites/menswork-page'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { MENSWORK_PAGE_CSS } from './menswork-page-css'
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
//     with the current season's accent. A skinned site also sets the Space's logo beside its name, drawn
//     as a one-colour mark in the theme's text color (a black line logo reads white on charcoal), a season
//     bar under the header (the season now and the year's four, as the design system's site strip), and a
//     fuller footer: the name, the Space's tagline and the page links.
//   · ADMIN (LIVE-862): a skinned website ends its menu with an "Admin" link to the Space's Leadership page
//     in the Frequency console, an absolute app URL. It is a clearly labelled Frequency management link (the
//     stand-alone rule allows those); the site is cached and anonymous, so it shows to every visitor and the
//     console page does the role gating.
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
  logoUrl = null,
  tagline = null,
  seasonNow = null,
  adminHref = null,
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
  /** The Space's logo, set beside the name. Only a skinned site passes one; the house look keeps the
   *  name in type. */
  logoUrl?: string | null
  /** The Space's tagline, printed in a skinned site's footer. */
  tagline?: string | null
  /** A skinned site's season bar detail: the sign module now, its theme as the Space's year page names it,
   *  and the next Circle Night from the Space's own events. */
  seasonNow?: { module: string; theme: string | null; next: string | null } | null
  /** The absolute URL of the Space's Leadership page in the Frequency console. Shown only with a skin. */
  adminHref?: string | null
  children: ReactNode
}) {
  const admin = skin && adminHref ? { href: adminHref, label: 'Admin' } : null
  return (
    <div
      data-site-root=""
      data-house-site=""
      data-house-fonts={themeFonts ? 'theme' : 'house'}
      data-house-theme={skin?.theme}
      data-season={skin?.season}
      className="hs-root"
    >
      <style>{skin ? HOUSE_CSS + MENSWORK_CSS + MENSWORK_PAGE_CSS : HOUSE_CSS}</style>
      <header className="hs-header">
        <div className="hs-pill">
          <a href={homeHref} className="hs-brand">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host
              <img src={logoUrl} alt="" className="hs-logo" />
            )}
            {brandName}
          </a>
          {(links.length > 0 || admin) && (
            <nav aria-label={`${brandName} menu`} className="hs-nav">
              {links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
              {admin && (
                <a href={admin.href} className="hs-nav-admin" title="Manage this site on Frequency">
                  {admin.label}
                </a>
              )}
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
            <HouseMenu label={`${brandName} menu`} links={links} admin={admin} />
          </div>
        </div>
      </header>
      {skin && <SeasonBar season={skin.season} now={seasonNow} />}

      <main id="top">{children}</main>

      {skin && (
        <div className="hs-footer-top">
          <div className="hs-footer-brand">
            <a href={homeHref} className="hs-brand">
              {brandName}
            </a>
            {tagline && <p>{tagline}</p>}
          </div>
          {links.length > 0 && (
            <nav aria-label={`${brandName} pages`} className="hs-footer-links">
              {links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}
      <footer className="hs-footer">
        <span>
          © {new Date().getFullYear()} {brandName}
        </span>
        <a href={appOrigin()}>Frequency Partner</a>
      </footer>
    </div>
  )
}

const SEASON_ORDER: MensworkSeason[] = ['winter', 'spring', 'summer', 'fall']

/** The Menswork season bar: the season and sign module now, in its accent, the year's four as a chevron
 *  track, and the next Circle Night. */
function SeasonBar({ season, now: detail }: { season: MensworkSeason; now: { module: string; theme: string | null; next: string | null } | null }) {
  const now = MENSWORK_SEASON_INFO[season]
  const next = detail?.next ? dateLabel(detail.next) : null
  return (
    <div className="hs-season">
      <p className="hs-season-now">
        <span>
          {now.name}
          {detail ? ` \u00b7 ${detail.module}` : ''}
        </span>{' '}
        {detail?.theme ?? now.range}
      </p>
      <ol className="hs-season-track" aria-label="The year's seasons">
        {SEASON_ORDER.map((s) => (
          <li key={s} data-season-mark={s} aria-current={s === season ? 'true' : undefined}>
            {MENSWORK_SEASON_INFO[s].name}
          </li>
        ))}
      </ol>
      {next && (
        <p className="hs-season-next">
          <span>Next Circle Night</span> {next.day}
          {next.time ? ` \u00b7 ${next.time}` : ''}
        </p>
      )}
    </div>
  )
}
