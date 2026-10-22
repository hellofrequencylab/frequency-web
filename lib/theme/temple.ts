// THE TEMPLE THEME (owner ask 2026-10-22, built from the Royal Temple design system). PURE. The theme's COLOR,
// SHAPE, TYPE, DEPTH and MOTION data and the rules that read it; components/sites/temple-css.ts is how a
// website wears it. It is the fifth site theme beside Default, Bold, Wildheart and Network
// (lib/theme/site-style.ts): a STOCK theme in the Frequency library, first worn by Royal Temple, so nothing
// here names a program.
//
// The standard, "a lime-washed Mediterranean house":
//   · Plaster grounds (warm, never white), umber ink (never black), one clay (terracotta) hero color, saffron
//     only for gilding, olive for calm affirmations, aegean for the one cool note (night, water).
//   · The ARCH is the shape: a shallow dome on every photo, tier card and date stamp; the keyhole and the
//     lozenge are its portrait and wide forms. Buttons are soft rounded rectangles or pills, never sharp.
//   · Branch (the house's own display face) for numerals and big lines, Marcellus for titles, Jost 300 for body
//     and UI, Cormorant Garamond italic for quotes. Small caps labels are set wide (.18em, eyebrows .28em).
//   · Warm, low-contrast shadows (sun through a shutter), fine sand and grit textures, watermark motifs bled
//     off one edge a section. Everything drifts: one ease, no bounce, reduced motion stops it.
//
// Values are the design system's tokens (colors, typography, spacing, radii, elevation, motion, textures).
// Two measured deviations, both the least shift that clears AA (lib/theme/temple.test.ts):
//   · the label on the clay button is white, not #FFF6EE (4.27:1 -> 4.56:1);
//   · muted body text is #7C624D, not umber-500 #8C7059 (3.69:1 on the sunk band -> 4.55:1). umber-500 stays
//     for decoration (rules, icons, placeholder).

import { HEX_ACCENT, contrastRatio, strongShades, type AccentVars } from '@/lib/spaces/accent'

/** The palette, as the design system's colors.css names it. */
export const TEMPLE_PALETTE = {
  plaster50: '#FDFAF3', plaster100: '#F8F0E2', plaster200: '#F2E5CF', plaster300: '#E7D4B6', plaster400: '#D8BE99', card: '#FFFCF4',
  umber900: '#231710', umber800: '#35251A', umber700: '#4A3527', umber600: '#6B5040', umber500: '#8C7059', umber400: '#B29A87',
  clay700: '#7E3A22', clay600: '#9C4A2C', clay500: '#B75C3C', clay400: '#CC7D5E', clay300: '#E2A98F', clay100: '#F3DDD1',
  saffron600: '#B2792A', saffron500: '#D29A3B', saffron400: '#E0B463', saffron200: '#F0D9A8',
  olive700: '#414627', olive600: '#565C33', olive500: '#6E7448', olive300: '#A2A67E', olive100: '#DFE0CB',
  aegean800: '#1D4451', aegean600: '#2F6E80', aegean500: '#3D8899', aegean300: '#8FBAC3', aegean100: '#D9E7EA',
  fig700: '#4A2334', fig500: '#7A4257', fig300: '#B08496',
  danger: '#A6392A', dangerBg: '#F5DBD5',
} as const

/** The clay, its text shade on plaster, and the label that reads on it. */
export const TEMPLE_ACCENT = { accent: TEMPLE_PALETTE.clay500, text: TEMPLE_PALETTE.clay600, on: '#FFFFFF', mutedText: '#7C624D' } as const

/** The four seasons the year turns through (the design's contract: winter aegean, spring olive, summer saffron, fall clay). */
export const TEMPLE_SEASONS = { winter: TEMPLE_PALETTE.aegean600, spring: TEMPLE_PALETTE.olive500, summer: TEMPLE_PALETTE.saffron500, fall: TEMPLE_PALETTE.clay500 } as const

/** The Space's `--color-primary*` family on a Temple website. No accent, or the clay itself: the measured clay,
 *  its hover and text shade and the white label. Any other hex: that hex with a measured link shade and a label
 *  that reads on it (umber ink when it clears AA, else white). */
export function templeAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === TEMPLE_ACCENT.accent) {
    return {
      '--color-primary': TEMPLE_ACCENT.accent,
      '--color-primary-hover': TEMPLE_PALETTE.clay600,
      '--color-primary-strong': TEMPLE_ACCENT.text,
      '--color-primary-bg': TEMPLE_PALETTE.clay100,
      '--color-text-on-primary': TEMPLE_ACCENT.on,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': `color-mix(in srgb, ${accent} 86%, black)`,
    '--color-primary-strong': strongShades(accent).light,
    '--color-primary-bg': `color-mix(in srgb, ${accent} 14%, ${TEMPLE_PALETTE.plaster100})`,
    '--color-text-on-primary': contrastRatio(TEMPLE_PALETTE.umber900, accent) >= 4.5 ? TEMPLE_PALETTE.umber900 : '#FFFFFF',
  }
}

const P = TEMPLE_PALETTE

/** The arch family, in percentages on both axes (a px radius larger than the box flattens the dome). */
const TEMPLE_SHAPE = {
  arch: '50% 50% 6px 6px / 42% 42% 6px 6px',
  archSoft: '50% 50% 16px 16px / 34% 34% 16px 16px',
  archTall: '50% 50% 6px 6px / 60% 60% 6px 6px',
  keyhole: '50% 50% 50% 50% / 46% 46% 46% 46%',
  lozenge: '46% 46% 46% 46% / 50% 50% 50% 50%',
} as const

const T = '/sites/temple'

/** Everything the skin reads. One scope, one block: every color, size, shadow and motion value is a `--tp-*`
 *  token here, and temple-css.ts uses these and the DAWN `--color-*` set only. */
const TEMPLE_VARS = `
--tp-plaster-50:${P.plaster50};--tp-plaster-100:${P.plaster100};--tp-plaster-200:${P.plaster200};--tp-plaster-300:${P.plaster300};--tp-plaster-400:${P.plaster400};--tp-card:${P.card};
--tp-umber-900:${P.umber900};--tp-umber-800:${P.umber800};--tp-umber-700:${P.umber700};--tp-umber-600:${P.umber600};--tp-umber-500:${P.umber500};--tp-umber-400:${P.umber400};--tp-muted:${TEMPLE_ACCENT.mutedText};
--tp-clay-700:${P.clay700};--tp-clay-600:${P.clay600};--tp-clay-500:${P.clay500};--tp-clay-400:${P.clay400};--tp-clay-300:${P.clay300};--tp-clay-100:${P.clay100};
--tp-saffron-600:${P.saffron600};--tp-saffron-500:${P.saffron500};--tp-saffron-400:${P.saffron400};--tp-saffron-200:${P.saffron200};
--tp-olive-700:${P.olive700};--tp-olive-600:${P.olive600};--tp-olive-500:${P.olive500};--tp-olive-300:${P.olive300};--tp-olive-100:${P.olive100};
--tp-aegean-800:${P.aegean800};--tp-aegean-600:${P.aegean600};--tp-aegean-500:${P.aegean500};--tp-aegean-300:${P.aegean300};--tp-aegean-100:${P.aegean100};
--tp-fig-700:${P.fig700};--tp-fig-500:${P.fig500};--tp-fig-300:${P.fig300};
--tp-danger:${P.danger};--tp-danger-bg:${P.dangerBg};--tp-focus:${P.saffron500};
--tp-on-clay:${TEMPLE_ACCENT.on};--tp-on-ink:${P.plaster100};
--tp-line:rgba(35,23,16,.12);--tp-rule:rgba(35,23,16,.22);--tp-line-on-ink:rgba(246,239,228,.24);--tp-veil:rgba(35,23,16,.06);--tp-veil-ink:rgba(253,250,243,.06);
--tp-glass:rgba(251,247,240,.72);--tp-glass-ink:rgba(35,23,16,.44);--tp-frame-on-photo:rgba(251,247,240,.5);--tp-row-hover:rgba(255,252,244,.72);--tp-field:rgba(255,252,244,.5);
--tp-link-line:rgba(156,74,44,.35);--tp-dashed:rgba(35,23,16,.14);--tp-gloss:rgba(255,246,238,.28);--tp-gloss-ink:rgba(246,239,228,.16);
--tp-d1:0 1px 1px rgba(74,53,39,.04),0 2px 6px -2px rgba(74,53,39,.09);
--tp-d2:0 1px 2px rgba(74,53,39,.05),0 10px 24px -12px rgba(112,66,40,.20);
--tp-d3:0 2px 4px rgba(74,53,39,.05),0 26px 48px -24px rgba(112,66,40,.30);
--tp-elev-xs:0 1px 2px rgba(74,53,39,.06);--tp-elev-sm:0 2px 6px rgba(74,53,39,.07);--tp-elev-md:0 10px 24px -8px rgba(112,66,40,.18);
--tp-elev-lg:0 24px 54px -20px rgba(112,66,40,.26);--tp-elev-xl:0 40px 80px -32px rgba(35,23,16,.28);
--tp-inset:inset 0 1px 2px rgba(74,53,39,.10);--tp-inset-deep:inset 0 2px 6px rgba(74,53,39,.16);--tp-sunk-edge:inset 0 14px 22px -20px rgba(74,53,39,.22),inset 0 -14px 22px -20px rgba(74,53,39,.22);
--tp-btn-clay:0 1px 0 var(--tp-gloss) inset,0 2px 5px -1px rgba(112,66,40,.28),0 6px 14px -8px rgba(112,66,40,.30);
--tp-btn-clay-hover:0 1px 0 var(--tp-gloss) inset,0 3px 8px -2px rgba(112,66,40,.32),0 10px 20px -10px rgba(112,66,40,.34);
--tp-btn-ink:0 1px 0 var(--tp-gloss-ink) inset,0 2px 6px -1px rgba(35,23,16,.32),0 8px 18px -10px rgba(35,23,16,.34);
--tp-ring:0 0 0 2px var(--tp-plaster-100),0 0 0 4px var(--tp-focus);
--tp-veil-bottom:linear-gradient(to top,rgba(35,23,16,.78) 0%,rgba(35,23,16,.45) 38%,rgba(35,23,16,0) 78%);
--tp-veil-full:linear-gradient(to bottom,rgba(35,23,16,.30),rgba(35,23,16,.58));
--tp-wash-sun:radial-gradient(120% 90% at 50% -12%,rgba(224,180,99,.46),rgba(199,124,85,.12) 46%,rgba(248,240,226,0) 74%);
--tp-wash-dawn:linear-gradient(176deg,rgba(226,169,143,.28),rgba(240,217,168,.18) 44%,rgba(248,240,226,0));
--tp-wash-terracotta:linear-gradient(168deg,rgba(183,92,60,.13),rgba(210,154,59,.10) 60%,rgba(248,240,226,0));
--tp-wash-grove:linear-gradient(170deg,rgba(110,116,72,.14),rgba(240,217,168,.12) 70%,rgba(248,240,226,0));
--tp-wash-clay:linear-gradient(160deg,var(--tp-clay-500),var(--tp-clay-700));
--tp-wash-night:linear-gradient(170deg,var(--tp-aegean-800),var(--tp-umber-900));
--tp-page-glow:radial-gradient(90% 60% at 12% -6%,rgba(224,180,99,.20),rgba(248,240,226,0) 70%),radial-gradient(70% 50% at 100% 8%,rgba(183,92,60,.10),rgba(248,240,226,0) 66%);
--tp-blur:saturate(120%) blur(14px);
--tp-sand:url("${T}/textures/sand-fine.svg");--tp-grit:url("${T}/textures/grit-speck.svg");--tp-stucco:url("${T}/textures/stucco-wash.svg");
--tp-palm-fan:url("${T}/textures/palm-fan.svg");--tp-rays:url("${T}/textures/ray-fan.svg");
--tp-tex-plaster:url("${T}/textures/plaster-grain.svg");--tp-tex-contour:url("${T}/textures/contour-lines.svg");--tp-tex-linen:url("${T}/textures/tile-linen.svg");--tp-tex-terrazzo:url("${T}/textures/tile-terrazzo.svg");
--tp-pat-arch:url("${T}/textures/arch-lattice.svg");--tp-pat-arch-row:url("${T}/textures/tile-arch-row.svg");--tp-pat-star:url("${T}/textures/tile-star.svg");--tp-pat-scallop:url("${T}/textures/tile-scallop.svg");--tp-pat-wave:url("${T}/textures/tile-wave.svg");
--tp-motif-palm:url("${T}/textures/palm-frond.svg");--tp-motif-olive:url("${T}/textures/olive-sprig.svg");--tp-motif-fig:url("${T}/textures/fig-leaf.svg");--tp-motif-agave:url("${T}/textures/agave.svg");--tp-motif-sun-arc:url("${T}/textures/sun-arc.svg");--tp-motif-laurel:url("${T}/textures/laurel-arc.svg");
--tp-blob:url("${T}/textures/blob-soft.svg");--tp-blob-leaf:url("${T}/textures/blob-leaf.svg");--tp-blob-pebble:url("${T}/textures/blob-pebble.svg");--tp-blob-arch:url("${T}/textures/blob-arch.svg");
--tp-icon-arch-door:url("${T}/icons/arch-door.svg");--tp-icon-candle:url("${T}/icons/candle.svg");--tp-icon-incense:url("${T}/icons/incense.svg");--tp-icon-long-table:url("${T}/icons/long-table.svg");--tp-icon-moon-phase:url("${T}/icons/moon-phase.svg");--tp-icon-olive-branch:url("${T}/icons/olive-branch.svg");--tp-icon-palm:url("${T}/icons/palm.svg");--tp-icon-stone-stack:url("${T}/icons/stone-stack.svg");--tp-icon-sun-crescent:url("${T}/icons/sun-crescent.svg");--tp-icon-water-ripple:url("${T}/icons/water-ripple.svg");
--tp-o-grain:.055;--tp-o-sand:.09;--tp-o-grit:.16;--tp-o-stucco:.08;--tp-o-line:.11;--tp-o-tile:.09;--tp-o-motif:.2;
--tp-size-2xs:12px;--tp-size-xs:13px;--tp-size-sm:15px;--tp-size-base:clamp(16px,1.05vw,19px);--tp-size-md:clamp(18px,1.2vw,21px);--tp-size-lg:clamp(21px,1.5vw,26px);--tp-size-xl:clamp(25px,1.9vw,32px);
--tp-size-2xl:clamp(30px,2.4vw,42px);--tp-size-3xl:clamp(36px,3vw,52px);--tp-size-4xl:clamp(42px,3.8vw,66px);--tp-size-5xl:clamp(48px,5vw,86px);--tp-size-6xl:clamp(60px,6.4vw,110px);
--tp-leading-tight:1.04;--tp-leading-display:1.12;--tp-leading-snug:1.3;--tp-leading-body:1.62;--tp-leading-loose:1.8;
--tp-tracking-display:-.015em;--tp-tracking-wide:.06em;--tp-tracking-label:.18em;--tp-tracking-eyebrow:.28em;
--tp-weight-light:300;--tp-weight-regular:400;--tp-weight-medium:500;
--tp-s1:4px;--tp-s2:8px;--tp-s3:12px;--tp-s4:16px;--tp-s5:20px;--tp-s6:24px;--tp-s8:32px;--tp-s10:40px;--tp-s12:48px;--tp-s16:64px;--tp-s20:80px;--tp-s24:96px;--tp-s32:128px;--tp-s40:160px;
--tp-gutter:clamp(20px,5vw,72px);--tp-section-y:clamp(64px,9vw,160px);--tp-container:clamp(680px,75vw,1560px);--tp-container-reading:clamp(600px,52vw,840px);
--tp-measure-narrow:34ch;--tp-measure-body:62ch;--tp-measure-wide:78ch;
--tp-r-xs:3px;--tp-r-sm:6px;--tp-r-md:10px;--tp-r-lg:16px;--tp-r-xl:24px;--tp-r-2xl:40px;--tp-r-pill:999px;--tp-r-circle:50%;
--tp-r-arch:${TEMPLE_SHAPE.arch};--tp-r-arch-soft:${TEMPLE_SHAPE.archSoft};--tp-r-arch-tall:${TEMPLE_SHAPE.archTall};--tp-r-keyhole:${TEMPLE_SHAPE.keyhole};--tp-r-lozenge:${TEMPLE_SHAPE.lozenge};
--tp-clip-sm:inset(0 round ${TEMPLE_SHAPE.arch});--tp-clip-md:inset(0 round 50% 50% 10px 10px / 42% 42% 10px 10px);--tp-clip-lg:inset(0 round ${TEMPLE_SHAPE.archSoft});
--tp-b-hair:1px;--tp-b-line:1.5px;--tp-b-bold:2px;--tp-b-draw:3px;
--tp-ease:cubic-bezier(.22,.61,.36,1);--tp-ease-in-out:cubic-bezier(.4,0,.2,1);--tp-ease-exit:cubic-bezier(.4,0,1,1);
--tp-dur-instant:90ms;--tp-dur-fast:160ms;--tp-dur-base:240ms;--tp-dur-slow:420ms;--tp-dur-veil:700ms;
--tp-transition:color var(--tp-dur-fast) var(--tp-ease),background-color var(--tp-dur-fast) var(--tp-ease),border-color var(--tp-dur-fast) var(--tp-ease),box-shadow var(--tp-dur-fast) var(--tp-ease),transform var(--tp-dur-fast) var(--tp-ease);
--tp-press:.985;--tp-lift:-2px;
--tp-display:var(--font-tp-branch),Branch,var(--font-tp-marcellus),Marcellus,Georgia,serif;
--tp-serif:var(--font-tp-marcellus),Marcellus,Georgia,'Times New Roman',serif;
--tp-quote:var(--font-tp-cormorant),'Cormorant Garamond',Georgia,serif;
--tp-sans:var(--font-tp-jost),Jost,'Helvetica Neue',Helvetica,sans-serif;`

/** The theme's tokens, scoped to a website root carrying `data-house-theme="temple"`. The `--tp-*` set is the
 *  theme's own vocabulary (temple-css.ts reads only these and DAWN tokens); the `--color-*` set re-points DAWN
 *  inside the site and reads the `--tp-*` set. The `--color-primary*` family is NOT set here: it is the
 *  Space's (AccentScope, templeAccentVars). The faces resolve through the `--font-tp-*` variables next/font
 *  sets on the site (components/sites/temple-fonts.ts), never on the root layout. */
export const TEMPLE_TOKENS_CSS = `
[data-house-theme="temple"]{color-scheme:light;${TEMPLE_VARS}
--color-canvas:var(--tp-plaster-100);--color-marketing-canvas:var(--tp-plaster-200);--color-surface:var(--tp-card);--color-surface-elevated:var(--tp-plaster-200);--color-surface-post:var(--tp-card);
--color-chrome:var(--tp-glass);--color-chrome-border:var(--tp-line);--color-chrome-hover:var(--tp-veil);
--color-border:var(--tp-line);--color-border-strong:var(--tp-rule);
--color-text:var(--tp-umber-800);--color-text-muted:var(--tp-umber-600);--color-text-subtle:var(--tp-muted);
--color-ink:var(--tp-umber-900);--color-ink-elevated:var(--tp-umber-800);--color-ink-border:var(--tp-line-on-ink);
--color-on-ink:var(--tp-plaster-100);--color-on-ink-muted:var(--tp-plaster-300);--color-on-ink-subtle:var(--tp-umber-400);
--color-signal:var(--tp-aegean-600);--color-signal-strong:var(--tp-aegean-800);--color-signal-bg:var(--tp-aegean-100);--color-text-on-signal:var(--tp-plaster-50);
--color-broadcast:var(--tp-fig-700);--color-broadcast-strong:var(--tp-fig-700);--color-broadcast-bg:var(--tp-clay-100);--color-text-on-broadcast:var(--tp-plaster-100);
--color-success:var(--tp-olive-600);--color-success-bg:var(--tp-olive-100);--color-text-on-success:var(--tp-plaster-50);
--color-warning:var(--tp-saffron-600);--color-warning-bg:var(--tp-saffron-200);
--color-danger:var(--tp-danger);--color-danger-bg:var(--tp-danger-bg);
--color-info:var(--tp-aegean-600);--color-info-bg:var(--tp-aegean-100);
--color-focus-ring:var(--tp-focus);
--font-display:var(--tp-display);--font-heading:var(--tp-serif);--font-body:var(--tp-sans);
--radius-card:var(--tp-r-lg);--radius-control:var(--tp-r-md);--radius-cover:var(--tp-r-lg);--radius-pill:var(--tp-r-pill)}
[data-house-theme="temple"][data-site-corners="subtle"]{--tp-r-lg:10px;--tp-r-md:6px;--radius-card:10px;--radius-cover:10px;--radius-control:6px}
[data-house-theme="temple"][data-site-corners="square"]{--tp-r-sm:0px;--tp-r-md:0px;--tp-r-lg:0px;--tp-r-xl:0px;--tp-r-pill:0px;--tp-r-arch:0px;--tp-r-arch-soft:0px;--tp-r-arch-tall:0px;--tp-r-keyhole:0px;--tp-r-lozenge:0px;--radius-card:0px;--radius-cover:0px;--radius-control:0px;--radius-pill:0px}
[data-house-theme="temple"][data-site-spacing="balanced"]{--tp-section-y:clamp(56px,7vw,120px)}
[data-house-theme="temple"][data-site-spacing="compact"]{--tp-section-y:clamp(40px,5vw,80px)}
@media (prefers-reduced-motion:reduce){[data-house-theme="temple"]{--tp-dur-instant:0ms;--tp-dur-fast:0ms;--tp-dur-base:0ms;--tp-dur-slow:0ms;--tp-dur-veil:0ms}}
`
