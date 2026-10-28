// THE NETWORK THEME KIT (code id `network-kit`, shown as "Network"), for frequency-web. PURE.
// Built from the Network design system (Claude Design project "Network Design System", docs/design-systems/network).
// Modelled line for line on lib/theme/midnight.ts: the four schemes, the accent rule, the token block a website
// wears under [data-house-theme="network-kit"], and the flat surface every other surface reads.
//
// NOT the earlier `network` theme. lib/theme/network.ts (`network`, `--nw-*`, The Group's live site) is untouched and
// still renders, but it is offered in no picker: this kit is the Network a person chooses.
//
// The standard, "white, ink, one hero colour":
//   · About 90% of a page is paper, card tint and deep sea ink. One solid hero colour does the main button, the
//     date tile and one highlight. Fills carry their own label colour; text uses the accent's text shade.
//   · FOUR SCHEMES re-point the whole page (paper, surface, tint, hairlines, text steps, accent together):
//     Marigold (the default), Coral, Ocean and Lagoon. Thirteen profiles each wear one of them.
//   · ONE TYPE SYSTEM for all thirteen profiles (Daniel's ruling): Bricolage Grotesque for display, Outfit for
//     body and labels, Instrument Serif italic for the one-word voice, Caveat for a signature. The design's
//     per-profile pairs in tokens/kits.css are not ported.
//   · Pill controls, 18px tiles, 28px cards, 32px photo panels, a leaf crop once per page. Neutral shadows only.
//
// DEVIATIONS FROM THE DESIGN, each measured with lib/spaces/accent's contrastRatio (rules.json tokenDeviations):
//   1. Subtle text (--gray-500, --tg-subtle, --color-text-subtle, --th-muted) is a shade darker in every scheme.
//      The design's value reads 4.12 to 4.48:1 on the card tint and its pressed step (Coral 4.34, Ocean 4.39,
//      Lagoon 4.35). The darker value clears 4.5:1 on paper, surface, tint and pressed tint.
//   2. Coral's label on its accent (#13232C) read 4.26:1 on the hover fill; it is a shade deeper (#0E1D25, 4.55 on
//      hover, 6.03 on the fill).
//   3. An accent under 3:1 against paper (Marigold 1.73, Coral 2.68) cannot draw the edge of a switch, checkbox
//      or meter alone, so every scheme carries --nk-accent-edge: the ink when the accent is too light, else the
//      accent itself.

import { NETWORK_KIT_ACCENT } from '@/lib/theme/network-kit-accent'
import { HEX_ACCENT, contrastRatio, type AccentVars } from '@/lib/spaces/accent'
import contract from '../sites/editor/theme-contract.json' with { type: 'json' }
import type { ThemeSurface } from '@/lib/theme/surface-vars'

type NetworkKitSchemeId = 'marigold' | 'coral' | 'ocean' | 'lagoon'

interface NetworkKitScheme {
  label: string
  /** The page ground, the off-white card surface, the card tint and its pressed step. */
  paper: string
  white: string
  card: string
  card2: string
  line: string
  lineStrong: string
  gray400: string
  /** Subtle and muted text, a middle step of the ink ramp, the second ink and the ink (headline, ink band). */
  subtle: string
  muted: string
  gray700: string
  ink2: string
  ink: string
  /** The one hero colour, the label on it, its text shade, its deep step, and the three derived steps. */
  accent: string
  onAccent: string
  accentText: string
  accentDeep: string
  accentHover: string
  accentSoft: string
  accentBg: string
  /** The text the ink band (footer) uses. */
  onInkMuted: string
  onInkSubtle: string
  /** The design's film-grain and mottle strength for this scheme (cooler schemes are quieter). */
  grainOpacity: string
  mottleOpacity: string
}

/** The four schemes in the picker's order, Marigold first because it is the default. Values are the design's
 *  tokens/colors.css, apart from the deviations listed above. */
export const NETWORK_KIT_SCHEMES: Record<NetworkKitSchemeId, NetworkKitScheme> = {
  marigold: {
    label: 'Marigold',
    paper: '#FCF9EE', white: '#FFFEF8', card: '#F3EFDA', card2: '#EBE6CC', line: '#E7E1C8', lineStrong: '#CFC8AA', gray400: '#A7A38E',
    subtle: '#61676C', muted: '#565E64', gray700: '#3A4A55', ink2: '#33434F', ink: '#22303A',
    accent: '#E9B949', onAccent: '#1F3440', accentText: '#8A6410', accentDeep: '#5E4408', accentHover: '#C89F3F', accentSoft: '#F6E3B6', accentBg: '#FAF3DE',
    onInkMuted: '#C3CDD3', onInkSubtle: '#A5B2BA', grainOpacity: '.22', mottleOpacity: '.07',
  },
  coral: {
    label: 'Coral',
    paper: '#FBF7F3', white: '#FFFEFB', card: '#F5ECE6', card2: '#EFE2D9', line: '#EADFD7', lineStrong: '#D3C3B8', gray400: '#AFA39A',
    subtle: '#60656B', muted: '#5A5F66', gray700: '#36505E', ink2: '#2B4250', ink: '#1F3440',
    accent: '#EE7655', onAccent: '#0E1D25', accentText: '#B04A2F', accentDeep: '#7A2F1A', accentHover: '#CD6549', accentSoft: '#F7CBBD', accentBg: '#FAEAE3',
    onInkMuted: '#C3D0D6', onInkSubtle: '#A3B3BB', grainOpacity: '.22', mottleOpacity: '.07',
  },
  ocean: {
    label: 'Ocean',
    paper: '#F3F7FA', white: '#FFFFFF', card: '#E3EDF3', card2: '#D8E5EE', line: '#D3E1E9', lineStrong: '#BACBD2', gray400: '#97A7B1',
    subtle: '#566772', muted: '#4C5F6C', gray700: '#2A4A61', ink2: '#1C3D54', ink: '#0F2A3D',
    accent: '#1F6FA8', onAccent: '#FFFFFF', accentText: '#1B6296', accentDeep: '#0F3F63', accentHover: '#1B5F90', accentSoft: '#ABC9DE', accentBg: '#DEE9F2',
    onInkMuted: '#B9CAD6', onInkSubtle: '#93A9B8', grainOpacity: '.18', mottleOpacity: '.05',
  },
  lagoon: {
    label: 'Lagoon',
    paper: '#F7F9F4', white: '#FFFFFC', card: '#E8EFE6', card2: '#DDE7DA', line: '#DAE4D6', lineStrong: '#BFCDBA', gray400: '#9BAA9F',
    subtle: '#576965', muted: '#4E625E', gray700: '#2F5852', ink2: '#24504A', ink: '#173A35',
    accent: '#22796E', onAccent: '#FFFFFF', accentText: '#1C6A60', accentDeep: '#0F4640', accentHover: '#1D685F', accentSoft: '#AFCDC6', accentBg: '#E2ECE7',
    onInkMuted: '#BFD2CD', onInkSubtle: '#9DB5AF', grainOpacity: '.22', mottleOpacity: '.07',
  },
}

export const NETWORK_KIT_SCHEME_ORDER: readonly NetworkKitSchemeId[] = ['marigold', 'coral', 'ocean', 'lagoon']
const DEFAULT_SCHEME: NetworkKitSchemeId = 'marigold'

/** The thirteen profiles (the design's `data-kit` values) and the scheme each wears (tokens/colors.css and the
 *  contract's profiles{}). The type system is the same for all of them. */
export const NETWORK_KIT_PROFILES = ['general', 'networks', 'clubs', 'markets', 'hosts', 'creators', 'wellness', 'studios', 'nonprofits', 'schools', 'coaches', 'venues', 'faith'] as const
type NetworkKitProfileId = (typeof NETWORK_KIT_PROFILES)[number]

export const NETWORK_KIT_PROFILE_SCHEME: Record<NetworkKitProfileId, NetworkKitSchemeId> = {
  general: 'marigold', networks: 'marigold', clubs: 'marigold', markets: 'marigold',
  hosts: 'coral', creators: 'coral', wellness: 'coral',
  studios: 'ocean', nonprofits: 'ocean', schools: 'ocean',
  coaches: 'lagoon', venues: 'lagoon', faith: 'lagoon',
}

/** The scheme a profile wears; anything unknown wears Marigold. */
export function networkKitProfileScheme(profile: string | null | undefined): NetworkKitSchemeId {
  return NETWORK_KIT_PROFILE_SCHEME[profile as NetworkKitProfileId] ?? DEFAULT_SCHEME
}

/** The scheme a website wears for an owner's brand accent: the scheme whose accent it is, else Marigold. */
export function networkKitScheme(brandAccent: string | null | undefined): NetworkKitSchemeId {
  const accent = brandAccent?.trim().toUpperCase()
  if (!accent) return DEFAULT_SCHEME
  return NETWORK_KIT_SCHEME_ORDER.find((id) => NETWORK_KIT_SCHEMES[id].accent === accent) ?? DEFAULT_SCHEME
}

/** The design's season colours (the contract's seasons), for the seasonal top bar. */
export const NETWORK_KIT_SEASONS = contract.themes.NetworkKit.seasons

const M = NETWORK_KIT_SCHEMES.marigold

/** The default scheme's accent family, as the other surfaces read it. */
export { NETWORK_KIT_ACCENT }

/** THE ONE FLAT TOKEN SET every other Network Kit surface reads: the Spotlight preset, email and event pages take
 *  their literal values from here, so a token round is one edit and no surface keeps a copy. The website reads
 *  the same palette through NETWORK_KIT_TOKENS_CSS. */
export const NETWORK_KIT_SURFACE = {
  canvas: M.paper,
  raised: M.white,
  elevated: M.card,
  border: M.line,
  text: M.ink,
  muted: M.muted,
  subtle: M.subtle,
  solid: M.ink,
  onSolid: M.white,
  dark: false,
  accent: NETWORK_KIT_ACCENT,
  semantic: { success: '#1B5E48', info: '#2A4A77', danger: '#B23A3A' },
} as const satisfies ThemeSurface

// ── Deriving a family from an owner's accent ───────────────────────────────────────────────────

type Rgb = readonly [number, number, number]
const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const hexOf = (c: Rgb): string => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
/** `color-mix(in srgb, a pct%, b)` computed here, so the result can be measured before it ships. */
const mixHex = (a: string, pct: number, b: string): string => {
  const [x, y] = [rgb(a), rgb(b)]
  return hexOf([0, 1, 2].map((i) => (x[i]! * pct) / 100 + (y[i]! * (100 - pct)) / 100) as unknown as Rgb)
}

/** The design's "is this colour light" measure: Rec. 601 luma, 0 to 1. Marigold (0.73) and Coral (0.59) read
 *  light and take the ink; Ocean and Lagoon (0.37) take white. */
export function networkKitLuma(hex: string): number {
  const [r, g, b] = rgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
const LIGHT_ACCENT = 0.55
const AA = 4.5

interface NetworkKitAccentFamily {
  accent: string
  /** CSS colour values: the first four are mixes, so the page and the contract agree on how they are made. */
  hover: string
  soft: string
  bg: string
  /** Hex values (measured). */
  text: string
  deep: string
  onAccent: string
  edge: string
}

/** The accent family for any hex, over a scheme's grounds, by the design's rules: hover is 86% of the accent
 *  with black; soft is 34% and bg 10% of it into the paper; the label is the ink when the accent is light
 *  (luma over 0.55) and white otherwise (and the better of the two when that choice would miss AA); the text
 *  shade darkens a light accent 45% toward black and a dark one a little, then keeps darkening until it clears
 *  4.5:1 on the paper and the card tint; the edge is the ink when the accent is under 3:1 against the paper. */
export function networkKitAccentFamily(accent: string, scheme: NetworkKitScheme = M): NetworkKitAccentFamily {
  const light = networkKitLuma(accent) > LIGHT_ACCENT
  const wanted = light ? scheme.ink : '#FFFFFF'
  const other = light ? '#FFFFFF' : scheme.ink
  const onAccent = contrastRatio(wanted, accent) >= AA || contrastRatio(wanted, accent) >= contrastRatio(other, accent) ? wanted : other
  let step = light ? 45 : 12
  let text = mixHex('#000000', step, accent)
  while (step < 100 && (contrastRatio(text, scheme.paper) < AA + 0.02 || contrastRatio(text, scheme.card) < AA + 0.02)) {
    step += 1
    text = mixHex('#000000', step, accent)
  }
  return {
    accent,
    hover: `color-mix(in srgb, ${accent} 86%, black)`,
    soft: `color-mix(in srgb, ${accent} 34%, ${scheme.paper})`,
    bg: `color-mix(in srgb, ${accent} 10%, ${scheme.paper})`,
    text,
    deep: mixHex('#000000', light ? 58 : 50, accent),
    onAccent,
    edge: contrastRatio(accent, scheme.paper) >= 3 ? accent : scheme.ink,
  }
}

interface NetworkKitAccentVars extends AccentVars {
  '--brand-accent': string
  '--brand-accent-hover': string
  '--brand-accent-strong': string
  '--brand-accent-deep': string
  '--brand-accent-soft': string
  '--brand-accent-bg': string
  '--brand-on-accent': string
}

/** The Space's `--color-primary*` family on a Network Kit website, plus the design's own white-label hooks
 *  (`--brand-*`, which the kit's `--color-accent*` read first). No accent, or a scheme's own accent: that scheme's
 *  measured values. Any other hex: that hex with a derived family. */
export function networkKitAccentVars(brandAccent: string | null | undefined): NetworkKitAccentVars {
  const accent = brandAccent?.trim() || null
  const scheme = NETWORK_KIT_SCHEMES[networkKitScheme(accent)]
  const own = !accent || !HEX_ACCENT.test(accent) || accent.toUpperCase() === scheme.accent
  const f = own
    ? { accent: scheme.accent, hover: scheme.accentHover, soft: scheme.accentSoft, bg: scheme.accentBg, text: scheme.accentText, deep: scheme.accentDeep, onAccent: scheme.onAccent }
    : networkKitAccentFamily(accent, scheme)
  return {
    '--color-primary': f.accent,
    '--color-primary-hover': f.hover,
    '--color-primary-strong': f.text,
    '--color-primary-bg': f.bg,
    '--color-text-on-primary': f.onAccent,
    '--brand-accent': f.accent,
    '--brand-accent-hover': f.hover,
    '--brand-accent-strong': f.text,
    '--brand-accent-deep': f.deep,
    '--brand-accent-soft': f.soft,
    '--brand-accent-bg': f.bg,
    '--brand-on-accent': f.onAccent,
  }
}

// ── The token block ────────────────────────────────────────────────────────────────────────────

/** The faces, through the variables next/font sets on the website root (components/sites/network-kit-fonts.ts),
 *  each with the named face as a fallback. One system for all thirteen profiles. */
const FACES = `--font-display:var(--nk-display);--font-heading:var(--nk-display);--font-body:var(--nk-sans);--font-sans:var(--nk-sans);--font-label:var(--nk-sans);--font-mono:var(--nk-sans);--font-accent:var(--nk-accent-face);--font-hand:var(--nk-hand);`

function schemeVars(s: NetworkKitScheme): string {
  return [
    `--nk-gray-0:${s.white}`, `--nk-gray-50:${s.paper}`, `--nk-gray-100:${s.card}`, `--nk-gray-150:${s.card2}`, `--nk-gray-200:${s.line}`, `--nk-gray-300:${s.lineStrong}`,
    `--nk-gray-400:${s.gray400}`, `--nk-gray-500:${s.subtle}`, `--nk-gray-600:${s.muted}`, `--nk-gray-700:${s.gray700}`, `--nk-gray-800:${s.ink2}`, `--nk-gray-900:${s.ink}`,
    `--nk-tg-paper:${s.paper}`, `--nk-tg-surface:${s.white}`, `--nk-tg-card:${s.card}`, `--nk-tg-card-2:${s.card2}`, `--nk-tg-line:${s.line}`, `--nk-tg-line-strong:${s.lineStrong}`,
    `--nk-tg-ink:${s.ink}`, `--nk-tg-ink-2:${s.ink2}`, `--nk-tg-muted:${s.muted}`, `--nk-tg-subtle:${s.subtle}`,
    `--nk-acc:${s.accent}`, `--nk-acc-on:${s.onAccent}`, `--nk-acc-text:${s.accentText}`, `--nk-acc-deep:${s.accentDeep}`,
    `--nk-acc-hover:color-mix(in srgb,${s.accent} 86%,#000)`, `--nk-acc-soft:color-mix(in srgb,${s.accent} 34%,${s.paper})`, `--nk-acc-bg:color-mix(in srgb,${s.accent} 10%,${s.paper})`,
    `--nk-on-ink-muted:${s.onInkMuted}`, `--nk-on-ink-subtle:${s.onInkSubtle}`,
    `--nk-tg-grain-opacity:${s.grainOpacity}`, `--nk-tg-mottle-opacity:${s.mottleOpacity}`,
    `--nk-accent-edge:${contrastRatio(s.accent, s.paper) >= 3 ? s.accent : s.ink}`,
  ].join(';')
}

/** What no scheme changes: the design's tokens/*.css, renamed under `--nk-` where the name would collide with a
 *  Frequency token (type scale, spacing, radius, shadow, motion) and kept as written for the `--color-*` set the
 *  house blocks already read. The names are mapped in docs/design-systems/network/rules.json (tokenMap). */
const SHARED_VARS = `--color-accent:var(--brand-accent,var(--nk-acc));--color-accent-bg:var(--brand-accent-bg,var(--nk-acc-bg));--color-accent-deep:var(--brand-accent-deep,var(--nk-acc-deep));--color-accent-hover:var(--brand-accent-hover,var(--nk-acc-hover));--color-accent-soft:var(--brand-accent-soft,var(--nk-acc-soft));--color-accent-strong:var(--brand-accent-strong,var(--nk-acc-text));--color-border:var(--nk-gray-200);--color-border-strong:var(--nk-gray-300);--color-broadcast:var(--nk-gray-900);--color-broadcast-bg:var(--nk-gray-100);--color-broadcast-strong:var(--nk-gray-900);--color-canvas:var(--nk-gray-50);--color-chrome:color-mix(in srgb,var(--nk-gray-50) 88%,transparent);--color-chrome-border:var(--nk-gray-200);--color-chrome-hover:var(--nk-gray-0);--color-danger:var(--nk-red-500);--color-danger-bg:var(--nk-red-100);--color-danger-soft:var(--nk-red-300);--color-focus-ring:var(--nk-gray-900);--color-glass:color-mix(in srgb,#fff 82%,transparent);--color-info:var(--nk-info-500);--color-info-bg:var(--nk-info-100);--color-info-soft:var(--nk-info-300);--color-ink:var(--nk-gray-900);--color-ink-border:var(--nk-gray-700);--color-ink-elevated:var(--nk-gray-800);--color-marketing-canvas:var(--nk-gray-100);--color-move:var(--color-accent);--color-move-bg:var(--color-accent-bg);--color-on-ink:#FFFFFF;--color-on-ink-muted:var(--nk-on-ink-muted);--color-on-ink-subtle:var(--nk-on-ink-subtle);--color-on-media:#FFFFFF;--color-primary:var(--color-accent);--color-primary-bg:var(--color-accent-bg);--color-primary-hover:var(--color-accent-hover);--color-primary-strong:var(--color-accent-strong);--color-rule:color-mix(in srgb,var(--nk-gray-900) 14%,transparent);--color-scrim:color-mix(in srgb,var(--nk-gray-900) 48%,transparent);--color-selection:var(--color-accent-soft);--color-signal:var(--nk-gray-900);--color-signal-bg:var(--nk-gray-100);--color-signal-strong:var(--nk-gray-900);--color-success:var(--nk-green-500);--color-success-bg:var(--nk-green-100);--color-success-soft:var(--nk-green-300);--color-surface:var(--nk-gray-0);--color-surface-elevated:var(--nk-gray-100);--color-surface-hover:var(--nk-gray-100);--color-surface-post:var(--nk-gray-0);--color-text:var(--nk-gray-900);--color-text-disabled:var(--nk-gray-400);--color-text-muted:var(--nk-gray-600);--color-text-on-accent:var(--brand-on-accent,var(--nk-acc-on));--color-text-on-broadcast:#FFFFFF;--color-text-on-danger:#FFFFFF;--color-text-on-primary:var(--color-text-on-accent);--color-text-on-signal:#FFFFFF;--color-text-on-success:#FFFFFF;--color-text-subtle:var(--nk-gray-500);--color-warning:var(--nk-amber-500);--color-warning-bg:var(--nk-amber-100);--color-warning-soft:var(--nk-amber-300);
--mn-on-solid:var(--color-text-on-accent);--mn-solid:var(--color-accent);--mn-solid-hover:var(--color-accent-hover);
--nk-th-accent:var(--color-accent);--nk-th-accent-bg:var(--color-accent-bg);--nk-th-accent-deep:var(--color-accent-deep);--nk-th-accent-soft:var(--color-accent-soft);--nk-th-accent-text:var(--color-accent-strong);--nk-th-bg:var(--color-canvas);--nk-th-body:var(--font-body);--nk-th-clip-lg:inset(0 round 32px);--nk-th-clip-md:inset(0 round 28px);--nk-th-clip-sm:inset(0 round 18px);--nk-th-display:var(--font-display);--nk-th-dw:700;--nk-th-hairline:var(--color-border);--nk-th-mono:var(--font-label);--nk-th-muted:var(--color-text-subtle);--nk-th-on-accent:var(--color-text-on-accent);--nk-th-on-season:var(--color-text);--nk-th-r:var(--nk-radius-card);--nk-th-raised:var(--color-surface-elevated);--nk-th-season:var(--nk-tg-sand);--nk-th-secondary:var(--color-text-muted);--nk-th-surface:var(--color-surface);--nk-th-text:var(--color-text);
--nk-kit-accent:var(--color-accent);--nk-kit-accent-bg:var(--color-accent-bg);--nk-kit-accent-deep:var(--color-accent-deep);--nk-kit-accent-hover:var(--color-accent-hover);--nk-kit-accent-soft:var(--color-accent-soft);--nk-kit-accent-text:var(--color-accent-strong);
--nk-accent:var(--color-accent);--nk-accent-ink:var(--color-text-on-accent);--nk-accent-text:var(--color-accent-strong);
--nk-amber-100:#FFF4DE;--nk-amber-300:#F2D29B;--nk-amber-500:#9A5B00;--nk-amber-600:var(--nk-amber-500);--nk-amber-700:#5E3700;
--nk-green-100:#E6F4EE;--nk-green-300:#A9D6C2;--nk-green-500:#1B5E48;--nk-green-600:var(--nk-green-500);--nk-green-700:#0F3D2E;
--nk-info-100:#EAEFF6;--nk-info-300:#B9C9E0;--nk-info-500:#2A4A77;--nk-info-600:var(--nk-info-500);--nk-info-700:#1A3152;
--nk-red-100:#FDECEC;--nk-red-300:#F2B9B9;--nk-red-500:#B23A3A;--nk-red-600:var(--nk-red-500);--nk-red-700:#6E1F1F;
--nk-season-fall:var(--nk-red-600);--nk-season-spring:var(--nk-green-600);--nk-season-summer:var(--nk-amber-600);--nk-season-winter:var(--nk-info-600);
--nk-radius-card:28px;--nk-radius-control:999px;--nk-radius-cover:32px;--nk-radius-field:999px;--nk-radius-leaf:28px 180px 28px 28px;--nk-radius-media:32px;--nk-radius-none:0;--nk-radius-pill:999px;--nk-radius-sm:14px;--nk-radius-tile:18px;
--nk-shadow-button:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(48,40,30,.12);--nk-shadow-card:var(--nk-shadow-sm);--nk-shadow-float:0 0 0 1px var(--color-border),var(--nk-shadow-lg);--nk-shadow-lg:inset 0 1px 0 rgba(255,255,255,.7),0 4px 12px rgba(48,40,30,.05),0 38px 80px -42px rgba(48,40,30,.34);--nk-shadow-md:inset 0 1px 0 rgba(255,255,255,.7),0 2px 6px rgba(48,40,30,.05),0 24px 48px -26px rgba(48,40,30,.26);--nk-shadow-menu:0 0 0 1px var(--color-border),var(--nk-shadow-md);--nk-shadow-none:none;--nk-shadow-sm:inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(48,40,30,.05),0 10px 26px -18px rgba(48,40,30,.20);
--nk-ring-focus:0 0 0 2px var(--color-surface),0 0 0 4px var(--color-focus-ring);
--nk-glow-accent:0 0 0 1.5px var(--color-accent);--nk-glow-sand:#F4EFE6;--nk-glow-sun:#FFFDF6;
--nk-gradient-media-protect:linear-gradient(to top,rgba(18,18,18,.7) 0%,rgba(18,18,18,.15) 55%,transparent 100%);
--nk-tg-contour:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500' viewBox='0 0 800 500' fill='none' stroke='%231D2321' stroke-width='1'%3E%3Cpath d='M-20 380C120 320 210 400 340 350S560 260 820 300'/%3E%3Cpath d='M-20 340C130 280 220 360 350 312S570 222 820 262'/%3E%3Cpath d='M-20 300C140 240 230 320 360 274S580 184 820 224'/%3E%3Cpath d='M-20 260C150 200 240 280 370 236S590 146 820 186'/%3E%3Cpath d='M-20 220C160 160 250 240 380 198S600 108 820 148'/%3E%3Cpath d='M-20 180C170 120 260 200 390 160S610 70 820 110'/%3E%3C/svg%3E");--nk-tg-grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2 0 0 0 0 .17 0 0 0 0 .13 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");--nk-tg-grain-opacity:.22;--nk-tg-mottle:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .42 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E");--nk-tg-mottle-opacity:.07;--nk-tg-photo-grade:linear-gradient(180deg,rgba(255,214,170,.10),rgba(60,40,20,.10));--nk-tg-photo-side:linear-gradient(90deg,rgba(18,18,18,.5) 0%,transparent 62%);--nk-tg-photo-wash:linear-gradient(to top,rgba(18,18,18,.7) 0%,rgba(18,18,18,.15) 55%,transparent 100%);--nk-tg-sand:#F4EFE6;--nk-tg-sand-line:#E6DED0;
--nk-tex-cloud:none;--nk-tex-roots:none;--nk-tex-smoke:none;--nk-tex-stardust:none;
--nk-mist-opacity:1;
--nk-text-2xs:.8125rem;--nk-text-body:1.125rem;--nk-text-body-sm:1rem;--nk-text-card-title:1.125rem;--nk-text-display-card:1.5rem;--nk-text-display-h1:clamp(2.6rem,1.8rem + 3.4vw,4.4rem);--nk-text-display-h2:clamp(2.2rem,1.6rem + 2.4vw,3.6rem);--nk-text-display-h3:clamp(1.5rem,1.3rem + .8vw,1.875rem);--nk-text-display-hero:clamp(3rem,1.8rem + 5vw,6rem);--nk-text-eyebrow:1rem;--nk-text-label:.9375rem;--nk-text-lead:clamp(1.25rem,1.15rem + .4vw,1.375rem);--nk-text-meta:.9375rem;--nk-text-page-title:2.5rem;--nk-size-sm:1rem;--nk-text-stat:clamp(2.75rem,2rem + 2.6vw,3.5rem);--nk-text-ui:1.0625rem;--nk-size-xs:.9375rem;
--nk-space-1:4px;--nk-space-10:40px;--nk-space-12:48px;--nk-space-16:64px;--nk-space-2:8px;--nk-space-20:80px;--nk-space-24:96px;--nk-space-3:12px;--nk-space-32:128px;--nk-space-4:16px;--nk-space-5:20px;--nk-space-6:24px;--nk-space-8:32px;--nk-space-gutter:clamp(20px,4vw,48px);--nk-space-section:clamp(88px,11vw,144px);--nk-space-section-tight:clamp(56px,7vw,88px);
--nk-width-max:82.5rem;--nk-width-narrow:40rem;--nk-width-read:42.5rem;--nk-width-wide:73.75rem;
--nk-control-h:48px;--nk-control-h-lg:56px;--nk-control-h-sm:44px;
--nk-target-min:44px;
--nk-icon-lg:24px;--nk-icon-md:20px;--nk-icon-sm:18px;--nk-icon-stroke:1.75;--nk-icon-xl:32px;--nk-icon-xs:16px;
--nk-weight-display:700;--nk-weight-heading:700;--nk-weight-light:300;--nk-weight-medium:500;--nk-weight-regular:400;--nk-weight-semibold:600;
--nk-leading-display:1;--nk-leading-normal:1.5;--nk-leading-relaxed:1.6;--nk-leading-snug:1.25;
--nk-tracking-body:0;--nk-tracking-display:-.035em;--nk-tracking-eyebrow:0;--nk-tracking-label:0;--nk-tracking-tight:-.01em;
--nk-display-em-color:var(--color-text);
--nk-measure:65ch;
--nk-motion-base:240ms;--nk-motion-fast:140ms;--nk-motion-slow:600ms;
--nk-ease-in-out:cubic-bezier(.4,.1,.2,1);--nk-ease-out:cubic-bezier(.2,.7,.2,1);
--nk-site-header-height:76px;--nk-site-header-radius:0;
--nk-display-em-style:italic;--nk-display-tracking:-.035em;--nk-display-weight:700;--nk-kit-glow:0;--label-tracking:0;`

/** The sand tint (date tiles, card footers) is mixed from the scheme's own tint and paper wherever a scheme is set;
 *  the design's :root keeps the Marigold literal (#F4EFE6) as the value a page with no scheme falls back to. */
const SAND = '--nk-tg-sand:color-mix(in srgb,var(--nk-tg-card) 88%,var(--nk-tg-paper));--nk-tg-sand-line:var(--nk-tg-line)'

/** The design's per-axis site looks (data-site-corners, -header, -spacing), set by lib/theme/site-style.ts. */
const SITE_LOOK_CSS = `[data-house-theme="network-kit"][data-site-corners="soft"]{--nk-radius-card:28px;--nk-radius-control:999px;--nk-radius-cover:32px;--nk-radius-field:999px;--nk-radius-leaf:28px 180px 28px 28px;--nk-radius-media:32px;--nk-radius-sm:14px;--nk-radius-tile:18px;--nk-th-clip-md:inset(0 round 28px);--nk-th-clip-sm:inset(0 round 18px);--nk-th-r:28px}
[data-house-theme="network-kit"][data-site-corners="subtle"]{--nk-radius-card:10px;--nk-radius-control:8px;--nk-radius-cover:12px;--nk-radius-field:8px;--nk-radius-leaf:12px;--nk-radius-media:12px;--nk-radius-sm:6px;--nk-radius-tile:8px;--nk-th-clip-lg:inset(0 round 12px);--nk-th-clip-md:inset(0 round 10px);--nk-th-clip-sm:inset(0 round 6px);--nk-th-r:10px}
[data-house-theme="network-kit"][data-site-corners="square"]{--nk-radius-card:0px;--nk-radius-control:0px;--nk-radius-cover:0px;--nk-radius-field:0px;--nk-radius-leaf:0px;--nk-radius-media:0px;--nk-radius-pill:0px;--nk-radius-sm:0px;--nk-radius-tile:0px;--nk-th-clip-lg:inset(0);--nk-th-clip-md:inset(0);--nk-th-clip-sm:inset(0);--nk-th-r:0px}
[data-house-theme="network-kit"][data-site-header="pill"]{--nk-site-header-height:68px;--nk-site-header-radius:24px}
[data-house-theme="network-kit"][data-site-spacing="balanced"]{--nk-space-section:clamp(72px, 9vw, 112px);--nk-space-section-tight:clamp(48px, 6vw, 72px)}
[data-house-theme="network-kit"][data-site-spacing="compact"]{--nk-space-section:clamp(48px, 6vw, 80px);--nk-space-section-tight:clamp(32px, 4.5vw, 56px)}`

/** The host tokens the Frequency house blocks, the header and the footer already read, pointed at the kit's. */
const HOST_ALIASES = `--radius-card:var(--nk-radius-card);--radius-control:var(--nk-radius-control);--radius-cover:var(--nk-radius-cover);--radius-media:var(--nk-radius-media);--radius-pill:var(--nk-radius-pill);
--space-section:var(--nk-space-section);--space-section-tight:var(--nk-space-section-tight);--space-gutter:var(--nk-space-gutter);
--motion-fast:var(--nk-motion-fast);--motion-base:var(--nk-motion-base);--motion-slow:var(--nk-motion-slow);--ease-out:var(--nk-ease-out);--ease-in-out:var(--nk-ease-in-out);
--shadow-menu:var(--nk-shadow-menu);--shadow-float:var(--nk-shadow-float);`

/** The theme's tokens, scoped to a website root carrying `data-house-theme="network-kit"`. The base block is
 *  Marigold; `data-scheme` re-points the ramp, the text steps and the accent for the other three. The design's
 *  `--color-accent*` read the `--brand-*` hooks first, then the scheme, and its `--color-primary*` follow them;
 *  networkKitAccentVars sets those hooks (with the Space's `--color-primary*`) on the AccentScope that wraps the
 *  kit root, so the owner's accent reaches every block without this block holding a literal one.
 *
 *  ORDER IS LOAD-BEARING FOR THE DESIGN-SYSTEM TEST: it flattens every selector with the last declaration winning,
 *  so each override block comes first and the Marigold base last. The cascade is unaffected, because an
 *  attribute override is more specific than the base. */
export const NETWORK_KIT_TOKENS_CSS = `
${NETWORK_KIT_SCHEME_ORDER.map((id) => `[data-house-theme="network-kit"][data-scheme="${id}"]{${id === DEFAULT_SCHEME ? '' : `${schemeVars(NETWORK_KIT_SCHEMES[id])};`}${SAND}}`).join('\n')}
${SITE_LOOK_CSS}
@media (prefers-reduced-motion:reduce){[data-house-theme="network-kit"][data-house-theme]{--nk-motion-fast:0ms;--nk-motion-base:0ms;--nk-motion-slow:0ms}}
[data-house-theme="network-kit"]{color-scheme:light;${schemeVars(M)};
${SHARED_VARS}
--nk-scheme-marigold:${NETWORK_KIT_SCHEMES.marigold.accent};--nk-scheme-coral:${NETWORK_KIT_SCHEMES.coral.accent};--nk-scheme-ocean:${NETWORK_KIT_SCHEMES.ocean.accent};--nk-scheme-lagoon:${NETWORK_KIT_SCHEMES.lagoon.accent};
--nk-display:var(--font-nk-bricolage),'Bricolage Grotesque','Outfit',system-ui,sans-serif;--nk-sans:var(--font-nk-outfit),'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif;--nk-accent-face:var(--font-nk-instrument),'Instrument Serif',Georgia,serif;--nk-hand:var(--font-nk-caveat),'Caveat','Bradley Hand',cursive;
${FACES}
${HOST_ALIASES}
background:var(--color-canvas);color:var(--color-text);font-family:var(--nk-sans)}
[data-house-theme="network-kit"] ::selection{background:var(--color-selection);color:var(--nk-gray-900)}
`
