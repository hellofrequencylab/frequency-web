// THE WILDHEART THEME (owner brief 2026-10-12, the Wildheart design handoff). PURE. This module is the
// theme's COLOR, SHAPE and TEXTURE DATA and the rules that read it; components/sites/wildheart-css.ts is how
// the website wears it. It is the third site theme beside Frequency and Bold (lib/theme/site-style.ts): a
// STOCK theme in the Frequency library, so every word it ships is generic (empowerment, no program facts).
//
// Two halves, like Bold (lib/theme/menswork.ts):
//   · ON THE SPACE PAGE a theme is typography only (lib/theme/space-themes.ts). Wildheart's Space page wears
//     the Classic font set (a serif over a serif); its own faces load only on the website.
//   · ON THE SPACE'S WEBSITE it is the whole look: parchment and vellum grounds, one violet that stays all
//     year, madder and blush for warmth, the shared season palette (fill and ink pairs, the same four as
//     Bold), petal corners with one tucked bottom-right corner, arches for photos, grain and slow gradients,
//     one violet ink for every symbol. The website re-points the DAWN tokens inside its own root, so every
//     kit component and Space block follows.
//
// THE SPACE'S OWN STYLES STILL WIN. A brand accent the owner picked replaces the violet; an unset accent
// leaves the theme's violet. Every word still comes from the Space's fields.
//
// Rules the design system sets and this module keeps (the handoff's exact values are final): never pure
// black or white; text on a violet or madder fill is vellum (vellum on violet 6.57:1, on madder 5.33:1);
// text on a season fill is ink (ink on winter 5.44:1, spring 5.78:1, summer 6.84:1, fall 5.02:1); season
// text on light grounds is the season's ink; link text is the violet text shade (5.92:1 on parchment);
// the petal radii are 14 / 24 / 40 with the tucked corner at 4 / 6 / 8; the arch is 999px 999px 24px 24px;
// motion is breath-paced (200 / 320 / 600ms, a 5s breath, one ease curve), no bounce, no scale on press.
// The ratios are measured by lib/theme/wildheart.test.ts.

import { HEX_ACCENT, contrastRatio, strongShades, type AccentVars } from '@/lib/spaces/accent'
import type { MensworkSeason } from '@/lib/theme/menswork'

/** The Wildheart palette: 7 neutrals, the violet set, the two warm secondaries. Light is the only mode. */
export const WILDHEART_PALETTE = {
  parchment: '#F5EEE2',
  vellum: '#FBF7EF',
  aged: '#EDE3D3',
  hairline: '#E2D6C3',
  muted: '#7D6D62',
  secondary: '#5E5048',
  ink: '#3A2E29',
  violet: '#6E4D96',
  violetPressed: '#5A3D7E',
  violetText: '#654590',
  lavender: '#D9CBE6',
  mist: '#ECE4F1',
  nightshade: '#2E2138',
  madder: '#94505E',
  madderSoft: '#F0DEDA',
  blush: '#EBD3C8',
  blushDeep: '#B9786A',
} as const

export type WildheartSeason = MensworkSeason

/** The four seasons, shared with Bold as fill / ink pairs: the fill for chips, tracks and shapes, the ink
 *  for season text on light grounds. Each season's name and theme line are the theme's, not a program's. */
export const WILDHEART_SEASONS: Record<WildheartSeason, { name: string; theme: string; fill: string; ink: string; gradient: string }> = {
  winter: { name: 'Winter', theme: 'Rest and root', fill: '#A3AEDC', ink: '#46518A', gradient: 'linear-gradient(160deg,#C4CBEA 0%,#A3AEDC 100%)' },
  spring: { name: 'Spring', theme: 'Rise', fill: '#9DBA86', ink: '#4C6B37', gradient: 'linear-gradient(160deg,#C0D4AF 0%,#9DBA86 100%)' },
  summer: { name: 'Summer', theme: 'Bloom', fill: '#D8B35E', ink: '#7A5A16', gradient: 'linear-gradient(160deg,#E8CF94 0%,#D8B35E 100%)' },
  fall: { name: 'Fall', theme: 'Wild', fill: '#CC8B74', ink: '#8A4630', gradient: 'linear-gradient(160deg,#E2B4A2 0%,#CC8B74 100%)' },
}

export const WILDHEART_SEASON_ORDER: readonly WildheartSeason[] = ['winter', 'spring', 'summer', 'fall']

const P = WILDHEART_PALETTE

/** The fill gradients: every primary surface carries a slow light-to-deep pull (160 degrees). */
const GRADIENTS = {
  violet: 'linear-gradient(160deg,#7D5BA8 0%,#6E4D96 45%,#5A3D7E 100%)',
  violetPressed: 'linear-gradient(160deg,#6A4B92 0%,#5A3D7E 100%)',
  madder: 'linear-gradient(160deg,#A6606E 0%,#94505E 50%,#7E4150 100%)',
  lavender: 'linear-gradient(160deg,#ECE4F1 0%,#D9CBE6 100%)',
  vellum: 'linear-gradient(175deg,#FDFAF4 0%,#F7F1E6 100%)',
  dusk: 'linear-gradient(180deg,#ECE4F1 0%,#F3E7E2 55%,#F5EEE2 100%)',
  nightshade: 'linear-gradient(160deg,#47335A 0%,#2E2138 100%)',
  twilight: 'linear-gradient(170deg,#8A68B4 0%,#6E4D96 45%,#94505E 100%)',
  blush: 'linear-gradient(160deg,#F3E2DA 0%,#EBD3C8 100%)',
  opal: 'conic-gradient(from 200deg at 60% 40%,#ECE4F1,#F0DEDA,#EFE6CF,#E3EBDA,#E3E6F3,#ECE4F1)',
} as const

/** The textures: low contrast, felt more than seen. Grain goes over every large field. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .23 0 0 0 0 .18 0 0 0 0 .16 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const FIBRE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012 .09' numOctaves='2' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .3 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`
const SMOKE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.004 .012' numOctaves='4' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .43 0 0 0 0 .30 0 0 0 0 .59 0 0 0 .32 -.08'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E")`
const STARS = 'radial-gradient(1px 1px at 12% 18%,rgba(101,69,144,.55),transparent 60%),radial-gradient(1.5px 1.5px at 38% 62%,rgba(101,69,144,.45),transparent 60%),radial-gradient(1px 1px at 71% 27%,rgba(148,80,94,.5),transparent 60%),radial-gradient(1px 1px at 86% 78%,rgba(101,69,144,.5),transparent 60%),radial-gradient(2px 2px at 55% 12%,rgba(216,179,94,.6),transparent 60%),radial-gradient(1px 1px at 22% 86%,rgba(101,69,144,.4),transparent 60%)'
const WASHES = {
  violet: 'radial-gradient(60% 50% at 20% 25%,rgba(217,203,230,.55),transparent 70%)',
  madder: 'radial-gradient(50% 45% at 80% 70%,rgba(240,222,218,.7),transparent 70%)',
  sage: 'radial-gradient(55% 50% at 70% 20%,rgba(157,186,134,.18),transparent 70%)',
  moon: 'radial-gradient(40% 40% at 50% 35%,rgba(236,228,241,.9),transparent 70%)',
  honey: 'radial-gradient(45% 45% at 15% 85%,rgba(216,179,94,.14),transparent 70%)',
  blush: 'radial-gradient(50% 50% at 50% 100%,rgba(235,211,200,.6),transparent 70%)',
} as const
const VEIL = 'linear-gradient(180deg,rgba(251,247,239,0) 0%,rgba(251,247,239,.85) 100%)'

/** The shapes: petal radii with one tucked bottom-right corner, pills for tags, arches for images. */
export const WILDHEART_SHAPE = {
  petalSm: '14px 14px 4px 14px',
  petalMd: '24px 24px 6px 24px',
  petalLg: '40px 40px 8px 40px',
  arch: '999px 999px 24px 24px',
  pill: '999px',
} as const

/** Breath-paced motion: three durations, one ease, a five second breath. */
const WILDHEART_MOTION = { fast: '200ms', base: '320ms', slow: '600ms', breath: '5s', ease: 'cubic-bezier(.22,.7,.2,1)' } as const

/** The Space's `--color-primary*` family on a Wildheart website. No accent set, or a DAWN token accent: the
 *  theme's violet with vellum text. A hex the owner picked: that hex, with a measured link shade and a label
 *  color that reads on it (ink when it clears AA, else vellum). */
export function wildheartAccentVars(brandAccent: string | null | undefined): AccentVars | null {
  const accent = brandAccent?.trim() || null
  if (!accent || !HEX_ACCENT.test(accent)) {
    return {
      '--color-primary': P.violet,
      '--color-primary-hover': P.violet,
      '--color-primary-strong': P.violetText,
      '--color-primary-bg': P.mist,
      '--color-text-on-primary': P.vellum,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': accent,
    '--color-primary-strong': strongShades(accent).dark,
    '--color-primary-bg': `color-mix(in srgb, ${accent} 14%, transparent)`,
    '--color-text-on-primary': contrastRatio(P.ink, accent) >= 4.5 ? P.ink : P.vellum,
  }
}

/** The theme's tokens, scoped to a website root carrying `data-house-theme="wildheart"`. The `--wh-*` set is
 *  the theme's own vocabulary (components/sites/wildheart-css.ts and the calendar blocks read only these and
 *  DAWN tokens); the `--color-*` set re-points DAWN inside the site. The `--color-primary*` family is NOT set
 *  here: it is the Space's (AccentScope, wildheartAccentVars). The faces resolve through the `--font-wh-*`
 *  variables next/font sets on the site (components/sites/wildheart-fonts.ts), never on the root layout. */
export const WILDHEART_TOKENS_CSS = `
[data-house-theme="wildheart"]{color-scheme:light;
--wh-parchment:${P.parchment};--wh-vellum:${P.vellum};--wh-aged:${P.aged};--wh-hairline:${P.hairline};--wh-muted:${P.muted};--wh-secondary:${P.secondary};--wh-ink:${P.ink};
--wh-violet:${P.violet};--wh-violet-pressed:${P.violetPressed};--wh-violet-text:${P.violetText};--wh-lavender:${P.lavender};--wh-mist:${P.mist};--wh-nightshade:${P.nightshade};
--wh-madder:${P.madder};--wh-madder-soft:${P.madderSoft};--wh-blush:${P.blush};--wh-blush-deep:${P.blushDeep};
--wh-symbol-ink:${P.violetText};--wh-symbol-line:rgba(101,69,144,.7);--wh-symbol-line-soft:rgba(101,69,144,.32);--wh-symbol-ghost:rgba(101,69,144,.2);--wh-symbol-stroke:1.5px;--wh-watermark:.07;
--wh-season-winter:${WILDHEART_SEASONS.winter.fill};--wh-season-winter-ink:${WILDHEART_SEASONS.winter.ink};--wh-season-spring:${WILDHEART_SEASONS.spring.fill};--wh-season-spring-ink:${WILDHEART_SEASONS.spring.ink};--wh-season-summer:${WILDHEART_SEASONS.summer.fill};--wh-season-summer-ink:${WILDHEART_SEASONS.summer.ink};--wh-season-fall:${WILDHEART_SEASONS.fall.fill};--wh-season-fall-ink:${WILDHEART_SEASONS.fall.ink};
--wh-season:var(--color-primary);--wh-season-ink:var(--color-primary-strong);--wh-gradient-season:${GRADIENTS.lavender};--wh-text-on-season:${P.ink};
--wh-gradient-violet:${GRADIENTS.violet};--wh-gradient-violet-pressed:${GRADIENTS.violetPressed};--wh-gradient-madder:${GRADIENTS.madder};--wh-gradient-lavender:${GRADIENTS.lavender};--wh-gradient-vellum:${GRADIENTS.vellum};--wh-gradient-dusk:${GRADIENTS.dusk};--wh-gradient-nightshade:${GRADIENTS.nightshade};--wh-gradient-twilight:${GRADIENTS.twilight};--wh-gradient-blush:${GRADIENTS.blush};--wh-gradient-opal:${GRADIENTS.opal};
--wh-gradient-winter:${WILDHEART_SEASONS.winter.gradient};--wh-gradient-spring:${WILDHEART_SEASONS.spring.gradient};--wh-gradient-summer:${WILDHEART_SEASONS.summer.gradient};--wh-gradient-fall:${WILDHEART_SEASONS.fall.gradient};
--wh-grain:${GRAIN};--wh-fibre:${FIBRE};--wh-smoke:${SMOKE};--wh-stars:${STARS};--wh-stars-size:220px 220px;--wh-veil:${VEIL};
--wh-wash-violet:${WASHES.violet};--wh-wash-madder:${WASHES.madder};--wh-wash-sage:${WASHES.sage};--wh-wash-moon:${WASHES.moon};--wh-wash-honey:${WASHES.honey};--wh-wash-blush:${WASHES.blush};
--wh-page:var(--wh-wash-violet),var(--wh-wash-madder),var(--wh-grain),${P.parchment};
--wh-shadow-soft:0 1px 2px rgba(58,46,41,.04),0 8px 28px rgba(58,46,41,.06);--wh-aura:0 0 0 1px rgba(110,77,150,.12),0 10px 30px -8px rgba(110,77,150,.35);--wh-aura-madder:0 10px 30px -8px rgba(148,80,94,.35);
--wh-petal-sm:${WILDHEART_SHAPE.petalSm};--wh-petal-md:${WILDHEART_SHAPE.petalMd};--wh-petal-lg:${WILDHEART_SHAPE.petalLg};--wh-arch:${WILDHEART_SHAPE.arch};--wh-pill:${WILDHEART_SHAPE.pill};
--wh-dur-fast:${WILDHEART_MOTION.fast};--wh-dur-base:${WILDHEART_MOTION.base};--wh-dur-slow:${WILDHEART_MOTION.slow};--wh-breath:${WILDHEART_MOTION.breath};--wh-ease:${WILDHEART_MOTION.ease};
--wh-display:var(--font-wh-fell),'IM Fell English',Georgia,serif;--wh-body:var(--font-wh-garamond),'EB Garamond',Garamond,Georgia,serif;--wh-ui:var(--font-wh-hanken),'Hanken Grotesk',system-ui,sans-serif;--wh-symbol:var(--font-wh-symbols),'Noto Sans Symbols','Noto Sans Symbols 2','Segoe UI Symbol',serif;
--wh-tracking-label:.16em;
--color-canvas:${P.parchment};--color-marketing-canvas:${P.parchment};--color-surface:${P.vellum};--color-surface-elevated:${P.aged};--color-surface-post:${P.vellum};
--color-chrome:${P.vellum};--color-chrome-border:${P.hairline};--color-chrome-hover:${P.mist};
--color-border:${P.hairline};--color-border-strong:${P.muted};
--color-text:${P.ink};--color-text-muted:${P.secondary};--color-text-subtle:${P.muted};
--color-ink:${P.nightshade};--color-ink-elevated:#47335A;--color-ink-border:#5A4870;
--color-on-ink:${P.vellum};--color-on-ink-muted:${P.lavender};--color-on-ink-subtle:${P.lavender};
--color-signal:${P.madder};--color-signal-strong:${P.madder};--color-signal-bg:${P.madderSoft};--color-text-on-signal:${P.vellum};
--color-broadcast:${P.violet};--color-broadcast-strong:${P.violetText};--color-broadcast-bg:${P.mist};--color-text-on-broadcast:${P.vellum};
--color-success:${WILDHEART_SEASONS.spring.ink};--color-success-bg:#E3EBDA;--color-text-on-success:${P.vellum};
--color-info:${P.violetText};--color-info-bg:${P.mist};
--color-warning:${WILDHEART_SEASONS.summer.ink};--color-warning-bg:#EFE6CF;--color-text-on-warning:${P.ink};
--color-danger:${P.madder};--color-danger-bg:${P.madderSoft};--color-text-on-danger:${P.vellum};
--color-focus-ring:${P.violet};
--font-display:var(--wh-display);--font-heading:var(--wh-display);--font-body:var(--wh-body);
--radius-card:${WILDHEART_SHAPE.petalMd};--radius-control:${WILDHEART_SHAPE.petalSm};--radius-cover:${WILDHEART_SHAPE.arch};--radius-pill:${WILDHEART_SHAPE.pill}}
${WILDHEART_SEASON_ORDER.map((s) => `[data-house-theme="wildheart"] [data-season="${s}"],[data-house-theme="wildheart"][data-season="${s}"]{--wh-season:var(--wh-season-${s});--wh-season-ink:var(--wh-season-${s}-ink);--wh-gradient-season:var(--wh-gradient-${s})}`).join('\n')}
`
