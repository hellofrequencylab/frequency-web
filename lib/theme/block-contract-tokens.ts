import MAP from './block-contract-map.json'

// THE CORE TOKEN CONTRACT (docs/THEME-COHESION.md section 1, ADR-1923, LIVE-1856). 45 names a role block may read, and
// one generated mapping per theme that points each name at the token that theme already declares (or, where it declares
// none, at a documented constant). Every mapping is `var(--existing)` or a constant, so the contract adds names and moves
// no value: lib/theme/block-contract-tokens.test.ts resolves every name against today's sheets and pins it.
//
// The mapping is GENERATED, never hand-edited: `UPDATE_CONTRACT_MAP=1 pnpm vitest run lib/theme/block-contract-tokens.test.ts`
// rewrites block-contract-map.json from the candidate table in that test. It is not yet emitted into any site render
// (a role block that reads it lands with LIVE-1857), so a live site renders exactly as before.
//
// Relation to the contract skin (components/sites/contract-skin-css.ts): its `--sk-*` roles are the same idea for the
// foreign-family fallback, read from the host's `--color-*`. Each maps onto a name below (canvas, surface, raised, line,
// line-strong, ink to text, muted to text-muted, subtle to text-subtle, accent, accent-deep, on-accent, band, on-band)
// and is left as it is; a later pass can re-point it at these names.

export const CORE_TOKEN_NAMES = [
  // Ground
  '--c-canvas', '--c-surface', '--c-raised', '--c-sunken',
  // Ink
  '--c-text', '--c-text-muted', '--c-text-subtle', '--c-on-accent',
  // Accent
  '--c-accent', '--c-accent-hover', '--c-accent-soft', '--c-accent-bg', '--c-accent-deep', '--c-accent-text',
  // Line
  '--c-line', '--c-line-strong',
  // Status and focus
  '--c-success', '--c-warning', '--c-danger', '--c-info', '--c-focus',
  // Band: the dark (or inverted) section and what reads on it
  '--c-band', '--c-on-band',
  // Shape
  '--r-control', '--r-card', '--r-panel', '--r-media', '--frame',
  // Depth
  '--shadow-card', '--shadow-lift',
  // Type
  '--f-display', '--f-body', '--f-label', '--f-voice', '--w-display', '--track-display', '--case-heading', '--lead-display',
  // Rhythm
  '--sp-section', '--sp-gap', '--sp-gutter', '--measure',
  // Motion
  '--dur-fast', '--dur', '--ease',
] as const

export type CoreTokenName = (typeof CORE_TOKEN_NAMES)[number]

/** The ten site themes (lib/theme/site-style.ts SiteThemeId). */
export const CONTRACT_THEME_IDS = ['frequency', 'bold', 'wildheart', 'network', 'network-kit', 'temple', 'temple-kit', 'midnight', 'designer', 'free-human'] as const

export type ContractThemeId = (typeof CONTRACT_THEME_IDS)[number]

/** The element each theme's tokens are declared on. Bold's code id is `menswork`; Default (`frequency`) wears the root. */
const SCOPE: Readonly<Record<ContractThemeId, string>> = {
  frequency: ':root[data-design="frequency"]',
  bold: '[data-house-theme="menswork"]',
  wildheart: '[data-house-theme="wildheart"]',
  network: '[data-house-theme="network"]',
  'network-kit': '[data-house-theme="network-kit"]',
  temple: '[data-house-theme="temple"]',
  'temple-kit': '[data-house-theme="temple-kit"]',
  midnight: '[data-house-theme="midnight"]',
  designer: '[data-house-theme="designer"]',
  'free-human': '[data-house-theme="free-human"]',
}

type Generated = { themes: Record<string, { names: Record<string, string> }> }

/** Name to value for one theme: a `var(--existing)` or a constant. */
export function coreTokenMap(theme: ContractThemeId): Readonly<Record<CoreTokenName, string>> {
  return (MAP as unknown as Generated).themes[theme].names as Record<CoreTokenName, string>
}

/** The theme's mapping as one CSS rule, scoped where the theme declares its own tokens. */
export function coreTokensCss(theme: ContractThemeId): string {
  const map = coreTokenMap(theme)
  return `${SCOPE[theme]}{${CORE_TOKEN_NAMES.map((n) => `${n}:${map[n]}`).join(';')}}`
}
