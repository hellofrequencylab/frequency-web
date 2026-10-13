// THE WILDHEART THEME (owner brief 2026-10-12, the Wildheart design handoff; token values at tokens-v3, the
// third design pass of the same day). PURE. This module is the theme's COLOR, SHAPE and TEXTURE DATA and the
// rules that read it; components/sites/wildheart-css.ts is how the website wears it. It is the third site
// theme beside Frequency and Bold (lib/theme/site-style.ts): a STOCK theme in the Frequency library, so every
// word it ships is generic (empowerment, no program facts).
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
// TOKENS V3 (the design passes' CHANGELOG, 2026-10-12). Semantic names are the handoff's; these values moved:
// muted text #7D6D62 -> #6B5B51 (4.30:1 on parchment failed AA for small text; now 5.62:1, 5.10:1 on aged,
// and the strong input border rises with it); the madder gradient's light stop #A6606E -> #9A5461 (vellum on
// it was 4.35:1, now 5.15:1); the vellum gradient ends on the parchment token and the dusk gradient's middle
// stop is the blush gradient's light stop (no unnamed hexes inside a gradient); the pressed violet is FLAT
// (a pressed gradient read as a second hover); every gradient stop and alpha is a named token, which is what
// lets Nightshade be one override block with no component change. Added: the 128 spacing step before a
// signature moment, control heights 34 / 44 / 52 (the petal radius follows the element's HEIGHT: under 44
// sm, 44 to 120 md, over 120 lg), the lift shadow and the 2px hover rise for link cards, one focus rule (a
// 2px halo in the surface colour, then a 2px violet ring, never an outline), danger = madder (no new red),
// and the Nightshade palette under `[data-mode="nightshade"]`. NO UI sets that attribute yet: the owner has
// not ruled on a member toggle versus a device setting, so nothing here reads prefers-color-scheme.
//
// Rules the design system sets and this module keeps (the pass-1 contrast audit, measured by
// lib/theme/wildheart.test.ts with lib/spaces/accent's contrastRatio): never pure black or white; text on a
// violet or madder fill is vellum (vellum on violet 6.21:1, on its light stop 5.00:1, on pressed violet
// 8.18:1, on madder 5.51:1, on its light stop 5.15:1, on nightshade 14.13:1); text on a season fill is ink
// (ink on winter 6.02:1, spring 6.12:1, summer 6.57:1, fall 4.69:1); season text on light grounds is the
// season's ink (winter 6.49:1, spring 5.25:1, summer 5.52:1, fall 6.07:1 on parchment); link and symbol
// text is the violet text shade (6.49:1 on parchment, 7.00:1 on vellum, 4.86:1 on lavender); body ink is
// 11.36:1 on parchment, the headline nightshade 13.09:1, secondary 6.70:1, muted 5.62:1; the violet focus
// ring and the strong border clear 3:1 as graphics (5.75:1 and 6.06:1). In Nightshade: moon text on the
// page 14.92:1, the card 13.56:1, secondary 9.96:1, muted 7.23:1 (5.72:1 on the raised ground), lilac links and
// symbols 9.00:1, rose 7.91:1, every season night ink at least 8.6:1.
// The petal radii are 14 / 24 / 40 with the tucked corner at 4 / 6 / 8; the arch is 999px 999px 24px 24px;
// motion is breath-paced (200 / 320 / 600ms, a 5s breath, one ease curve, an 8px reveal rise and a 2px hover
// rise), no bounce, no scale on press, and prefers-reduced-motion zeroes every motion token in one block.

import { HEX_ACCENT, contrastRatio, strongShades, type AccentVars } from '@/lib/spaces/accent'
// The season table is a leaf (lib/theme/wildheart-seasons.ts) so the sky engine's client islands read it
// without this module's reach into lib/spaces/accent and zod; readers of the theme keep these names.
import { WILDHEART_SEASONS, WILDHEART_SEASON_ORDER, type WildheartSeason } from '@/lib/theme/wildheart-seasons'
export { WILDHEART_SEASONS, WILDHEART_SEASON_ORDER, type WildheartSeason }

/** The Wildheart palette: 7 neutrals, the violet set, the two warm secondaries, and every gradient stop
 *  named so it can be audited (tokens-v3). Light is the default mode; Nightshade is the override below. */
export const WILDHEART_PALETTE = {
  parchment: '#F5EEE2',
  vellum: '#FBF7EF',
  aged: '#EDE3D3',
  hairline: '#E2D6C3',
  muted: '#6B5B51',
  secondary: '#5E5048',
  ink: '#3A2E29',
  violet: '#6E4D96',
  violetPressed: '#5A3D7E',
  violetText: '#654590',
  violetTop: '#7D5BA8',
  lavender: '#D9CBE6',
  mist: '#ECE4F1',
  nightshade: '#2E2138',
  nightshadeTop: '#47335A',
  madder: '#94505E',
  madderTop: '#9A5461',
  madderDeep: '#7E4150',
  madderSoft: '#F0DEDA',
  blush: '#EBD3C8',
  blushTop: '#F3E2DA',
  blushDeep: '#B9786A',
} as const

/** The Nightshade palette (tokens-v3): the same violet and madder fills on a dark violet page, moon text,
 *  lilac for links and symbols, rose for the secondary accent. Season fills do not change; their inks do. */
export const WILDHEART_NIGHTSHADE = {
  page: '#1C1424',
  card: '#261C31',
  raised: '#32263F',
  hairline: '#3F3250',
  strong: '#8E8099',
  muted: '#ADA0B8',
  secondary: '#C9BDD3',
  moon: '#F0E8F2',
  witch: '#EADFF0',
  lilac: '#C7ADE8',
  lavender: '#3B2C4C',
  mist: '#30243E',
  madderTop: '#9C5664',
  rose: '#DE9AA8',
  madderSoft: '#3E2630',
  blush: '#4A3038',
  blushTop: '#56383F',
  blushDeep: '#D9A08F',
} as const

const P = WILDHEART_PALETTE
const N = WILDHEART_NIGHTSHADE

/** The fill gradients: every primary surface carries a slow light-to-deep pull (160 degrees). Every stop is
 *  a named token, so Nightshade re-points the stops and the few gradients whose shape changes. */
const GRADIENTS = {
  violet: 'linear-gradient(160deg,var(--wh-violet-top) 0%,var(--wh-violet) 45%,var(--wh-violet-pressed) 100%)',
  violetPressed: 'linear-gradient(160deg,var(--wh-violet-pressed),var(--wh-violet-pressed))',
  madder: 'linear-gradient(160deg,var(--wh-madder-top) 0%,var(--wh-madder) 50%,var(--wh-madder-deep) 100%)',
  lavender: 'linear-gradient(160deg,var(--wh-mist) 0%,var(--wh-lavender) 100%)',
  vellum: 'linear-gradient(175deg,var(--wh-vellum) 0%,var(--wh-parchment) 100%)',
  dusk: 'linear-gradient(180deg,var(--wh-mist) 0%,var(--wh-blush-top) 55%,var(--wh-parchment) 100%)',
  nightshade: 'linear-gradient(160deg,var(--wh-nightshade-top) 0%,var(--wh-nightshade) 100%)',
  twilight: 'linear-gradient(170deg,var(--wh-violet-top) 0%,var(--wh-violet) 45%,var(--wh-madder) 100%)',
  blush: 'linear-gradient(160deg,var(--wh-blush-top) 0%,var(--wh-blush) 100%)',
  opal: 'conic-gradient(from 200deg at 60% 40%,var(--wh-mist),var(--wh-madder-soft),var(--wh-aged),var(--wh-season-spring-top),var(--wh-season-winter-top),var(--wh-mist))',
} as const

/** Nightshade's own shapes for the gradients whose stops are not a simple re-point. */
const NIGHT_GRADIENTS = {
  vellum: 'linear-gradient(175deg,var(--wh-aged) 0%,var(--wh-vellum) 100%)',
  dusk: 'linear-gradient(180deg,var(--wh-lavender) 0%,var(--wh-blush) 55%,var(--wh-parchment) 100%)',
  opal: 'conic-gradient(from 200deg at 60% 40%,var(--wh-mist),var(--wh-madder-soft),var(--wh-aged),var(--wh-lavender),var(--wh-mist))',
} as const

/** The alphas: every translucent ink the system uses, declared once (tokens-v3). */
const ALPHA = {
  ink04: 'rgba(58,46,41,.04)',
  ink06: 'rgba(58,46,41,.06)',
  ink12: 'rgba(58,46,41,.12)',
  violet12: 'rgba(110,77,150,.12)',
  violet35: 'rgba(110,77,150,.35)',
  madder35: 'rgba(148,80,94,.35)',
  symbol70: 'rgba(101,69,144,.7)',
  symbol32: 'rgba(101,69,144,.32)',
  symbol20: 'rgba(101,69,144,.2)',
  lavender55: 'rgba(217,203,230,.55)',
  madderSoft70: 'rgba(240,222,218,.7)',
  sage18: 'rgba(157,186,134,.18)',
  mist90: 'rgba(236,228,241,.9)',
  blush55: 'rgba(235,211,200,.55)',
  honey14: 'rgba(216,179,94,.14)',
  starHoney: 'rgba(216,179,94,.6)',
  vellum0: 'rgba(251,247,239,0)',
  vellum85: 'rgba(251,247,239,.85)',
  vellum12: 'rgba(251,247,239,.12)',
  violet13: 'rgba(110,77,150,.13)',
  madder05: 'rgba(148,80,94,.05)',
  madder16: 'rgba(148,80,94,.16)',
  nightshade28: 'rgba(46,33,56,.28)',
  lavender75: 'rgba(217,203,230,.75)',
  moonlight50: 'rgba(255,255,255,.5)',
} as const
const NIGHT_ALPHA = {
  night25: 'rgba(14,8,20,.25)',
  night45: 'rgba(14,8,20,.45)',
  night0: 'rgba(28,20,36,0)',
  night85: 'rgba(28,20,36,.85)',
  lilac12: 'rgba(199,173,232,.12)',
  lilac35: 'rgba(199,173,232,.35)',
  lilac70: 'rgba(199,173,232,.7)',
  lilac32: 'rgba(199,173,232,.32)',
  lilac20: 'rgba(199,173,232,.2)',
  lilac25: 'rgba(199,173,232,.25)',
  violet28: 'rgba(110,77,150,.28)',
  madder22: 'rgba(148,80,94,.22)',
  rose35: 'rgba(222,154,168,.35)',
} as const

/** The textures: low contrast, felt more than seen. Grain goes over every large field; the night grain is a
 *  light noise at 5% that reads on a dark field. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .23 0 0 0 0 .18 0 0 0 0 .16 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const GRAIN_NIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .9 0 0 0 0 .85 0 0 0 0 .95 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const FIBRE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012 .09' numOctaves='2' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .3 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E")`
const SMOKE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.004 .012' numOctaves='4' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .43 0 0 0 0 .30 0 0 0 0 .59 0 0 0 .32 -.08'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E")`
const STARS = 'radial-gradient(1px 1px at 12% 18%,var(--wh-symbol-line),transparent 60%),radial-gradient(1.5px 1.5px at 38% 62%,var(--wh-symbol-line-soft),transparent 60%),radial-gradient(1px 1px at 71% 27%,var(--wh-a-madder-35),transparent 60%),radial-gradient(1px 1px at 86% 78%,var(--wh-symbol-line),transparent 60%),radial-gradient(2px 2px at 55% 12%,var(--wh-a-star-honey),transparent 60%),radial-gradient(1px 1px at 22% 86%,var(--wh-symbol-line-soft),transparent 60%)'
const WASHES = {
  violet: 'radial-gradient(60% 50% at 20% 25%,var(--wh-a-wash-violet),transparent 70%)',
  madder: 'radial-gradient(50% 45% at 80% 70%,var(--wh-a-wash-madder),transparent 70%)',
  sage: 'radial-gradient(55% 50% at 70% 20%,var(--wh-a-sage-18),transparent 70%)',
  moon: 'radial-gradient(40% 40% at 50% 35%,var(--wh-a-wash-moon),transparent 70%)',
  honey: 'radial-gradient(45% 45% at 15% 85%,var(--wh-a-honey-14),transparent 70%)',
  blush: 'radial-gradient(50% 50% at 50% 100%,var(--wh-a-wash-blush),transparent 70%)',
} as const
const VEIL = 'linear-gradient(180deg,var(--wh-a-veil-0) 0%,var(--wh-a-veil-85) 100%)'

/** The shapes: petal radii with one tucked bottom-right corner, pills for tags, arches for images. The petal
 *  is chosen by the element's HEIGHT, never its name: under 44px sm, 44 to 120px md, over 120px lg. */
export const WILDHEART_SHAPE = {
  petalSm: '14px 14px 4px 14px',
  petalMd: '24px 24px 6px 24px',
  petalLg: '40px 40px 8px 40px',
  arch: '999px 999px 24px 24px',
  pill: '999px',
} as const

/** The rhythm: 8pt, with 4 for hairline offsets, 12 for inline gaps only, and 128 before a signature
 *  moment; the page frame; the control heights that drive the petal rule. */
export const WILDHEART_SPACE = {
  steps: ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px', '96px', '128px'],
  gutter: '16px',
  gutterDesktop: '48px',
  contentMax: '1200px',
  controlSm: '34px',
  controlMd: '44px',
  controlLg: '52px',
  touchMin: '44px',
} as const

/** Breath-paced motion: three durations, one ease, a five second breath, an 8px reveal rise and a 2px
 *  hover rise. Reduced motion zeroes all of them in the token block below. */
export const WILDHEART_MOTION = { fast: '200ms', base: '320ms', slow: '600ms', breath: '5s', ease: 'cubic-bezier(.22,.7,.2,1)', rise: '8px', hoverRise: '2px' } as const

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

const SEASON_TOKENS = WILDHEART_SEASON_ORDER.map((s) => `--wh-season-${s}:${WILDHEART_SEASONS[s].fill};--wh-season-${s}-top:${WILDHEART_SEASONS[s].top};--wh-season-${s}-ink:${WILDHEART_SEASONS[s].ink}`).join(';')
const SEASON_GRADIENTS = WILDHEART_SEASON_ORDER.map((s) => `--wh-gradient-${s}:${WILDHEART_SEASONS[s].gradient}`).join(';')
const SEASON_NIGHT_INKS = WILDHEART_SEASON_ORDER.map((s) => `--wh-season-${s}-ink:${WILDHEART_SEASONS[s].inkNight}`).join(';')
const SPACE_TOKENS = WILDHEART_SPACE.steps.map((v, i) => `--wh-space-${i + 1}:${v}`).join(';')

/** The theme's tokens, scoped to a website root carrying `data-house-theme="wildheart"`. The `--wh-*` set is
 *  the theme's own vocabulary (components/sites/wildheart-css.ts and the calendar blocks read only these and
 *  DAWN tokens); the `--color-*` set re-points DAWN inside the site and reads the `--wh-*` set, so the
 *  Nightshade block re-points only `--wh-*`. The `--color-primary*` family is NOT set here: it is the
 *  Space's (AccentScope, wildheartAccentVars). The faces resolve through the `--font-wh-*` variables
 *  next/font sets on the site (components/sites/wildheart-fonts.ts), never on the root layout.
 *
 *  Three blocks: light (the default), `[data-mode="nightshade"]` (no UI sets it yet, and nothing reads
 *  prefers-color-scheme: the owner has not ruled on a member toggle versus a device setting), and the
 *  prefers-reduced-motion block that zeroes every motion token. */
export const WILDHEART_TOKENS_CSS = `
[data-house-theme="wildheart"]{color-scheme:light;
--wh-parchment:${P.parchment};--wh-vellum:${P.vellum};--wh-aged:${P.aged};--wh-hairline:${P.hairline};--wh-muted:${P.muted};--wh-secondary:${P.secondary};--wh-ink:${P.ink};--wh-border-strong:var(--wh-muted);
--wh-violet:${P.violet};--wh-violet-pressed:${P.violetPressed};--wh-violet-text:${P.violetText};--wh-violet-top:${P.violetTop};--wh-lavender:${P.lavender};--wh-mist:${P.mist};--wh-nightshade:${P.nightshade};--wh-nightshade-top:${P.nightshadeTop};--wh-witch:var(--wh-nightshade);
--wh-madder:${P.madder};--wh-madder-top:${P.madderTop};--wh-madder-deep:${P.madderDeep};--wh-madder-soft:${P.madderSoft};--wh-blush:${P.blush};--wh-blush-top:${P.blushTop};--wh-blush-deep:${P.blushDeep};--wh-secondary-accent:var(--wh-madder);
--wh-danger:var(--wh-madder);--wh-danger-soft:var(--wh-madder-soft);
--wh-symbol-ink:var(--wh-violet-text);--wh-symbol-line:${ALPHA.symbol70};--wh-symbol-line-soft:${ALPHA.symbol32};--wh-symbol-ghost:${ALPHA.symbol20};--wh-symbol-stroke:1.5px;--wh-watermark:.07;
--wh-a-ink-04:${ALPHA.ink04};--wh-a-ink-06:${ALPHA.ink06};--wh-a-ink-12:${ALPHA.ink12};--wh-a-violet-12:${ALPHA.violet12};--wh-a-violet-35:${ALPHA.violet35};--wh-a-madder-35:${ALPHA.madder35};
--wh-a-wash-violet:${ALPHA.lavender55};--wh-a-wash-madder:${ALPHA.madderSoft70};--wh-a-wash-moon:${ALPHA.mist90};--wh-a-wash-blush:${ALPHA.blush55};--wh-a-sage-18:${ALPHA.sage18};--wh-a-honey-14:${ALPHA.honey14};--wh-a-star-honey:${ALPHA.starHoney};--wh-a-veil-0:${ALPHA.vellum0};--wh-a-veil-85:${ALPHA.vellum85};
--wh-a-vellum-12:${ALPHA.vellum12};--wh-a-violet-13:${ALPHA.violet13};--wh-a-madder-05:${ALPHA.madder05};--wh-a-madder-16:${ALPHA.madder16};--wh-a-night-28:${ALPHA.nightshade28};--wh-a-lavender-75:${ALPHA.lavender75};--wh-a-moonlight:${ALPHA.moonlight50};
--wh-col:1216px;--wh-col-pad:48px;--wh-header-h:72px;--wh-header-total:116px;
${SEASON_TOKENS};
--wh-season:var(--color-primary);--wh-season-top:var(--wh-violet-top);--wh-season-ink:var(--color-primary-strong);--wh-gradient-season:${GRADIENTS.lavender};--wh-text-on-season:${P.ink};--wh-text-on-fill:${P.vellum};
--wh-gradient-violet:${GRADIENTS.violet};--wh-gradient-violet-pressed:${GRADIENTS.violetPressed};--wh-gradient-madder:${GRADIENTS.madder};--wh-gradient-lavender:${GRADIENTS.lavender};--wh-gradient-vellum:${GRADIENTS.vellum};--wh-gradient-dusk:${GRADIENTS.dusk};--wh-gradient-nightshade:${GRADIENTS.nightshade};--wh-gradient-twilight:${GRADIENTS.twilight};--wh-gradient-blush:${GRADIENTS.blush};--wh-gradient-opal:${GRADIENTS.opal};
${SEASON_GRADIENTS};
--wh-grain:${GRAIN};--wh-fibre:${FIBRE};--wh-smoke:${SMOKE};--wh-stars:${STARS};--wh-stars-size:220px 220px;--wh-veil:${VEIL};
--wh-wash-violet:${WASHES.violet};--wh-wash-madder:${WASHES.madder};--wh-wash-sage:${WASHES.sage};--wh-wash-moon:${WASHES.moon};--wh-wash-honey:${WASHES.honey};--wh-wash-blush:${WASHES.blush};
--wh-page:var(--wh-wash-violet),var(--wh-wash-madder),var(--wh-grain),var(--wh-parchment);
--wh-shadow-soft:0 1px 2px var(--wh-a-ink-04),0 8px 28px var(--wh-a-ink-06);--wh-shadow-lift:0 2px 4px var(--wh-a-ink-04),0 16px 40px var(--wh-a-ink-12);--wh-aura:0 0 0 1px var(--wh-a-violet-12),0 10px 30px -8px var(--wh-a-violet-35);--wh-aura-madder:0 10px 30px -8px var(--wh-a-madder-35);
--wh-focus-ring:var(--wh-violet);--wh-focus-halo:var(--wh-vellum);--wh-ring-focus:0 0 0 2px var(--wh-focus-halo),0 0 0 4px var(--wh-focus-ring);
--wh-petal-sm:${WILDHEART_SHAPE.petalSm};--wh-petal-md:${WILDHEART_SHAPE.petalMd};--wh-petal-lg:${WILDHEART_SHAPE.petalLg};--wh-arch:${WILDHEART_SHAPE.arch};--wh-pill:${WILDHEART_SHAPE.pill};
${SPACE_TOKENS};--wh-gutter:${WILDHEART_SPACE.gutter};--wh-gutter-desktop:${WILDHEART_SPACE.gutterDesktop};--wh-content-max:${WILDHEART_SPACE.contentMax};
--wh-control-sm:${WILDHEART_SPACE.controlSm};--wh-control-md:${WILDHEART_SPACE.controlMd};--wh-control-lg:${WILDHEART_SPACE.controlLg};--wh-touch-min:${WILDHEART_SPACE.touchMin};--wh-border-w:1px;--wh-border-w-active:2px;
--wh-dur-fast:${WILDHEART_MOTION.fast};--wh-dur-base:${WILDHEART_MOTION.base};--wh-dur-slow:${WILDHEART_MOTION.slow};--wh-breath:${WILDHEART_MOTION.breath};--wh-ease:${WILDHEART_MOTION.ease};--wh-rise-y:${WILDHEART_MOTION.rise};--wh-hover-rise:${WILDHEART_MOTION.hoverRise};
--wh-display:var(--font-wh-fell),'IM Fell English',Georgia,serif;--wh-body:var(--font-wh-garamond),'EB Garamond',Garamond,Georgia,serif;--wh-ui:var(--font-wh-hanken),'Hanken Grotesk',system-ui,sans-serif;--wh-symbol:var(--font-wh-symbols),'Noto Sans Symbols','Noto Sans Symbols 2','Segoe UI Symbol',serif;
--wh-tracking-label:.16em;--wh-tracking-display:-.005em;--wh-measure:64ch;
--color-canvas:var(--wh-parchment);--color-marketing-canvas:var(--wh-parchment);--color-surface:var(--wh-vellum);--color-surface-elevated:var(--wh-aged);--color-surface-post:var(--wh-vellum);
--color-chrome:var(--wh-vellum);--color-chrome-border:var(--wh-hairline);--color-chrome-hover:var(--wh-mist);
--color-border:var(--wh-hairline);--color-border-strong:var(--wh-border-strong);
--color-text:var(--wh-ink);--color-text-muted:var(--wh-secondary);--color-text-subtle:var(--wh-muted);
--color-ink:${P.nightshade};--color-ink-elevated:${P.nightshadeTop};--color-ink-border:#5A4870;
--color-on-ink:${P.vellum};--color-on-ink-muted:${P.lavender};--color-on-ink-subtle:${P.lavender};
--color-signal:var(--wh-secondary-accent);--color-signal-strong:var(--wh-secondary-accent);--color-signal-bg:var(--wh-madder-soft);--color-text-on-signal:${P.vellum};
--color-broadcast:var(--wh-violet);--color-broadcast-strong:var(--wh-violet-text);--color-broadcast-bg:var(--wh-mist);--color-text-on-broadcast:${P.vellum};
--color-success:var(--wh-season-spring-ink);--color-success-bg:#E3EBDA;--color-text-on-success:${P.vellum};
--color-info:var(--wh-violet-text);--color-info-bg:var(--wh-mist);
--color-warning:var(--wh-season-summer-ink);--color-warning-bg:#EFE6CF;--color-text-on-warning:${P.ink};
--color-danger:var(--wh-danger);--color-danger-bg:var(--wh-danger-soft);--color-text-on-danger:${P.vellum};
--color-focus-ring:var(--wh-focus-ring);
--font-display:var(--wh-display);--font-heading:var(--wh-display);--font-body:var(--wh-body);
--radius-card:${WILDHEART_SHAPE.petalMd};--radius-control:${WILDHEART_SHAPE.petalSm};--radius-cover:${WILDHEART_SHAPE.arch};--radius-pill:${WILDHEART_SHAPE.pill}}
${WILDHEART_SEASON_ORDER.map((s) => `[data-house-theme="wildheart"] [data-season="${s}"],[data-house-theme="wildheart"][data-season="${s}"]{--wh-season:var(--wh-season-${s});--wh-season-top:var(--wh-season-${s}-top);--wh-season-ink:var(--wh-season-${s}-ink);--wh-gradient-season:var(--wh-gradient-${s})}`).join('\n')}
[data-house-theme="wildheart"][data-mode="nightshade"]{color-scheme:dark;
--wh-parchment:${N.page};--wh-vellum:${N.card};--wh-aged:${N.raised};--wh-hairline:${N.hairline};--wh-muted:${N.muted};--wh-secondary:${N.secondary};--wh-ink:${N.moon};--wh-border-strong:${N.strong};
--wh-violet-text:${N.lilac};--wh-lavender:${N.lavender};--wh-mist:${N.mist};--wh-witch:${N.witch};
--wh-madder-top:${N.madderTop};--wh-madder-soft:${N.madderSoft};--wh-blush:${N.blush};--wh-blush-top:${N.blushTop};--wh-blush-deep:${N.blushDeep};--wh-rose:${N.rose};--wh-secondary-accent:var(--wh-rose);
--wh-danger:var(--wh-rose);
--wh-symbol-line:${NIGHT_ALPHA.lilac70};--wh-symbol-line-soft:${NIGHT_ALPHA.lilac32};--wh-symbol-ghost:${NIGHT_ALPHA.lilac20};
--wh-a-ink-04:${NIGHT_ALPHA.night25};--wh-a-ink-06:${NIGHT_ALPHA.night45};--wh-a-ink-12:${NIGHT_ALPHA.night45};--wh-a-violet-12:${NIGHT_ALPHA.lilac12};--wh-a-violet-35:${NIGHT_ALPHA.lilac35};--wh-a-madder-35:${NIGHT_ALPHA.rose35};
--wh-a-wash-violet:${NIGHT_ALPHA.violet28};--wh-a-wash-madder:${NIGHT_ALPHA.madder22};--wh-a-wash-moon:${NIGHT_ALPHA.lilac25};--wh-a-wash-blush:${NIGHT_ALPHA.madder22};--wh-a-veil-0:${NIGHT_ALPHA.night0};--wh-a-veil-85:${NIGHT_ALPHA.night85};
${SEASON_NIGHT_INKS};
--wh-season-ink:var(--wh-violet-text);
--wh-gradient-vellum:${NIGHT_GRADIENTS.vellum};--wh-gradient-dusk:${NIGHT_GRADIENTS.dusk};--wh-gradient-opal:${NIGHT_GRADIENTS.opal};
--wh-grain:${GRAIN_NIGHT};
--wh-focus-ring:var(--wh-violet-text);--wh-focus-halo:var(--wh-parchment);
--color-on-ink-muted:${N.secondary};--color-on-ink-subtle:${N.muted}}
@media (prefers-reduced-motion:reduce){[data-house-theme="wildheart"]{--wh-dur-fast:0ms;--wh-dur-base:0ms;--wh-dur-slow:0ms;--wh-breath:0s;--wh-rise-y:0px;--wh-hover-rise:0px}}
`
