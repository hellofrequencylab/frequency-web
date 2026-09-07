// PER-SPACE ACCENT SCOPING (ENTITY-SPACES-BUILD §A — D4 "the accent is a guest").
//
// A Space's `brand_accent` is EITHER a curated DAWN token NAME (one of components/spaces/space-form.tsx
// ACCENT_TOKENS, all in lib/theme/validate.ts TOKEN_ALLOWLIST) OR a 6-digit hex the owner picked with
// the brand color picker (ADR-516 D2 — the owner directive for a real color picker; brand_accent is
// NOT wired into any server `<style>` tag — see lib/theme/server/resolve.ts — it only ever reaches a
// React inline `style` via AccentScope, and both the write action and this builder re-validate the hex
// with a strict `/^#[0-9a-fA-F]{6}$/`, so a hex accent carries no injection surface).
//
// On its own the value is inert: nothing in the profile reads `var(--color-broadcast)` — the CTAs, the
// active tab, the type badge, and the in-body accents all read the `--color-primary*` family. So to make
// a Space's accent actually paint, this maps the chosen accent onto the `--color-primary*` slots as a
// scoped CSS-variable override the profile shell applies to a wrapper node (never the whole page — the
// canvas/surface tokens stay neutral, D4).
//
// A TOKEN accent resolves to `var(<token>)` references (tracking the live palette + dark mode); a HEX
// accent derives its -hover / -bg shades from the one hex with `color-mix` (the -bg is a translucent
// tint that sits on any surface) plus a luminance-picked readable text color.
//
// 🔴 THE -strong SLOT IS DERIVED PER THEME, BY MEASUREMENT (LIVE-211, ADR-1224). `-strong` is the
// slot TEXT reads — PageHeading's eyebrow, the active tab, the type badge, every in-body
// `text-primary-strong` — so it sits on the page ground and has to clear WCAG AA (4.5:1) there.
// Until 2026-09-07 the hex path emitted ONE value for both themes, `color-mix(in srgb, hex 72%,
// black)`, and that constant cannot be right: on the light ground you darken to gain contrast, on the
// dark ground darkening moves the text TOWARD the ground. A Space's #1FB6C5 brand measured 4.24 on
// light and 4.14 on dark — failing both at once — and its two fixes point in opposite directions (68%
// toward black on light, 76% on dark, i.e. lighter). So the hex path now builds two values, each the
// SMALLEST shift of the accent (toward black for light, toward white for dark) that measures >= 4.5:1
// against the hardest ground of that theme, and emits them through `light-dark()`, which the browser
// resolves from the `color-scheme` the mode already sets (`:root` light, `.dark` dark, and every skin
// block). The luminance helper that picks text-on-accent does the measuring; the built-in FAMILIES
// were contrast-checked by hand, and this closes the one path that was never held to the same rule.
//
// Why a registry (tokens) and not a blind `--color-primary: var(<accent>)`: a complete remap needs the
// accent's -hover / -strong / -bg / text-on variants too (the primary BUTTON reads -hover and
// text-on-primary; the active tab + badge read -bg + -strong). Only `primary`, `signal`, and
// `broadcast` ship a full family in app/globals.css; the semantic-state tokens (`info`, `warning`,
// `success`, `danger`) ship only base + -bg. This registry fills the missing slots with the safest
// available token so EVERY allowlisted accent remaps cleanly and stays legible.

import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'

/** A 6-digit hex accent (`#rrggbb`). The exact shape the native brand color picker emits + the exact
 *  shape the write actions accept, so the client, the server gate, and this builder agree. */
export const HEX_ACCENT = /^#[0-9a-fA-F]{6}$/

/** Is `value` a persistable brand accent: a curated allowlisted DAWN token NAME, or a 6-digit hex the
 *  owner picked? The write actions (updateSpaceProfile, setSpaceAccent) gate on this, so the same rule
 *  governs both accent entry points. An empty string (clear the accent) is handled by the callers. */
export function isValidAccent(value: string): boolean {
  return TOKEN_ALLOWLIST.has(value) || HEX_ACCENT.test(value)
}

type Rgb = readonly [number, number, number]

function parseHex(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** sRGB relative luminance (the standard 0.2126/0.7152/0.0722 weighting over linearised channels). */
function luminanceOf([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colours, (L1 + 0.05) / (L2 + 0.05) with the lighter on top. */
export function contrastRatio(a: string, b: string): number {
  const la = luminanceOf(parseHex(a))
  const lb = luminanceOf(parseHex(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** `color-mix(in srgb, <hex> <100-pct>%, <toward>)` computed here, so the result can be MEASURED
 *  before it ships. Per-channel linear interpolation in sRGB, rounded to the 8-bit channel the
 *  browser would emit, is exactly what that CSS function does for two opaque sRGB colours. */
function mixToward(hex: string, toward: Rgb, pct: number): string {
  const from = parseHex(hex)
  const t = pct / 100
  return toHex([0, 1, 2].map((i) => Math.round(from[i]! * (1 - t) + toward[i]! * t)) as unknown as Rgb)
}

/** Readable text color to sit ON a hex accent: white on a dark accent, near-black ink on a light one,
 *  by sRGB relative luminance. Returns a hex (accent DATA, applied via inline style — not a
 *  component-styling token). */
function readableTextOn(hex: string): string {
  // 0.179 is the WCAG crossover where black and white text carry EQUAL contrast against the accent
  // ((L+0.05)/0.05 = 1.05/(L+0.05)); above it dark ink wins, below it white wins.
  return luminanceOf(parseHex(hex)) > 0.179 ? '#141414' : '#ffffff'
}

/** WCAG AA for normal text. `-strong` is a TEXT slot (the eyebrow, the active tab, the badge), so
 *  this is the floor, not the large-text 3:1. */
export const STRONG_CONTRAST_FLOOR = 4.5
// A hair above the floor so a checker that rounds to two decimals (axe reports "4.23", "4.14") can
// never read a value this module accepted as 4.49.
const STRONG_CONTRAST_TARGET = STRONG_CONTRAST_FLOOR + 0.02

/** The page grounds `text-primary-strong` can sit on, per mode: canvas, surface and surface-elevated
 *  for the base DAWN palette and for the midnight skin (app/globals.css `:root` / `.dark` /
 *  `[data-skin="midnight"]` / `.dark [data-skin="midnight"]`). The builder measures against the
 *  HARDEST of each list — the darkest light ground, the lightest dark ground — so a value that clears
 *  it clears every ground a themed Space can render on. lib/spaces/accent.test.ts pins these to the
 *  live token values in globals.css, so a palette edit that moves a ground fails a test rather than
 *  silently un-measuring this. */
export const LIGHT_GROUNDS: readonly string[] = ['#FAF8F4', '#FFFFFF', '#F5F2EC', '#EEF1F6', '#F4F6FB']
export const DARK_GROUNDS: readonly string[] = ['#17120B', '#211A10', '#2B2415', '#0C1018', '#161C28', '#1F2736']

const BLACK: Rgb = [0, 0, 0]
const WHITE: Rgb = [255, 255, 255]

/** The hardest ground of a mode for text: the one whose luminance is CLOSEST to the direction the
 *  text has to move away from (the darkest light ground, the lightest dark ground). */
function hardestGround(grounds: readonly string[], pick: 'darkest' | 'lightest'): string {
  return grounds.reduce((best, g) => {
    const lb = luminanceOf(parseHex(best))
    const lg = luminanceOf(parseHex(g))
    return (pick === 'darkest' ? lg < lb : lg > lb) ? g : best
  })
}

/** The smallest shift of `hex` toward `toward` (0..100%, in whole percents) whose result measures at
 *  least the target contrast against `ground`. Contrast against a ground grows monotonically as the
 *  colour moves away from it, so the first passing step is the least-altered readable shade; an accent
 *  that already reads needs no shift at all (the dark DAWN palette does the same: its `-strong` IS its
 *  primary). Black and white both clear 4.5:1 against every ground in the lists, so the scan always
 *  terminates before 100%. */
function readableShade(hex: string, toward: Rgb, ground: string): string {
  for (let pct = 0; pct <= 100; pct++) {
    const candidate = mixToward(hex, toward, pct)
    if (contrastRatio(candidate, ground) >= STRONG_CONTRAST_TARGET) return candidate
  }
  return toHex(toward)
}

/** The two `-strong` values a hex accent needs — the light-ground one and the dark-ground one — each
 *  measured rather than assumed. Exported so the test can assert both halves against every ground. */
export function strongShades(hex: string): { light: string; dark: string } {
  return {
    light: readableShade(hex, BLACK, hardestGround(LIGHT_GROUNDS, 'darkest')),
    dark: readableShade(hex, WHITE, hardestGround(DARK_GROUNDS, 'lightest')),
  }
}

/** Build the `--color-primary*` override for a HEX accent: the hex itself, a darker hover via
 *  `color-mix`, a per-theme MEASURED `-strong` pair through `light-dark()`, a translucent tint (bg,
 *  theme-tolerant), and a luminance-picked text color. The hex is pre-validated by the caller
 *  (accentVars), so no untrusted string is interpolated.
 *
 *  FAIL-SAFE for a browser without `light-dark()` (pre-2024): an inline declaration it cannot parse
 *  is dropped, so `--color-primary-strong` keeps inheriting the host token — legible, un-branded —
 *  rather than rendering a value that fails contrast. */
function hexAccentVars(hex: string): AccentVars {
  const strong = strongShades(hex)
  return {
    '--color-primary': hex,
    '--color-primary-hover': `color-mix(in srgb, ${hex} 88%, black)`,
    '--color-primary-strong': `light-dark(${strong.light}, ${strong.dark})`,
    '--color-primary-bg': `color-mix(in srgb, ${hex} 14%, transparent)`,
    '--color-text-on-primary': readableTextOn(hex),
  }
}

/** The DAWN `--color-primary*` slots an accent override sets. Each value is a `var(--token)` string
 *  pointing at an allowlisted token (never a literal), so the live palette + dark mode resolve it. */
export interface AccentVars {
  '--color-primary': string
  '--color-primary-hover': string
  '--color-primary-strong': string
  '--color-primary-bg': string
  '--color-text-on-primary': string
}

/** One accent FAMILY: the four shade tokens + the readable text token, by name. The builder turns
 *  these into the `var()` override. A `null` shade/text means "this family has no such token in
 *  globals.css" — the builder falls back to the base shade (a safe, on-system substitute). */
interface AccentFamily {
  base: string
  hover: string | null
  strong: string | null
  bg: string | null
  textOn: string | null
}

// The families that back each allowlisted accent base token. `primary`, `signal`, and `broadcast`
// are complete; the semantic-state families carry only base + -bg, so their hover/strong fall back
// to the base shade and their text-on falls back to the global default (white) — both validated
// below to read legibly on the mid-tone state colors.
const FAMILIES: Record<string, AccentFamily> = {
  '--color-primary': {
    base: '--color-primary',
    hover: '--color-primary-hover',
    strong: '--color-primary-strong',
    bg: '--color-primary-bg',
    textOn: '--color-text-on-primary',
  },
  '--color-signal': {
    base: '--color-signal',
    hover: '--color-signal-strong', // signal has no -hover; the darker -strong reads as the pressed shade
    strong: '--color-signal-strong',
    bg: '--color-signal-bg',
    textOn: '--color-text-on-signal',
  },
  '--color-broadcast': {
    base: '--color-broadcast',
    hover: '--color-broadcast-strong',
    strong: '--color-broadcast-strong',
    bg: '--color-broadcast-bg',
    textOn: '--color-text-on-broadcast',
  },
  '--color-info': {
    base: '--color-info',
    hover: null,
    strong: null,
    bg: '--color-info-bg',
    textOn: null, // #2F6FB0 on white is 5.22:1 (AA) — the default white text-on-primary is fine
  },
  '--color-warning': {
    base: '--color-warning',
    hover: null,
    strong: null,
    bg: '--color-warning-bg',
    textOn: null, // #B07515 on white is 3.89:1 — passes the large-text/UI AA floor like the amber CTA
  },
  '--color-success': {
    base: '--color-success',
    hover: null,
    strong: null,
    bg: '--color-success-bg',
    textOn: null, // #11827A on white is 4.67:1 (AA)
  },
}

/** Build the scoped `--color-primary*` override for an accent value: a 6-digit HEX (its derived family)
 *  or an accent base TOKEN (its `var()` family), or null when the value is a non-hex token that is not
 *  allowlisted / has no family (the caller then keeps the inherited host accent). For a token the
 *  `-strong` slot (the active tab text + type badge text + in-body `text-primary-strong`) must stay
 *  dark-on-light: it falls back to the base only when the family has no darker shade. */
export function accentVars(token: string | null | undefined): AccentVars | null {
  if (!token) return null
  // A HEX accent (the owner's picked color): derive its family. Re-validated here (defence in depth)
  // so only a strict `#rrggbb` is ever interpolated into the inline style.
  if (HEX_ACCENT.test(token)) return hexAccentVars(token)
  // Defence in depth: never build an override from a token the theme allowlist would reject (the
  // store already validates on write, but the accent is interpolated into inline style here).
  if (!TOKEN_ALLOWLIST.has(token)) return null
  const fam = FAMILIES[token]
  if (!fam) return null

  const ref = (name: string) => `var(${name})`
  return {
    '--color-primary': ref(fam.base),
    '--color-primary-hover': ref(fam.hover ?? fam.base),
    '--color-primary-strong': ref(fam.strong ?? fam.base),
    '--color-primary-bg': ref(fam.bg ?? fam.base),
    '--color-text-on-primary': ref(fam.textOn ?? '--color-text-on-primary'),
  }
}

/** Resolve the accent override for a Space: its own `brand_accent` when set + supported, else the
 *  per-role `defaultAccent` from the blueprint, else null (the host amber). So an un-customized
 *  profile still differs by role, and a customized one wins. */
export function resolveAccentVars(
  brandAccent: string | null | undefined,
  roleDefaultAccent: string | null | undefined,
): AccentVars | null {
  return accentVars(brandAccent) ?? accentVars(roleDefaultAccent)
}

/** The accent base tokens this module can fully remap (used by the blueprint default-accent guard +
 *  the test, so a role never declares a default the override can't paint). */
export const SUPPORTED_ACCENT_TOKENS: ReadonlySet<string> = new Set(Object.keys(FAMILIES))
