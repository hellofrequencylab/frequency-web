// THE MENSWORK THEME (owner ask 2026-10-07: "a theme called Menswork for the theme library", built from the
// Hearts on Fire design system). PURE. This module is the theme's COLOR DATA and the rules that read it;
// components/sites/menswork-css.ts is how the website wears it.
//
// Two halves, like every Space page theme (lib/theme/space-themes.ts):
//   · ON THE SPACE PAGE it is typography only: Sofia Sans Extra Condensed caps over Barlow, with mono
//     eyebrows (the `[data-space-theme="menswork"]` block in app/globals.css). The DAWN palette stays.
//   · ON THE SPACE'S WEBSITE it is the whole look: a charcoal field, a constant teal, one seasonal accent,
//     one 60 degree chamfered corner, hairlines instead of shadows, mono labels and numbers. The website
//     re-points the DAWN tokens inside its own root, so the Space page blocks a website shows in a plain
//     band (and the Book and custom pages) wear it too.
//
// THE SPACE'S OWN STYLES STILL WIN. A brand accent the owner picked replaces the teal; an unset accent
// leaves the theme's teal. Every word still comes from the Space's fields.
//
// Rules the design system sets and this module keeps: text on a teal or accent fill is charcoal, never
// white (6.41:1; white on teal is 2.88:1); the primary fill stays teal on hover and only darkens on press
// (charcoal on the pressed teal is 4.17:1, so it is never a resting label ground); one seasonal accent at
// a time, marking "now"; no gradients, no shadows, no glows.

import { HEX_ACCENT, contrastRatio, strongShades, type AccentVars } from '@/lib/spaces/accent'

/** The Menswork palette: 7 neutrals, 3 teals. Dark is the theme's only mode. */
export const MENSWORK_PALETTE = {
  charcoal: '#111418',
  surface: '#181C22',
  raised: '#222831',
  hairline: '#2E3642',
  muted: '#7C8798',
  secondary: '#A9B2C0',
  primary: '#E9ECF1',
  teal: '#00A6C8',
  tealPressed: '#00839E',
  tealText: '#2CC4E0',
} as const

export type MensworkSeason = 'winter' | 'spring' | 'summer' | 'fall'

/** The four seasonal accents. Each passes 4.5:1 as text on charcoal and with charcoal text on it. */
export const MENSWORK_SEASONS: Record<MensworkSeason, string> = {
  winter: '#97A3D4',
  spring: '#93B57A',
  summer: '#DDB24E',
  fall: '#D4703E',
}

/** Each season's name and date window, as the season bar on a Menswork website prints them. */
export const MENSWORK_SEASON_INFO: Record<MensworkSeason, { name: string; range: string }> = {
  winter: { name: 'Winter', range: 'Dec 21 to Mar 19' },
  spring: { name: 'Spring', range: 'Mar 20 to Jun 20' },
  summer: { name: 'Summer', range: 'Jun 21 to Sep 21' },
  fall: { name: 'Fall', range: 'Sep 22 to Dec 20' },
}

/** The season a date falls in, on the program's solstice and equinox lines (HANDOFF 2026-10-07): winter
 *  Dec 21 to Mar 19, spring Mar 20 to Jun 20, summer Jun 21 to Sep 21, fall Sep 22 to Dec 20. */
export function mensworkSeason(date: Date): MensworkSeason {
  const md = (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
  if (md >= 1221 || md < 320) return 'winter'
  if (md < 621) return 'spring'
  if (md < 922) return 'summer'
  return 'fall'
}

const P = MENSWORK_PALETTE

/** The triangle lattice, 48px pitch, hairline: the theme's one background pattern. */
const LATTICE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='83.138' viewBox='0 0 48 83.138'%3E%3Cpath d='M0 0H48M0 41.569H48M0 83.138H48M0 0L48 83.138M48 0L0 83.138' fill='none' stroke='%232E3642' stroke-width='1'/%3E%3C/svg%3E")`

/** Grain, 4% monochrome noise, over the large charcoal fields. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

/** The Space's `--color-primary*` family on a Menswork website. No accent set, or a DAWN token accent (the
 *  type default, or a swatch picked for the Frequency palette): the theme's teal. A token cannot carry over
 *  because it resolves against Frequency's palette above the site root, before the theme re-points it. A
 *  hex the owner picked: that hex, with a measured light text shade and a label color that reads on it
 *  (charcoal when it clears AA, else white). */
export function mensworkAccentVars(brandAccent: string | null | undefined): AccentVars | null {
  const accent = brandAccent?.trim() || null
  if (!accent || !HEX_ACCENT.test(accent)) {
    return {
      '--color-primary': P.teal,
      '--color-primary-hover': P.teal,
      '--color-primary-strong': P.tealText,
      '--color-primary-bg': `color-mix(in srgb, ${P.teal} 14%, transparent)`,
      '--color-text-on-primary': P.charcoal,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': accent,
    '--color-primary-strong': strongShades(accent).dark,
    '--color-primary-bg': `color-mix(in srgb, ${accent} 14%, transparent)`,
    '--color-text-on-primary': contrastRatio(P.charcoal, accent) >= 4.5 ? P.charcoal : '#FFFFFF',
  }
}

/** The theme's tokens, scoped to a website root carrying `data-house-theme="menswork"`. The `--mw-*` set is
 *  the theme's own vocabulary (components/sites/menswork-css.ts reads only these and DAWN tokens); the
 *  `--color-*` set re-points DAWN inside the site so every kit component and Space block follows. The
 *  `--color-primary*` family is NOT set here: it is the Space's (AccentScope, mensworkAccentVars). */
export const MENSWORK_TOKENS_CSS = `
[data-house-theme="menswork"]{color-scheme:dark;
--mw-charcoal:${P.charcoal};--mw-surface:${P.surface};--mw-raised:${P.raised};--mw-hairline:${P.hairline};
--mw-muted:${P.muted};--mw-secondary:${P.secondary};--mw-text:${P.primary};
--mw-pressed:color-mix(in srgb,var(--color-primary) 79%,black);
--mw-accent:${MENSWORK_SEASONS.fall};--mw-winter:${MENSWORK_SEASONS.winter};--mw-spring:${MENSWORK_SEASONS.spring};--mw-summer:${MENSWORK_SEASONS.summer};--mw-fall:${MENSWORK_SEASONS.fall};
--mw-lattice:${LATTICE};--mw-grain:${GRAIN};
--mw-display:var(--font-sofia-xc),'Arial Narrow',sans-serif;--mw-body:var(--font-barlow),system-ui,sans-serif;--mw-mono:var(--font-plex-mono),ui-monospace,monospace;
--color-canvas:${P.charcoal};--color-marketing-canvas:${P.surface};--color-surface:${P.surface};--color-surface-elevated:${P.raised};--color-surface-post:${P.surface};
--color-chrome:${P.charcoal};--color-chrome-border:${P.hairline};--color-chrome-hover:${P.raised};
--color-border:${P.hairline};--color-border-strong:${P.muted};
--color-text:${P.primary};--color-text-muted:${P.secondary};--color-text-subtle:${P.muted};
--color-ink:${P.charcoal};--color-ink-elevated:${P.surface};--color-ink-border:${P.hairline};
--color-on-ink:${P.primary};--color-on-ink-muted:${P.secondary};--color-on-ink-subtle:${P.muted};
--color-signal:${P.teal};--color-signal-strong:${P.tealText};--color-signal-bg:color-mix(in srgb,${P.teal} 14%,transparent);--color-text-on-signal:${P.charcoal};
--color-broadcast:${P.teal};--color-broadcast-strong:${P.tealText};--color-broadcast-bg:color-mix(in srgb,${P.teal} 14%,transparent);--color-text-on-broadcast:${P.charcoal};
--color-success:${P.tealText};--color-success-bg:color-mix(in srgb,${P.teal} 14%,transparent);--color-text-on-success:${P.charcoal};
--color-info:${P.tealText};--color-info-bg:color-mix(in srgb,${P.teal} 14%,transparent);
--color-warning:${P.primary};--color-warning-bg:${P.raised};--color-text-on-warning:${P.charcoal};
--color-danger:${P.primary};--color-danger-bg:${P.raised};--color-text-on-danger:${P.charcoal};
--color-focus-ring:var(--color-primary-strong);
--font-display:var(--font-sofia-xc);--font-heading:var(--font-sofia-xc);--font-body:var(--font-barlow);
--radius-card:0px;--radius-control:0px;--radius-cover:0px;--radius-pill:0px}
${(Object.keys(MENSWORK_SEASONS) as MensworkSeason[])
  .map((s) => `[data-house-theme="menswork"][data-season="${s}"]{--mw-accent:${MENSWORK_SEASONS[s]}}`)
  .join('\n')}
`
