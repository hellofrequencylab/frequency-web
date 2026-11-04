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
export const CONTRACT_THEME_IDS = ['frequency', 'bold', 'wildheart', 'network', 'network-kit', 'temple', 'temple-kit', 'midnight', 'designer', 'free-human', 'services', 'new-world', 'cyberwitch'] as const

export type ContractThemeId = (typeof CONTRACT_THEME_IDS)[number]

/** Frequency declares its aliases on every element that redefines its `--fq-*` tokens (app/themes/frequency.css,
 *  "one rule, two surfaces"): the root (Commons, and Commons night under `.dark`), each Stage surface, a night section
 *  and a skinned subtree. A custom property resolves its var() where it is declared, so a contract name declared on
 *  the root alone would freeze Commons values into a Stage section. The contract rides the same elements (BLD-001). */
const FREQUENCY_CONTRACT_SCOPE = [
  ':root[data-design="frequency"]',
  '[data-design="frequency"] [data-surface="stage"]',
  '[data-design="frequency"][data-surface="stage"]',
  '[data-design="frequency"] [data-time="night"]',
  '[data-design="frequency"] [data-skin]',
  '[data-design="frequency"][data-skin]',
] as const

/** The element each theme's tokens are declared on. Bold's code id is `menswork`; Frequency wears its alias elements. */
const SCOPE: Readonly<Record<ContractThemeId, string>> = {
  frequency: FREQUENCY_CONTRACT_SCOPE.join(','),
  bold: '[data-house-theme="menswork"]',
  wildheart: '[data-house-theme="wildheart"]',
  network: '[data-house-theme="network"]',
  'network-kit': '[data-house-theme="network-kit"]',
  temple: '[data-house-theme="temple"]',
  'temple-kit': '[data-house-theme="temple-kit"]',
  midnight: '[data-house-theme="midnight"]',
  designer: '[data-house-theme="designer"]',
  'free-human': '[data-house-theme="free-human"]',
  services: '[data-house-theme="services"]',
  'new-world': '[data-house-theme="new-world"]',
  cyberwitch: '[data-house-theme="cyberwitch"]',
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

/** The handoff's editor roles (`--th-*`, design_handoff/frequency/guidelines/element-library.md and
 *  assets/infographics/theme-pack.json, plus the editor seed lib/sites/editor/theme-contract.json) pointed at the
 *  contract name that carries the same role (BLD-001). The handoff is read-only, so the retirement lives here: a reader
 *  of either file looks the name up in this table. `null` marks a role that is one theme's private vocabulary (a season
 *  colour, a gilt, an arch) and has no contract name; a role block never reads it. */
export const TH_TO_CONTRACT: Readonly<Record<string, CoreTokenName | null>> = {
  '--th-bg': '--c-canvas',
  '--th-surface': '--c-surface',
  '--th-raised': '--c-raised',
  '--th-hairline': '--c-line',
  '--th-text': '--c-text',
  '--th-muted': '--c-text-muted',
  '--th-secondary': '--c-text-muted',
  '--th-accent': '--c-accent',
  '--th-accent-hover': '--c-accent-hover',
  '--th-accent-soft': '--c-accent-soft',
  '--th-accent-bg': '--c-accent-bg',
  '--th-accent-deep': '--c-accent-deep',
  '--th-accent-text': '--c-accent-text',
  '--th-on-accent': '--c-on-accent',
  '--th-r': '--r-card',
  '--th-clip-md': '--frame',
  '--th-display': '--f-display',
  '--th-dw': '--w-display',
  '--th-body': '--f-body',
  '--th-voice': '--f-voice',
  '--th-quote': '--f-voice',
  '--th-solid': '--c-accent',
  '--th-on-solid': '--c-on-accent',
  '--th-solid-hover': '--c-accent-hover',
  '--th-hero': '--f-display',
  '--th-clip-sm': null,
  '--th-clip-lg': null,
  '--th-mono': null,
  '--th-season': null,
  '--th-on-season': null,
  '--th-gilt': null,
  '--th-on-gilt': null,
  '--th-arch': null,
  '--th-r-lg': null,
  '--th-r-sm': null,
  '--th-scrawl': null,
}
