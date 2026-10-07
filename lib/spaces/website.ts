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

export const MAX_SITE_HERO_HEADING = 200
export const MAX_SITE_HERO_TAGLINE = 400

/** The website-only hero copy at `preferences.siteHero`. Absent fields fall back to the Hero settings. */
export interface SiteHero {
  heading?: string
  tagline?: string
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
  const heading = siteHeroText(n.heading, MAX_SITE_HERO_HEADING)
  if (heading) out.heading = heading
  const tagline = siteHeroText(n.tagline, MAX_SITE_HERO_TAGLINE)
  if (tagline) out.tagline = tagline
  return out
}

/** The next preferences blob for a website headline change. Only the `siteHero` node is written; an
 *  empty headline + intro removes it (back to the Hero settings). PURE. */
export function nextSiteHeroPreferences(current: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const clean = readSiteHero({ siteHero: input })
  if (!clean.heading && !clean.tagline) {
    const { siteHero: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, siteHero: clean }
}
