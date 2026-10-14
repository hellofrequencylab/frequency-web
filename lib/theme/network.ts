// THE NETWORK THEME (owner ask 2026-10-13, built from The Group's design handoff). PURE. The theme's COLOR,
// SHAPE and TYPE data and the rules that read it; components/sites/network-css.ts is how a website wears it.
// It is the fourth site theme beside Frequency, Bold and Wildheart (lib/theme/site-style.ts): a STOCK theme
// in the Frequency library for community and business groups, so nothing here names a program.
//
// The standard, "coastal muted plus one bold accent":
//   · Let the people be the color. About 90% of a page is the scheme's paper, its sage or straw fill and its
//     deep ink. Real photos carry the warmth.
//   · One hero color, used with confidence, solid and never blended: the main button, the date, one band.
//   · Neutral depth only: a fill, hairlines, an off-white surface with a soft top highlight, warm low-alpha
//     shadows and a fine film grain. Never pastel washes, two-hue glows or tinted shadows.
//   · Bricolage Grotesque 700 headlines with tight tracking and one Instrument Serif italic word in ink;
//     Outfit body at 18px, 500 for labels and buttons. Floors: 15px text, AA contrast, 44px targets.
//   · Soft shapes: pill buttons and fields, 28px cards, 32px photo panels, a leaf crop on the hero photo.
//
// FOUR SCHEMES, not just accents. A scheme re-points the whole page (paper, fill, hairlines, ink, accent):
// Marigold (the default), Ocean, Lagoon and Coral. The owner picks one by picking its accent: a brand accent
// equal to a scheme's accent wears that whole scheme; any other hex is the accent alone over Marigold's
// grounds; no accent is Marigold. Values are the handoff's tokens/colors.css, measured by
// lib/theme/network.test.ts with lib/spaces/accent's contrastRatio. One change from the handoff: each scheme's
// subtle text step is a shade darker (Marigold #676E73 -> #666D72, Ocean #5D6F7B -> #5B6D79, Lagoon #5F726E ->
// #5B6F6B, Coral #6A6F76 -> #666C73), the least shift that clears AA on the fill (the handoff's measured 4.34 to
// 4.48:1 there).

import { HEX_ACCENT, contrastRatio, strongShades, type AccentVars } from '@/lib/spaces/accent'

export type NetworkSchemeId = 'marigold' | 'ocean' | 'lagoon' | 'coral'

interface NetworkScheme {
  label: string
  /** The page ground. */
  paper: string
  /** The off-white card surface. */
  surface: string
  /** The tonal fill: stat tiles, panels, the membership band. */
  fill: string
  line: string
  lineStrong: string
  /** Body and headline ink, and the dark bands. */
  ink: string
  inkRaised: string
  muted: string
  subtle: string
  /** The one hero color, the label that sits on it, and its text shade on light grounds. */
  accent: string
  onAccent: string
  accentText: string
}

/** The four schemes in the picker's order, Marigold first because it is the default. */
export const NETWORK_SCHEMES: Record<NetworkSchemeId, NetworkScheme> = {
  marigold: {
    label: 'Marigold',
    paper: '#FCF9EE', surface: '#FFFEF8', fill: '#F3EFDA', line: '#E7E1C8', lineStrong: '#CFC8AA',
    ink: '#22303A', inkRaised: '#33434F', muted: '#565E64', subtle: '#666D72',
    accent: '#E9B949', onAccent: '#1F3440', accentText: '#8A6410',
  },
  ocean: {
    label: 'Ocean',
    paper: '#F3F7FA', surface: '#FFFFFF', fill: '#E3EDF3', line: '#D3E1E9', lineStrong: '#BACBD2',
    ink: '#0F2A3D', inkRaised: '#1C3D54', muted: '#4C5F6C', subtle: '#5B6D79',
    accent: '#1F6FA8', onAccent: '#FFFFFF', accentText: '#1B6296',
  },
  lagoon: {
    label: 'Lagoon',
    paper: '#F7F9F4', surface: '#FFFFFC', fill: '#E8EFE6', line: '#DAE4D6', lineStrong: '#BFCDBA',
    ink: '#173A35', inkRaised: '#24504A', muted: '#4E625E', subtle: '#5B6F6B',
    accent: '#22796E', onAccent: '#FFFFFF', accentText: '#1C6A60',
  },
  coral: {
    label: 'Coral',
    paper: '#FBF7F3', surface: '#FFFEFB', fill: '#F5ECE6', line: '#EADFD7', lineStrong: '#D3C3B8',
    ink: '#1F3440', inkRaised: '#2B4250', muted: '#5A5F66', subtle: '#666C73',
    accent: '#EE7655', onAccent: '#13232C', accentText: '#B04A2F',
  },
}

export const NETWORK_SCHEME_ORDER: readonly NetworkSchemeId[] = ['marigold', 'ocean', 'lagoon', 'coral']
const DEFAULT_NETWORK_SCHEME: NetworkSchemeId = 'marigold'

/** The second accents ("pops", the handoff's v4 to v6 passes): the other schemes' hero colors, used only as
 *  small details (a label's dot, a stat's numeral and blips, the Premium tier's tint, a circle's edge),
 *  never as fills behind text. Each scheme takes the three accents it does not wear. */
const NETWORK_POPS: Record<NetworkSchemeId, [pop: string, pop2: string, pop3: string]> = {
  marigold: ['#1F6FA8', '#EE7655', '#22796E'],
  ocean: ['#E9B949', '#EE7655', '#22796E'],
  lagoon: ['#E9B949', '#EE7655', '#1F6FA8'],
  coral: ['#E9B949', '#1F6FA8', '#22796E'],
}

/** Tag colors for up to five sub-groups beside the hero color (the handoff's chapter colors), as edges and
 *  dots only. */
const NETWORK_TAGS = ['#3B7EA1', '#7A5BA6', '#2F8A7A', '#B5762A', '#4E6A3A'] as const

/** The warm neutral counterpoint every scheme shares: date tiles, distance tags, card footers. */
export const NETWORK_SAND = { sand: '#F4EFE6', sandLine: '#E6DED0' } as const

/** The on-ink text the dark bands use (footer, chapters band). */
const NETWORK_ON_INK = { text: '#FFFEF8', muted: '#C3D0D6', subtle: '#A3B3BB', border: '#36505E' } as const

/** The shapes: pills for controls and tags, 28px cards, 32px photo panels, the leaf crop for a hero photo. */
const NETWORK_SHAPE = {
  sm: '14px',
  card: '28px',
  cover: '32px',
  pill: '999px',
  leaf: '36px 220px 36px 36px',
} as const

/** Motion: three durations and one ease. Reduced motion zeroes them in the token block. */
const NETWORK_MOTION = { fast: '140ms', base: '240ms', slow: '600ms', ease: 'cubic-bezier(.2,.7,.2,1)', scheme: '400ms' } as const

/** The scheme a website wears for an owner's brand accent: the scheme whose accent it is, else Marigold. */
export function networkScheme(brandAccent: string | null | undefined): NetworkSchemeId {
  const accent = brandAccent?.trim().toUpperCase()
  if (!accent) return DEFAULT_NETWORK_SCHEME
  return NETWORK_SCHEME_ORDER.find((id) => NETWORK_SCHEMES[id].accent === accent) ?? DEFAULT_NETWORK_SCHEME
}

/** The Space's `--color-primary*` family on a Network website. No accent, a DAWN token accent, or a scheme's
 *  own accent: that scheme's measured accent, label and text shade. Any other hex: that hex with a measured
 *  link shade and a label that reads on it (the scheme's ink when it clears AA, else white). */
export function networkAccentVars(brandAccent: string | null | undefined): AccentVars {
  const accent = brandAccent?.trim() || null
  const scheme = NETWORK_SCHEMES[networkScheme(accent)]
  if (!accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === scheme.accent) {
    return {
      '--color-primary': scheme.accent,
      '--color-primary-hover': `color-mix(in srgb, ${scheme.accent} 86%, black)`,
      '--color-primary-strong': scheme.accentText,
      '--color-primary-bg': `color-mix(in srgb, ${scheme.accent} 10%, ${scheme.paper})`,
      '--color-text-on-primary': scheme.onAccent,
    }
  }
  return {
    '--color-primary': accent,
    '--color-primary-hover': `color-mix(in srgb, ${accent} 86%, black)`,
    '--color-primary-strong': strongShades(accent).light,
    '--color-primary-bg': `color-mix(in srgb, ${accent} 10%, ${scheme.paper})`,
    '--color-text-on-primary': contrastRatio(scheme.ink, accent) >= 4.5 ? scheme.ink : '#FFFFFF',
  }
}

/** Film grain and mottle, felt more than seen (the handoff's --tg-grain and --tg-mottle). */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2 0 0 0 0 .17 0 0 0 0 .13 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const MOTTLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .42 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E")`
/** The faint wave between sections: one hairline in the strong line color. */
/** The filled wave a full-bleed band opens and closes with (the handoff's v6 section wave), used as a mask. */
const WAVE_FILL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 72' preserveAspectRatio='none'%3E%3Cpath d='M0 40 C 180 10 360 70 540 40 S 900 10 1080 40 S 1300 70 1440 36 V0 H0Z'/%3E%3C/svg%3E")`
const NETWORK_WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 28' preserveAspectRatio='none'%3E%3Cpath d='M0 14C100 4 200 24 300 14S500 4 600 14 800 24 900 14 1100 4 1200 14' fill='none' stroke='%23000' stroke-width='1.5'/%3E%3C/svg%3E")`

function schemeVars(s: NetworkScheme, id: NetworkSchemeId): string {
  const [pop, pop2, pop3] = NETWORK_POPS[id]
  return `--nw-pop:${pop};--nw-pop2:${pop2};--nw-pop3:${pop3};--nw-paper:${s.paper};--nw-surface:${s.surface};--nw-fill:${s.fill};--nw-line:${s.line};--nw-line-strong:${s.lineStrong};--nw-ink:${s.ink};--nw-ink-raised:${s.inkRaised};--nw-muted:${s.muted};--nw-subtle:${s.subtle}`
}

/** The theme's own vocabulary that no scheme and no host theme changes: tags, rhythm, waves, grain, depth,
 *  literal tints, corners, motion and tracking. Shared by the site token block and the island block below. */
const NETWORK_SHARED_VARS = `${NETWORK_TAGS.map((c, i) => `--nw-tag-${i + 1}:${c}`).join(';')};
--nw-sec-y:clamp(96px,11vw,168px);--nw-gutter:clamp(20px,4vw,48px);--nw-wave-fill:${WAVE_FILL};
--nw-grain:${GRAIN};--nw-mottle:${MOTTLE};--nw-wave:${NETWORK_WAVE};--nw-grain-opacity:.22;--nw-mottle-opacity:.07;
--nw-shadow-sm:inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(48,40,30,.05),0 10px 26px -18px rgba(48,40,30,.2);
--nw-shadow-md:inset 0 1px 0 rgba(255,255,255,.7),0 2px 6px rgba(48,40,30,.05),0 24px 48px -26px rgba(48,40,30,.26);
--nw-shadow-lg:inset 0 1px 0 rgba(255,255,255,.7),0 4px 12px rgba(48,40,30,.05),0 38px 80px -42px rgba(48,40,30,.34);
--nw-ring-focus:0 0 0 2px var(--nw-surface),0 0 0 4px var(--nw-ink);
--nw-c-soot:#000;--nw-c-soot-78:rgba(18,18,18,.78);--nw-c-earth-10:rgba(60,40,20,.10);--nw-c-glow-10:rgba(255,214,170,.10);--nw-c-shade-18:rgba(15,30,40,.18);--nw-c-shade-35:rgba(15,30,40,.35);--nw-c-shade-40:rgba(15,30,40,.4);--nw-c-shade-50:rgba(15,30,40,.5);--nw-c-shade-60:rgba(15,30,40,.6);--nw-c-umber-12:rgba(48,40,30,.12);--nw-c-chalk:#fff;--nw-c-chalk-06:rgba(255,255,255,.06);--nw-c-chalk-07:rgba(255,255,255,.07);--nw-c-chalk-08:rgba(255,255,255,.08);--nw-c-chalk-10:rgba(255,255,255,.1);--nw-c-chalk-12:rgba(255,255,255,.12);--nw-c-chalk-14:rgba(255,255,255,.14);--nw-c-chalk-22:rgba(255,255,255,.22);--nw-c-chalk-82:rgba(255,255,255,.82);--nw-c-chalk-88:rgba(255,255,255,.88);
--nw-r-sm:${NETWORK_SHAPE.sm};--nw-r-card:${NETWORK_SHAPE.card};--nw-r-cover:${NETWORK_SHAPE.cover};--nw-r-pill:${NETWORK_SHAPE.pill};--nw-r-leaf:${NETWORK_SHAPE.leaf};
--nw-dur-fast:${NETWORK_MOTION.fast};--nw-dur-base:${NETWORK_MOTION.base};--nw-dur-slow:${NETWORK_MOTION.slow};--nw-ease:${NETWORK_MOTION.ease};
--nw-tracking-display:-.035em;--nw-measure:65ch;
--nw-pencil:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20h9'/%3E%3Cpath d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'/%3E%3C/svg%3E");`

/** The theme's tokens, scoped to a website root carrying `data-house-theme="network"`, one block per scheme
 *  under `data-scheme`. The `--nw-*` set is the theme's own vocabulary (network-css.ts reads only these and
 *  DAWN tokens); the `--color-*` set re-points DAWN inside the site and reads the `--nw-*` set, so a scheme
 *  re-points only `--nw-*`. The `--color-primary*` family is NOT set here: it is the Space's (AccentScope,
 *  networkAccentVars). The faces resolve through the `--font-nw-*` variables next/font sets on the site
 *  (components/sites/network-fonts.ts), never on the root layout. */
export const NETWORK_TOKENS_CSS = `
[data-house-theme="network"]{color-scheme:light;${schemeVars(NETWORK_SCHEMES.marigold, 'marigold')};
${NETWORK_SHARED_VARS}
--nw-sand:${NETWORK_SAND.sand};--nw-sand-line:${NETWORK_SAND.sandLine};
--nw-on-ink:${NETWORK_ON_INK.text};--nw-on-ink-muted:${NETWORK_ON_INK.muted};--nw-on-ink-subtle:${NETWORK_ON_INK.subtle};--nw-ink-border:${NETWORK_ON_INK.border};
--nw-display:var(--font-nw-bricolage),'Bricolage Grotesque','Outfit',system-ui,sans-serif;--nw-body:var(--font-nw-outfit),'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif;--nw-voice:var(--font-nw-instrument),'Instrument Serif',Georgia,serif;--nw-hand:var(--font-caveat),'Caveat','Bradley Hand',cursive;
--color-canvas:var(--nw-paper);--color-marketing-canvas:var(--nw-fill);--color-surface:var(--nw-surface);--color-surface-elevated:var(--nw-fill);--color-surface-post:var(--nw-surface);
--color-chrome:color-mix(in srgb,var(--nw-paper) 88%,transparent);--color-chrome-border:var(--nw-line);--color-chrome-hover:var(--nw-surface);
--color-border:var(--nw-line);--color-border-strong:var(--nw-line-strong);
--color-text:var(--nw-ink);--color-text-muted:var(--nw-muted);--color-text-subtle:var(--nw-subtle);
--color-ink:var(--nw-ink);--color-ink-elevated:var(--nw-ink-raised);--color-ink-border:var(--nw-ink-border);
--color-on-ink:var(--nw-on-ink);--color-on-ink-muted:var(--nw-on-ink-muted);--color-on-ink-subtle:var(--nw-on-ink-subtle);
--color-signal:var(--nw-ink);--color-signal-strong:var(--nw-ink);--color-signal-bg:var(--nw-fill);--color-text-on-signal:var(--nw-on-ink);
--color-broadcast:var(--nw-ink);--color-broadcast-strong:var(--nw-ink);--color-broadcast-bg:var(--nw-fill);--color-text-on-broadcast:var(--nw-on-ink);
--color-success:#1B5E48;--color-success-bg:#E6F4EE;--color-text-on-success:#FFFFFF;
--color-warning:#9A5B00;--color-warning-bg:#FFF4DE;
--color-danger:#B23A3A;--color-danger-bg:#FDECEC;
--color-info:#2A4A77;--color-info-bg:#EAEFF6;
--color-focus-ring:var(--nw-ink);
--font-display:var(--nw-display);--font-heading:var(--nw-display);--font-body:var(--nw-body);
--radius-card:${NETWORK_SHAPE.card};--radius-control:${NETWORK_SHAPE.pill};--radius-cover:${NETWORK_SHAPE.cover};--radius-pill:${NETWORK_SHAPE.pill}}
${NETWORK_SCHEME_ORDER.filter((id) => id !== DEFAULT_NETWORK_SCHEME)
  .map((id) => `[data-house-theme="network"][data-scheme="${id}"]{${schemeVars(NETWORK_SCHEMES[id], id)}}`)
  .join('\n')}
[data-house-theme="network"][data-scheme="ocean"]{--nw-grain-opacity:.18;--nw-mottle-opacity:.05;--nw-on-ink-muted:#B9CAD6;--nw-on-ink-subtle:#93A9B8;--nw-ink-border:#2A4A61}
[data-house-theme="network"][data-site-spacing="balanced"]{--nw-sec-y:clamp(72px,9vw,112px)}
[data-house-theme="network"][data-site-spacing="compact"]{--nw-sec-y:clamp(48px,6vw,80px)}
[data-house-theme="network"][data-site-corners="subtle"]{--nw-r-card:10px;--nw-r-cover:12px;--nw-r-leaf:12px;--radius-card:10px;--radius-cover:12px}
[data-house-theme="network"][data-site-corners="square"]{--nw-r-sm:0px;--nw-r-card:0px;--nw-r-cover:0px;--nw-r-leaf:0px;--nw-r-pill:0px;--radius-card:0px;--radius-cover:0px;--radius-control:0px;--radius-pill:0px}
@media (prefers-reduced-motion:reduce){[data-house-theme="network"]{--nw-dur-fast:0ms;--nw-dur-base:0ms;--nw-dur-slow:0ms}}
`

/** THE NETWORK BLOCKS ON ANOTHER THEME (an "island"). A Network section placed on a Frequency, Bold or
 *  Wildheart site carries `data-nw-island` on its root; outside a Network site this block gives it the
 *  theme's vocabulary with every color and face read from the HOST theme's own tokens, so the sections keep
 *  Network's shapes, rhythm and motion and wear the site's palette, faces and accent. Inside a Network site the
 *  selector does not match, and the site's own tokens (above) apply unchanged. */
export const NETWORK_ISLAND_TOKENS_CSS = `
[data-nw-island]:not([data-house-theme="network"] *){
--nw-paper:var(--color-canvas);--nw-surface:var(--color-surface);--nw-fill:var(--color-surface-elevated);--nw-line:var(--color-border);--nw-line-strong:var(--color-border-strong);
--nw-ink:var(--color-text);--nw-ink-raised:var(--color-ink-elevated,var(--color-text));--nw-muted:var(--color-text-muted);--nw-subtle:var(--color-text-subtle);
--nw-pop:var(--color-primary);--nw-pop2:var(--color-signal,var(--color-primary));--nw-pop3:var(--color-broadcast,var(--color-primary));
--nw-sand:var(--color-surface-elevated);--nw-sand-line:var(--color-border);
--nw-on-ink:var(--color-on-ink,${NETWORK_ON_INK.text});--nw-on-ink-muted:var(--color-on-ink-muted,${NETWORK_ON_INK.muted});--nw-on-ink-subtle:var(--color-on-ink-subtle,${NETWORK_ON_INK.subtle});--nw-ink-border:var(--color-ink-border,${NETWORK_ON_INK.border});
${NETWORK_SHARED_VARS}
--nw-display:var(--hs-serif,var(--font-display)),Georgia,serif;--nw-body:var(--hs-sans,var(--font-body)),system-ui,sans-serif;--nw-voice:var(--hs-serif,var(--font-display)),Georgia,serif;--nw-hand:var(--font-caveat),'Caveat',cursive;
font-family:var(--nw-body);color:var(--nw-ink)}`
