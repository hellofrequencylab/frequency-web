// The editor's view of the token allowlist — the SAME names enumerated in
// lib/theme/validate.ts (TOKEN_ALLOWLIST), grouped by role for a scannable form and
// tagged with the input kind each token wants. This is presentation metadata only: the
// server re-validates every value against the allowlist before it persists or renders, so
// nothing here can widen what a theme may set. If validate.ts ever grows a token, mirror it
// here (the dev assertion below flags drift in non-production).

import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'

/** Which block a token writes into, and what input control it deserves. */
export type TokenAxis = 'color' | 'color-mode' | 'feel'
export type FeelInput = 'length' | 'duration' | 'number'

export interface TokenSpec {
  /** The custom-property name, e.g. `--color-primary`. */
  name: string
  /** Human label (the property minus the `--color-`/`--` prefix, title-cased). */
  label: string
  /** A one-line hint on the token's role. */
  hint?: string
  /** color-mode = a light+dark pair (writes tokens.light / tokens.dark); feel = tokens.feel. */
  axis: TokenAxis
  /** For axis='feel': the input kind. */
  feel?: FeelInput
  /** A representative placeholder (the DAWN baseline) so an empty field reads "inherits X". */
  placeholder?: string
}

export interface TokenGroup {
  title: string
  hint: string
  tokens: TokenSpec[]
}

/**
 * The token groups, in editor order. Every `--color-*` token is a `color-mode` pair (a LIGHT
 * and a DARK input). The feel axis (radius / motion / density / generation feel) writes a
 * single value into tokens.feel. Placeholders are the DAWN `:root` baseline from
 * app/globals.css — shown as the input placeholder so a blank field reads as "inherits the
 * base", which is exactly what the server does (a token left blank is not sent).
 */
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    title: 'Surfaces',
    hint: 'Page and tile backgrounds.',
    tokens: [
      { name: '--color-canvas', label: 'Canvas', hint: 'The page background.', axis: 'color-mode', placeholder: '#FBF8F1' },
      { name: '--color-marketing-canvas', label: 'Marketing canvas', hint: 'The marketing page background.', axis: 'color-mode', placeholder: '#F2EAD9' },
      { name: '--color-surface', label: 'Surface', hint: 'Cards and tiles.', axis: 'color-mode', placeholder: '#FFFFFF' },
      { name: '--color-surface-elevated', label: 'Surface elevated', hint: 'Raised / hover surfaces.', axis: 'color-mode', placeholder: '#FAF6EC' },
    ],
  },
  {
    title: 'Borders',
    hint: 'Hairlines and dividers.',
    tokens: [
      { name: '--color-border', label: 'Border', axis: 'color-mode', placeholder: '#E9E1D4' },
      { name: '--color-border-strong', label: 'Border strong', axis: 'color-mode', placeholder: '#D8CDBB' },
    ],
  },
  {
    title: 'Text',
    hint: 'Reading colors on light surfaces.',
    tokens: [
      { name: '--color-text', label: 'Text', hint: 'Primary ink.', axis: 'color-mode', placeholder: '#3D352A' },
      { name: '--color-text-muted', label: 'Text muted', axis: 'color-mode', placeholder: '#6B6253' },
      { name: '--color-text-subtle', label: 'Text subtle', axis: 'color-mode', placeholder: '#8F8675' },
    ],
  },
  {
    title: 'Ink (dark bands)',
    hint: 'The dark sections and the text that sits on them.',
    tokens: [
      { name: '--color-ink', label: 'Ink', axis: 'color-mode', placeholder: '#141210' },
      { name: '--color-ink-elevated', label: 'Ink elevated', axis: 'color-mode', placeholder: '#211D17' },
      { name: '--color-ink-border', label: 'Ink border', axis: 'color-mode', placeholder: '#393227' },
      { name: '--color-on-ink', label: 'On ink', hint: 'Text on a dark band.', axis: 'color-mode', placeholder: '#F3EEE3' },
      { name: '--color-on-ink-muted', label: 'On ink muted', axis: 'color-mode', placeholder: '#B5A893' },
      { name: '--color-on-ink-subtle', label: 'On ink subtle', axis: 'color-mode', placeholder: '#857A66' },
    ],
  },
  {
    title: 'Brand · Primary',
    hint: 'The headline accent (buttons, links).',
    tokens: [
      { name: '--color-primary', label: 'Primary', axis: 'color-mode', placeholder: '#E2912F' },
      { name: '--color-primary-hover', label: 'Primary hover', axis: 'color-mode', placeholder: '#CE8023' },
      { name: '--color-primary-strong', label: 'Primary strong', axis: 'color-mode', placeholder: '#9A5E12' },
      { name: '--color-primary-bg', label: 'Primary tint', axis: 'color-mode', placeholder: '#FBEFD9' },
      { name: '--color-text-on-primary', label: 'Text on primary', axis: 'color-mode', placeholder: '#FFFFFF' },
    ],
  },
  {
    title: 'Brand · Signal',
    hint: 'The secondary accent (signal / success-leaning).',
    tokens: [
      { name: '--color-signal', label: 'Signal', axis: 'color-mode', placeholder: '#0F8E78' },
      { name: '--color-signal-strong', label: 'Signal strong', axis: 'color-mode', placeholder: '#0A5C4D' },
      { name: '--color-signal-bg', label: 'Signal tint', axis: 'color-mode', placeholder: '#D2EDE6' },
      { name: '--color-text-on-signal', label: 'Text on signal', axis: 'color-mode', placeholder: '#04231E' },
    ],
  },
  {
    title: 'Brand · Broadcast',
    hint: 'The tertiary accent (broadcast / announce).',
    tokens: [
      { name: '--color-broadcast', label: 'Broadcast', axis: 'color-mode', placeholder: '#1EB6C5' },
      { name: '--color-broadcast-strong', label: 'Broadcast strong', axis: 'color-mode', placeholder: '#0E808D' },
      { name: '--color-broadcast-bg', label: 'Broadcast tint', axis: 'color-mode', placeholder: '#D8F2F5' },
      { name: '--color-text-on-broadcast', label: 'Text on broadcast', axis: 'color-mode', placeholder: '#FFFFFF' },
    ],
  },
  {
    title: 'States',
    hint: 'Status colors (success, warning, danger, info) and their tints.',
    tokens: [
      { name: '--color-success', label: 'Success', axis: 'color-mode', placeholder: '#11827A' },
      { name: '--color-success-bg', label: 'Success tint', axis: 'color-mode', placeholder: '#D7EFEA' },
      { name: '--color-warning', label: 'Warning', axis: 'color-mode', placeholder: '#B07515' },
      { name: '--color-warning-bg', label: 'Warning tint', axis: 'color-mode', placeholder: '#F6ECD8' },
      { name: '--color-danger', label: 'Danger', axis: 'color-mode', placeholder: '#BA3B30' },
      { name: '--color-danger-bg', label: 'Danger tint', axis: 'color-mode', placeholder: '#F7E4E1' },
      { name: '--color-info', label: 'Info', axis: 'color-mode', placeholder: '#2F6FB0' },
      { name: '--color-info-bg', label: 'Info tint', axis: 'color-mode', placeholder: '#E3EDF7' },
    ],
  },
  {
    title: 'Focus',
    hint: 'The keyboard-focus ring.',
    tokens: [{ name: '--color-focus-ring', label: 'Focus ring', axis: 'color-mode', placeholder: '#E2912F' }],
  },
  {
    title: 'Feel',
    hint: 'The non-color axis: corner radius, motion timing, density, and generation feel. One value (no light/dark split).',
    tokens: [
      { name: '--radius-control', label: 'Radius · control', hint: 'Buttons and inputs.', axis: 'feel', feel: 'length', placeholder: '0.5rem' },
      { name: '--radius-card', label: 'Radius · card', hint: 'Cards and tiles.', axis: 'feel', feel: 'length', placeholder: '1rem' },
      { name: '--radius-pill', label: 'Radius · pill', hint: 'Pills and badges.', axis: 'feel', feel: 'length', placeholder: '9999px' },
      { name: '--motion-fast', label: 'Motion · fast', hint: 'Quick transitions.', axis: 'feel', feel: 'duration', placeholder: '130ms' },
      { name: '--motion-base', label: 'Motion · base', hint: 'Standard transitions.', axis: 'feel', feel: 'duration', placeholder: '260ms' },
      { name: '--motion-slow', label: 'Motion · slow', hint: 'Deliberate transitions.', axis: 'feel', feel: 'duration', placeholder: '700ms' },
      { name: '--density-root', label: 'Density', hint: 'Overall scale of the surface (a %).', axis: 'feel', feel: 'length', placeholder: '106.25%' },
      { name: '--type-scale', label: 'Type scale', hint: 'Unitless multiplier on type size.', axis: 'feel', feel: 'number', placeholder: '1' },
      { name: '--ornament', label: 'Ornament', hint: 'Decorative intensity, 0 to 1.', axis: 'feel', feel: 'number', placeholder: '0.6' },
      { name: '--tap-min', label: 'Tap target min', hint: 'Minimum interactive target size.', axis: 'feel', feel: 'length', placeholder: '32px' },
    ],
  },
] as const

/** The flat list of every color-mode token name (each gets a light + dark input). */
export const COLOR_TOKEN_NAMES: readonly string[] = TOKEN_GROUPS.flatMap((g) =>
  g.tokens.filter((t) => t.axis === 'color-mode').map((t) => t.name),
)

/** The flat list of every feel token name. */
export const FEEL_TOKEN_NAMES: readonly string[] = TOKEN_GROUPS.flatMap((g) =>
  g.tokens.filter((t) => t.axis === 'feel').map((t) => t.name),
)

/** Built-in skin slugs that already ship in code (lib/theme/skins.ts). A DB theme reusing one
 *  of these slugs overlays the same `[data-skin]` selector; flagged in the editor as a note. */
export const BUILT_IN_SLUGS: readonly string[] = ['default', 'midnight']

// Dev-only drift guard: every token the editor renders must be in the validation allowlist,
// and every allowlisted token must be covered by the editor. Logs (never throws) in non-prod
// so a token added to validate.ts without a matching editor entry is caught in review.
if (process.env.NODE_ENV !== 'production') {
  const editorNames = new Set<string>([...COLOR_TOKEN_NAMES, ...FEEL_TOKEN_NAMES])
  for (const name of editorNames) {
    if (!TOKEN_ALLOWLIST.has(name)) {
      console.warn(`[theme-studio] editor token not in TOKEN_ALLOWLIST: ${name}`)
    }
  }
  for (const name of TOKEN_ALLOWLIST) {
    if (!editorNames.has(name)) {
      console.warn(`[theme-studio] allowlisted token missing from editor: ${name}`)
    }
  }
}
