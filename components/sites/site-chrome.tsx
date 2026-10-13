import type { ReactNode } from 'react'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { appOrigin } from '@/lib/sites/host'
import { MENSWORK_SEASON_INFO, type MensworkSeason } from '@/lib/theme/menswork'
import { dateLabel } from '@/lib/sites/menswork-page'
import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { MENSWORK_PAGE_CSS } from './menswork-page-css'
import { FREQUENCY_PAGE_CSS } from './frequency-page-css'
import { WILDHEART_CSS } from './wildheart-css'
import { WildheartSubBar } from './wildheart-now-line'
import { WildheartInkDefs, WhLogoMark, WhOrnament } from './wildheart-symbols'
import { sky } from '@/lib/theme/astrology-wheel'
import type { SiteFooter } from '@/lib/sites/site-footer'
import { SITE_LOOK_CSS } from './site-look-css'
import type { SiteLook } from '@/lib/theme/site-style'
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

/** A full website skin: Bold (the Menswork skin) or Wildheart, each with the season now. The Wildheart skin
 *  layers over the house look AND the Frequency page sections (light grounds, DAWN tokens re-pointed), then
 *  draws its own date line under the header (components/sites/wildheart-now-line.tsx). */
interface SiteSkin {
  theme: 'menswork' | 'wildheart'
  season: MensworkSeason
}

function skinCss(skin: SiteSkin | null): string {
  if (!skin) return HOUSE_CSS
  if (skin.theme === 'wildheart') return HOUSE_CSS + FREQUENCY_PAGE_CSS + WILDHEART_CSS
  return HOUSE_CSS + MENSWORK_CSS + MENSWORK_PAGE_CSS
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
  look = {},
  member = null,
  footer = null,
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
   *  and the next Circle Night from the Space's own events. On Wildheart, `module` is the next event's
   *  title and `next` its start, for the date line's right-hand side. */
  seasonNow?: { module: string; theme: string | null; next: string | null } | null
  /** The blue admin links ending the menu, and the console link the footer's admin section adds. Only
   *  with a skin. */
  admin?: { menu: SiteAdminNavLink[]; console: string } | null
  /** The owner's global styles that differ from the theme's own (siteLookOverrides, ADR-1728). */
  look?: Partial<Pick<SiteLook, 'corners' | 'spacing' | 'header'>>
  /** The reader's own membership in this Space, an island beside the header button (LIVE-699). */
  member?: ReactNode
  /** The Space's own footer columns, line, note and copyright suffix (lib/sites/site-footer.ts), or null
   *  for the skin's default footer. */
  footer?: SiteFooter | null
  children: ReactNode
}) {
  const adminLinks = skin ? admin : admin ? { ...admin, menu: admin.menu.filter((l) => l.label === 'Website builder') } : null
  const wild = skin?.theme === 'wildheart'
  // The Wildheart header is the handoff's: a fixed bar (the row and the date line under it) with a spacer
  // that reserves its height, so nothing shifts when the date line folds away on scroll.
  const header = (
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
      member={member}
      brandMark={wild ? <WhLogoMark name={brandName} lockup="horizontal" size={46} className="wh-logo-header" /> : null}
    />
  )
  const year = new Date().getFullYear()
  return (
    <div
      data-site-root=""
      data-house-site=""
      data-house-fonts={themeFonts ? 'theme' : 'house'}
      data-house-theme={skin?.theme}
      data-season={skin?.season}
      data-sign={skin?.theme === 'wildheart' ? sky(new Date()).sign : undefined}
      data-site-corners={look.corners}
      data-site-spacing={look.spacing}
      data-site-header={look.header}
      className="hs-root"
    >
      <style>{skinCss(skin) + (look.corners || look.spacing || look.header ? SITE_LOOK_CSS : '')}</style>
      {wild && <WildheartInkDefs />}
      {wild ? (
        <>
          <div className="wh-fixed">
            {header}
            <WildheartSubBar next={seasonNow?.next ? { title: seasonNow.module, startsAt: seasonNow.next } : null} />
          </div>
          <div className="wh-fixed-spacer" aria-hidden />
        </>
      ) : (
        header
      )}
      {skin?.theme === 'menswork' && <SeasonBar season={skin.season} now={seasonNow} />}

      <main id="top">{children}</main>

      <div className={wild ? 'wh-footer-ground' : undefined}>
      {(showBrandFooter ?? !!skin) && (
        <div className="hs-footer-top" data-columns={footer?.columns.length ? '' : undefined}>
          <div className="hs-footer-brand">
            <a href={homeHref} className="hs-brand">
              {/* A Wildheart footer leads with the mark (the handoff's LogoMark at 170px). */}
              {wild ? <WhLogoMark name={brandName} size={170} className="hs-footer-logo" /> : brandName}
            </a>
            {(footer?.blurb ?? tagline) && <p>{footer?.blurb ?? tagline}</p>}
          </div>
          {footer?.columns.length ? (
            footer.columns.map((col) => (
              <nav key={col.title} aria-label={col.title} className="hs-footer-col">
                <span className="hs-footer-col-title">{col.title}</span>
                {col.links.map((l) => (
                  <a key={`${l.href}:${l.label}`} href={l.href}>
                    {l.label}
                  </a>
                ))}
              </nav>
            ))
          ) : links.length > 0 ? (
            <nav aria-label={`${brandName} pages`} className="hs-footer-links">
              {links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      )}
      {adminLinks && <SiteFooterAdmin links={adminLinks.menu} console={adminLinks.console} />}
      {wild && (
        <div className="hs-footer-ornament">
          <WhOrnament variant="star" />
        </div>
      )}
      <footer className="hs-footer">
        <span>
          © {year} {brandName}
          {footer?.suffix && (
            <>
              {' · '}
              <a href={appOrigin()}>{footer.suffix}</a>
            </>
          )}
        </span>
        {footer?.line && <span className="hs-footer-line">{footer.line}</span>}
        {footer?.note && <span className="hs-footer-note">{footer.note}</span>}
        {!footer?.suffix && <a href={appOrigin()}>Frequency Partner</a>}
      </footer>
      </div>
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
