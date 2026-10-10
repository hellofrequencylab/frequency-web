import type { ReactNode } from 'react'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { appOrigin } from '@/lib/sites/host'
import { MENSWORK_SEASON_INFO, type MensworkSeason } from '@/lib/theme/menswork'
import { dateLabel } from '@/lib/sites/menswork-page'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { MENSWORK_PAGE_CSS } from './menswork-page-css'
import { HouseHeader, type HouseHeaderLink, type SiteLogoMode } from './house-header'
import { SiteFooterAdmin, type SiteAdminNavLink } from './site-admin-bar'

// THE WEBSITE CHROME, house theme (owner ask 2026-10-07: the "Daniel Tyack Site v4" design is the default
// look of every Space website). A published Space website is the Space's own pages without any Frequency
// app chrome:
//
//   · HEADER (header handoff v5, components/sites/house-header.tsx): a frosted bar, sticky, 12px from the
//     top. The logo slot (round photo plus name by default when the Space has a logo), a one-line menu of
//     the Home sections the Space actually placed (each link labelled with that section's own eyebrow)
//     that scrolls sideways instead of wrapping, and the Space's own header button (its label and target
//     are the owner's, preferences.headerCta). One pill row from 940px; under it the menu takes a second
//     row. A link with `mega` opens a floating panel under the bar. The bar firms up once the page
//     scrolls (a CSS scroll timeline) and fades away when scrolling pauses.
//   · SKIN: a Space on the Menswork page theme gets the Menswork website skin layered over the house CSS
//     (components/sites/menswork-css.ts): the same sections and words in that theme's palette and shapes,
//     with the current season's accent. A skinned site also sets the Space's logo beside its name, drawn
//     as a one-colour mark in the theme's text color (a black line logo reads white on charcoal), a season
//     bar under the header (the season now and the year's four, as the design system's site strip), and a
//     fuller footer: the name, the Space's tagline and the page links.
//   · ADMIN (LIVE-862, reworked by owner asks 2026-10-08, LIVE-869: "Menu should read: Home | The Year |
//     Circles | Calendar | Retreat | About (Blue after this) | ADMIN: Executive Overview"). A skinned
//     website's one menu ends with its admin links (site-admin-bar.tsx) in the theme's blue, on every page,
//     the /admin pages included, and a blue admin section sits above the footer line. The admin pages do
//     the gating.
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

/** A header menu item: a plain link, or (with `mega`) a dropdown panel of links and a feature card. */
export type SiteLink = HouseHeaderLink

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
  logoMode,
  fadeOnPause = true,
  tagline = null,
  showBrandFooter,
  seasonNow = null,
  admin = null,
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
  /** The Space's logo. The house look sets it as a round photo beside the name (or alone, logoMode
   *  'logo'); a skinned site draws it as a one-colour mark beside the name. */
  logoUrl?: string | null
  /** The house header's logo slot: name only, round photo plus name (the default with a logo), or the
   *  logo image alone. */
  logoMode?: SiteLogoMode
  /** The house header fades away when scrolling pauses. */
  fadeOnPause?: boolean
  /** The Space's tagline, printed in a skinned site's footer. */
  tagline?: string | null
  /** Website drafts can author a full footer in any theme. Legacy sites keep their skin default. */
  showBrandFooter?: boolean
  /** A skinned site's season bar detail: the sign module now, its theme as the Space's year page names it,
   *  and the next Circle Night from the Space's own events. */
  seasonNow?: { module: string; theme: string | null; next: string | null } | null
  /** The blue admin links ending the menu, and the console link the footer's admin section adds. Only
   *  with a skin. */
  admin?: { menu: SiteAdminNavLink[]; console: string } | null
  children: ReactNode
}) {
  const adminLinks = skin ? admin : admin ? { ...admin, menu: admin.menu.filter((l) => l.label === 'Website builder') } : null
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
      <HouseHeader
        brandName={brandName}
        homeHref={homeHref}
        links={links}
        adminLinks={adminLinks?.menu ?? null}
        cta={cta}
        logoUrl={logoUrl}
        logoMode={skin ? 'name' : logoMode ?? (logoUrl ? 'avatar' : 'name')}
        skinned={!!skin}
        fadeOnPause={fadeOnPause}
      />
      {skin && <SeasonBar season={skin.season} now={seasonNow} />}

      <main id="top">{children}</main>

      {(showBrandFooter ?? !!skin) && (
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
      {adminLinks && <SiteFooterAdmin links={adminLinks.menu} console={adminLinks.console} />}
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
