// THE EXTERNAL WEBSITE PUBLISH FLAG (ADR-508 U4-B). PURE + framework-independent, so it is trivially
// testable and safe to import on the public render path, the metadata resolve, and the manage panel.
//
// A Space's external micro-site (/sites/<slug>) is FAIL-CLOSED: it only renders when the operator has
// explicitly published it, on TOP of the network-visibility gate. This reader answers "is the website
// published?" off the preferences blob. FAIL-SAFE false: an absent / malformed / non-boolean value is
// treated as NOT published, so a bad row keeps the site private rather than leaking it.

/** Is the Space's external website explicitly published? Only a literal `true` at
 *  `preferences.websitePublished` counts; everything else (absent, a truthy string, a malformed blob)
 *  reads as false so the public route 404s by default. */
export function readWebsitePublished(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false
  return (preferences as Record<string, unknown>).websitePublished === true
}

// THE WEBSITE HEADLINE (LIVE-832). The website hero can say something different from the Space page
// header: the page header shows the Space's name and a short line (preferences.hero), while the website
// leads with a marketing headline and a longer intro. Both live in `preferences.siteHero`, sparse; a blank
// field falls back to the Hero settings, so a Space that never sets them renders exactly as before.
// `*word*` marks in the headline set the accent italic on the website (lib/sites/house-theme.ts).

//
// The hero can also carry its own eyebrow (the small line above the headline) and its own two buttons
// (LIVE-865, owner ask 2026-10-07 "have the eyebrow, title, subtitle or whatever is available"). A button
// is a label plus a link the owner set, made a website link at render (siteLocalHref): a Space page path
// becomes the site's page. A button with no label or no link is dropped; unset, the hero keeps the header
// button and the steps link it always had, so a Space that never sets them renders exactly as before.

export const MAX_SITE_HERO_HEADING = 200
export const MAX_SITE_HERO_TAGLINE = 400
export const MAX_SITE_HERO_EYEBROW = 120
export const MAX_SITE_HERO_BUTTON = 60
const MAX_SITE_HERO_HREF = 500

/** A hero button the owner set: what it says and where it goes (a Space path, a site anchor or a web URL). */
interface SiteHeroButton {
  label: string
  href: string
}

/** The website-only hero copy at `preferences.siteHero`. Absent fields fall back to the Hero settings. */
export interface SiteHero {
  eyebrow?: string
  heading?: string
  tagline?: string
  action?: SiteHeroButton
  secondary?: SiteHeroButton
}

function siteHeroText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().slice(0, max).trim()
  return v.length ? v : undefined
}

/** Read the website headline + intro off a raw preferences blob. Tolerant of any shape: a malformed
 *  node or field is dropped, never thrown. PURE. */
export function readSiteHero(preferences: unknown): SiteHero {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {}
  const node = (preferences as Record<string, unknown>).siteHero
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {}
  const n = node as Record<string, unknown>
  const out: SiteHero = {}
  const eyebrow = siteHeroText(n.eyebrow, MAX_SITE_HERO_EYEBROW)
  if (eyebrow) out.eyebrow = eyebrow
  const heading = siteHeroText(n.heading, MAX_SITE_HERO_HEADING)
  if (heading) out.heading = heading
  const tagline = siteHeroText(n.tagline, MAX_SITE_HERO_TAGLINE)
  if (tagline) out.tagline = tagline
  const action = siteHeroButton(n.action)
  if (action) out.action = action
  const secondary = siteHeroButton(n.secondary)
  if (secondary) out.secondary = secondary
  return out
}

function siteHeroButton(raw: unknown): SiteHeroButton | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const b = raw as Record<string, unknown>
  const label = siteHeroText(b.label, MAX_SITE_HERO_BUTTON)
  const href = siteHeroText(b.href, MAX_SITE_HERO_HREF)
  if (!label || !href || /\s/.test(href)) return undefined
  // A site path, an anchor, or a web or mail address; anything else (javascript:, data:) is dropped here
  // and again by siteLocalHref at render.
  if (!/^(\/(?!\/)|#|https?:\/\/|mailto:)/i.test(href)) return undefined
  return { label, href }
}

/** The next preferences blob for a website headline change. Only the `siteHero` node is written; an
 *  all-empty node is removed (back to the Hero settings). PURE. */
export function nextSiteHeroPreferences(current: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const clean = readSiteHero({ siteHero: input })
  if (!Object.keys(clean).length) {
    const { siteHero: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, siteHero: clean }
}
