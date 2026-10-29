import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'
import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'
import { NETWORK_KIT_TOKENS_CSS } from '@/lib/theme/network-kit'
import { TEMPLE_TOKENS_CSS } from '@/lib/theme/temple'
import { TEMPLE_KIT_TOKENS_CSS } from '@/lib/theme/temple-kit'
import { WILDHEART_TOKENS_CSS } from '@/lib/theme/wildheart'
import type { SkinFamily } from '@/lib/sites/skin-family'
import { DESIGNER_BLOCKS_CSS } from './designer-blocks-css'
import { MIDNIGHT_BLOCKS_CSS } from './midnight-blocks-css'
import { MIDNIGHT_PRACTICE_CSS } from './midnight-practice-css'
import { NETWORK_KIT_BLOCKS_CSS } from './network-kit-blocks-css'
import { NETWORK_KIT_MORE_CSS } from './network-kit-more-css'
import { TEMPLE_BLOCKS_CSS } from './temple-blocks-css'
import { TEMPLE_KIT_BLOCKS_CSS } from './temple-kit-blocks-css'
import { WILDHEART_CSS } from './wildheart-css'

// THE CONTRACT SKIN (docs/THEME-COHESION.md, ADR-1923, LIVE-1853). A theme-named block family keeps its own shapes,
// rhythm and motion on any website theme and wears the HOST theme's palette and faces. Before this, a Designer block
// on a Temple site had no rule at all (4 to 25 percent of its themed classes were styled off-theme) and drew bare.
//
// How it works, the same way the Network island does (components/sites/network-css.ts):
//   · The renderer marks a family block's wrapper `data-skin-family="<theme id>"` (components/sites/menswork-page.tsx).
//   · This sheet is the family's own block rules, re-scoped from `[data-house-theme="<id>"]` to that wrapper, and only
//     where the site does not already wear the family's theme (the `:not(...)`), so a Designer site is untouched.
//   · The family's PRIVATE tokens are redeclared on the wrapper with its colors and faces read from the host's
//     contract (`--color-*`, `--font-display`, `--font-body`). Its shape tokens (radii, spacing, motion) stay its own.
//   · The family's generic `--color-*` and `--font-*` declarations are dropped, so the host's flow through.
// Only the site renderer sends it, and only for families the page carries: a member page never takes a site theme.

const ATTR = 'data-skin-family'
const island = (id: string) => `[${ATTR}="${id}"]:not([data-house-theme="${id}"] *)`
const rootOf = (id: string) => `[data-house-theme="${id}"]`
const rootSiteOf = (id: string) => `[data-house-site][data-house-theme="${id}"]`

/** The host's contract, under names every family's overrides read. A "band" is the host's text color and what sits on it
 *  is the host's canvas, so a dark band, a photo scrim and the words over them keep their contrast on a dark host too. Fallbacks cover a host that names its accent
 *  `--color-accent` (Designer, Midnight, Temple) rather than `--color-primary` (Frequency, Wildheart, Network). */
const ROLES = `--sk-canvas:var(--color-canvas);--sk-surface:var(--color-surface,var(--color-canvas));--sk-raised:var(--color-surface-elevated,var(--color-surface,var(--color-canvas)));
--sk-line:var(--color-border);--sk-line-strong:var(--color-border-strong,var(--color-border));
--sk-ink:var(--color-text);--sk-muted:var(--color-text-muted,var(--color-text));--sk-subtle:var(--color-text-subtle,var(--color-text-muted,var(--color-text)));
--sk-accent:var(--color-primary,var(--color-accent,var(--color-text)));--sk-accent-deep:var(--color-primary-strong,var(--color-accent-strong,var(--sk-accent)));
--sk-on-accent:var(--color-text-on-primary,var(--color-text-on-accent,var(--color-canvas)));
--sk-band:var(--sk-ink);--sk-on-band:var(--sk-canvas);`

const role = (name: string) => `var(--sk-${name})`
/** A role at an opacity, over nothing. */
const mix = (name: string, pct: number) => `color-mix(in srgb,var(--sk-${name}) ${pct}%,transparent)`

const CANVAS = role('canvas'), SURFACE = role('surface'), RAISED = role('raised'), LINE = role('line'), LINE_STRONG = role('line-strong')
const INK = role('ink'), MUTED = role('muted'), SUBTLE = role('subtle'), ACCENT = role('accent'), ACCENT_DEEP = role('accent-deep')
const ON_ACCENT = role('on-accent'), BAND = role('band'), ON_BAND = role('on-band')

type Overrides = Readonly<Record<string, string>>

const DESIGNER: Overrides = {
  '--dz-charcoal': INK, '--dz-charcoal-80': mix('ink', 80), '--dz-ink': INK, '--dz-stone': MUTED, '--dz-walnut': MUTED, '--dz-travertine': LINE_STRONG,
  '--dz-plaster': CANVAS, '--dz-parchment': SURFACE, '--dz-linen': RAISED, '--dz-paper': RAISED, '--dz-sand': RAISED, '--dz-sand-soft': SURFACE,
  '--dz-line': LINE, '--dz-line-soft': mix('ink', 8),
  '--dz-ochre': ACCENT, '--dz-ochre-deep': ACCENT_DEEP, '--dz-terracotta': ACCENT, '--dz-terracotta-deep': ACCENT_DEEP,
  '--dz-sage': ACCENT, '--dz-sage-soft': mix('accent', 18), '--dz-sage-deep': ACCENT_DEEP,
  '--dz-on-dark': ON_BAND, '--dz-on-dark-lead': ON_BAND, '--dz-on-dark-muted': mix('on-band', 82), '--dz-on-dark-text': mix('on-band', 84),
  '--dz-on-dark-soft': mix('on-band', 78), '--dz-on-dark-faint': mix('on-band', 60),
  '--dz-disc-dark': mix('accent', 6), '--dz-disc-dark-edge': mix('accent', 45),
  '--dz-fill-glass-35': mix('canvas', 35), '--dz-fill-light': mix('on-band', 4), '--dz-fill-light-hover': mix('on-band', 16),
  '--dz-glass': mix('canvas', 78), '--dz-glass-warm': mix('canvas', 86), '--dz-glass-dark': mix('band', 28),
  '--dz-hairline-dark': mix('on-band', 14), '--dz-rule-dark': mix('on-band', 16), '--dz-outline-light': mix('on-band', 75), '--dz-outline-light-70': mix('on-band', 70),
  '--dz-util-edge': mix('on-band', 18), '--dz-well': mix('on-band', 6), '--dz-well-edge': mix('on-band', 20), '--dz-wash': mix('canvas', 50),
  '--dz-action-hover': ACCENT_DEEP,
  '--dz-scrim-hero': `linear-gradient(90deg,${mix('ink', 62)} 0%,${mix('ink', 32)} 48%,${mix('ink', 8)} 100%),linear-gradient(180deg,${mix('ink', 0)} 55%,${mix('ink', 55)} 100%)`,
  '--dz-scrim-hero-page': `linear-gradient(90deg,${mix('ink', 64)} 0%,${mix('ink', 34)} 50%,${mix('ink', 10)} 100%),linear-gradient(180deg,${mix('ink', 0)} 55%,${mix('ink', 55)} 100%)`,
  '--dz-scrim-band': `linear-gradient(180deg,${mix('ink', 55)},${mix('ink', 70)})`,
  '--dz-scrim-card': `linear-gradient(180deg,${mix('ink', 0)} 35%,${mix('ink', 72)} 100%)`,
  '--dz-scrim-full': mix('ink', 32),
  '--dz-scrim-header': `linear-gradient(180deg,${mix('ink', 55)} 0%,${mix('ink', 18)} 70%,${mix('ink', 0)} 100%)`,
  '--dz-tile-dark': `linear-gradient(160deg,${mix('on-band', 8)},${mix('on-band', 2)})`,
  '--dz-tile-dark-hover': `linear-gradient(160deg,${mix('on-band', 13)},${mix('on-band', 4)})`,
  '--dz-tile-dark-edge': `inset 0 1px 0 ${mix('on-band', 7)},inset 0 0 0 1px ${mix('on-band', 8)}`,
  '--dz-display': 'var(--font-display)', '--dz-sans': 'var(--font-body)',
}

const MIDNIGHT: Overrides = {
  '--mn-night-0': CANVAS, '--mn-night-50': CANVAS, '--mn-night-100': SURFACE, '--mn-night-150': RAISED, '--mn-night-200': RAISED,
  '--mn-night-300': LINE, '--mn-night-400': LINE_STRONG, '--mn-night-500': LINE_STRONG,
  '--mn-ash-400': SUBTLE, '--mn-ash-300': SUBTLE, '--mn-ash-200': MUTED,
  '--mn-bone-100': INK, '--mn-bone-50': INK, '--mn-bone-0': INK,
  '--mn-violet-300': ACCENT, '--mn-violet-400': ACCENT, '--mn-violet-500': ACCENT_DEEP, '--mn-violet-900': mix('accent', 20),
  '--mn-ember-300': ACCENT, '--mn-ember-400': ACCENT, '--mn-ember-500': ACCENT_DEEP, '--mn-ember-900': mix('accent', 20),
  '--mn-scrim': mix('canvas', 72), '--mn-media-protect': `linear-gradient(180deg,${mix('canvas', 0)} 40%,${mix('canvas', 78)} 100%)`,
  '--mn-solid': INK, '--mn-solid-hover': INK, '--mn-on-solid': CANVAS, '--mn-rule': mix('ink', 14), '--mn-glass': mix('canvas', 72),
  '--mn-display': 'var(--font-display)', '--mn-label': 'var(--font-display)', '--mn-sans': 'var(--font-body)',
}

const NETWORK_KIT: Overrides = {
  '--nk-th-accent': ACCENT, '--nk-th-accent-bg': mix('accent', 14), '--nk-th-accent-deep': ACCENT_DEEP, '--nk-th-accent-soft': mix('accent', 22),
  '--nk-th-accent-text': ACCENT_DEEP, '--nk-th-bg': CANVAS, '--nk-th-body': 'var(--font-body)', '--nk-th-display': 'var(--font-display)',
  '--nk-th-hairline': LINE, '--nk-th-mono': 'var(--font-body)', '--nk-th-muted': SUBTLE, '--nk-th-on-accent': ON_ACCENT, '--nk-th-on-season': INK,
  '--nk-th-raised': RAISED, '--nk-th-season': mix('accent', 18), '--nk-th-secondary': MUTED, '--nk-th-surface': SURFACE, '--nk-th-text': INK,
  '--nk-kit-accent': ACCENT, '--nk-kit-accent-bg': mix('accent', 14), '--nk-kit-accent-deep': ACCENT_DEEP, '--nk-kit-accent-hover': ACCENT_DEEP,
  '--nk-kit-accent-soft': mix('accent', 22), '--nk-kit-accent-text': ACCENT_DEEP,
  '--nk-accent': ACCENT, '--nk-accent-ink': ON_ACCENT, '--nk-accent-text': ACCENT_DEEP,
  '--nk-acc': ACCENT, '--nk-acc-on': ON_ACCENT, '--nk-acc-text': ACCENT_DEEP, '--nk-acc-deep': ACCENT_DEEP, '--nk-acc-hover': ACCENT_DEEP,
  '--nk-acc-soft': mix('accent', 22), '--nk-acc-bg': mix('accent', 14),
  '--nk-tg-paper': CANVAS, '--nk-tg-surface': SURFACE, '--nk-tg-card': RAISED, '--nk-tg-card-2': RAISED, '--nk-tg-line': LINE, '--nk-tg-line-strong': LINE_STRONG,
  '--nk-tg-ink': INK, '--nk-tg-ink-2': INK, '--nk-gray-900': INK, '--nk-gray-800': INK, '--nk-gray-700': MUTED, '--nk-gray-600': MUTED, '--nk-gray-500': SUBTLE, '--nk-tg-muted': MUTED, '--nk-tg-subtle': SUBTLE, '--nk-tg-sand': RAISED, '--nk-tg-sand-line': LINE,
  '--nk-glow-sand': RAISED, '--nk-on-ink-muted': mix('on-band', 82), '--nk-on-ink-subtle': mix('on-band', 60),
  '--nk-display': 'var(--font-display)', '--nk-sans': 'var(--font-body)', '--nk-accent-face': 'var(--font-display)', '--nk-hand': 'var(--font-display)',
}

const TEMPLE: Overrides = {
  '--tp-plaster-50': RAISED, '--tp-plaster-100': CANVAS, '--tp-plaster-200': RAISED, '--tp-plaster-300': LINE_STRONG, '--tp-plaster-400': LINE_STRONG,
  '--tp-card': SURFACE, '--tp-umber-900': BAND, '--tp-umber-800': INK, '--tp-umber-700': INK, '--tp-umber-600': MUTED, '--tp-umber-500': SUBTLE,
  '--tp-umber-400': SUBTLE, '--tp-muted': SUBTLE,
  '--tp-clay-700': ACCENT_DEEP, '--tp-clay-600': ACCENT_DEEP, '--tp-clay-500': ACCENT, '--tp-clay-400': ACCENT, '--tp-clay-300': mix('accent', 45), '--tp-clay-100': mix('accent', 12),
  '--tp-saffron-600': ACCENT_DEEP, '--tp-saffron-500': ACCENT, '--tp-saffron-400': ACCENT, '--tp-saffron-200': mix('accent', 30),
  '--tp-olive-700': ACCENT_DEEP, '--tp-olive-600': ACCENT_DEEP, '--tp-olive-500': ACCENT, '--tp-olive-300': mix('accent', 45), '--tp-olive-100': mix('accent', 12),
  '--tp-aegean-800': BAND, '--tp-aegean-600': ACCENT_DEEP, '--tp-aegean-500': ACCENT, '--tp-aegean-300': mix('accent', 45), '--tp-aegean-100': mix('accent', 12),
  '--tp-fig-700': ACCENT_DEEP, '--tp-fig-500': ACCENT, '--tp-fig-300': mix('accent', 45),
  '--tp-focus': ACCENT, '--tp-on-clay': ON_ACCENT, '--tp-on-ink': ON_BAND, '--tp-line': LINE, '--tp-rule': LINE_STRONG, '--tp-line-on-ink': mix('on-band', 24),
  '--tp-veil': mix('ink', 6), '--tp-veil-ink': mix('on-band', 6), '--tp-glass': mix('canvas', 72), '--tp-glass-ink': mix('band', 44),
  '--tp-frame-on-photo': mix('canvas', 50), '--tp-row-hover': mix('canvas', 72), '--tp-field': mix('canvas', 50), '--tp-link-line': mix('accent', 35),
  '--tp-dashed': mix('ink', 14), '--tp-gloss': mix('canvas', 28), '--tp-gloss-ink': mix('on-band', 16),
  '--tp-veil-bottom': `linear-gradient(to top,${mix('ink', 78)} 0%,${mix('ink', 45)} 38%,${mix('ink', 0)} 78%)`,
  '--tp-veil-full': `linear-gradient(to bottom,${mix('ink', 30)},${mix('ink', 58)})`,
  '--tp-display': 'var(--font-display)', '--tp-serif': 'var(--font-display)', '--tp-quote': 'var(--font-display)', '--tp-sans': 'var(--font-body)',
}

const TEMPLE_KIT: Overrides = {
  '--accent-general': ACCENT, '--accent-general-bg': mix('accent', 14), '--accent-general-deep': ACCENT_DEEP, '--accent-general-hover': ACCENT_DEEP,
  '--accent-general-soft': mix('accent', 22), '--accent-general-text': ACCENT_DEEP,
  '--tk-clay-300': mix('accent', 45), '--tk-clay-500': ACCENT, '--tk-saffron-600': ACCENT_DEEP, '--tk-plaster-400': LINE_STRONG,
  '--tk-umber-400': SUBTLE, '--tk-umber-500': SUBTLE, '--tk-umber-600': MUTED,
  '--tk-olive-100': mix('accent', 12), '--tk-olive-300': mix('accent', 45), '--tk-olive-600': ACCENT_DEEP, '--tk-olive-700': ACCENT_DEEP,
  '--tk-aegean-100': mix('accent', 12), '--tk-aegean-300': mix('accent', 45), '--tk-aegean-600': ACCENT_DEEP, '--tk-aegean-800': BAND,
  '--tk-plaster-50': RAISED, '--tk-plaster-100': CANVAS, '--tk-plaster-200': RAISED, '--tk-plaster-300': LINE_STRONG,
  '--tk-umber-900': BAND, '--tk-umber-800': INK, '--tk-umber-700': INK,
  '--tk-clay-700': ACCENT_DEEP, '--tk-clay-600': ACCENT_DEEP, '--tk-clay-100': mix('accent', 12),
  '--tk-saffron-500': ACCENT, '--tk-saffron-400': ACCENT, '--tk-saffron-200': mix('accent', 30),
  '--veil-bottom': `linear-gradient(to top,${mix('ink', 78)} 0%,${mix('ink', 45)} 38%,${mix('ink', 0)} 78%)`,
  '--veil-full': `linear-gradient(to bottom,${mix('ink', 30)},${mix('ink', 58)})`,
  '--veil-plaster': `linear-gradient(to top,${mix('canvas', 96)} 0%,${mix('canvas', 0)} 70%)`, '--glass-ink': mix('band', 44),
  '--glass-plaster': mix('canvas', 72), '--line-hairline': LINE, '--line-on-ink': mix('on-band', 24), '--line-rule': LINE_STRONG,
  '--surface-card': SURFACE, '--surface-veil': mix('ink', 6), '--text-on-clay': ON_ACCENT,
  '--kit-accent': ACCENT, '--kit-accent-bg': mix('accent', 14), '--kit-accent-deep': ACCENT_DEEP, '--kit-accent-hover': ACCENT_DEEP, '--kit-accent-soft': mix('accent', 22),
  '--font-hero': 'var(--font-display)', '--font-quote': 'var(--font-display)', '--font-serif': 'var(--font-display)', '--font-sans': 'var(--font-body)',
  '--font-hand': 'var(--font-display)', '--font-accent': 'var(--font-display)',
}

const WILDHEART: Overrides = {
  '--wh-parchment': CANVAS, '--wh-vellum': SURFACE, '--wh-aged': RAISED, '--wh-hairline': LINE, '--wh-muted': SUBTLE, '--wh-secondary': MUTED, '--wh-ink': INK,
  '--wh-border-strong': LINE_STRONG, '--wh-violet': ACCENT, '--wh-violet-pressed': ACCENT_DEEP, '--wh-violet-text': ACCENT_DEEP, '--wh-violet-top': ACCENT,
  '--wh-lavender': mix('accent', 45), '--wh-mist': mix('accent', 12), '--wh-nightshade': BAND,
  '--wh-madder': ACCENT, '--wh-madder-top': ACCENT, '--wh-madder-deep': ACCENT_DEEP, '--wh-madder-soft': mix('accent', 14),
  '--wh-blush': mix('accent', 14), '--wh-blush-top': ACCENT, '--wh-nightshade-top': BAND,
  '--wh-symbol-line': mix('ink', 70), '--wh-symbol-line-soft': mix('ink', 32), '--wh-symbol-ghost': mix('ink', 20),
  '--wh-a-ink-04': mix('ink', 4), '--wh-a-ink-06': mix('ink', 6), '--wh-a-ink-12': mix('ink', 12),
  '--wh-a-violet-12': mix('accent', 12), '--wh-a-violet-13': mix('accent', 13), '--wh-a-violet-35': mix('accent', 35),
  '--wh-a-madder-05': mix('accent', 5), '--wh-a-madder-16': mix('accent', 16), '--wh-a-madder-35': mix('accent', 35),
  '--wh-a-lavender-75': mix('accent', 45), '--wh-a-honey-14': mix('accent', 14), '--wh-a-star-honey': ACCENT, '--wh-a-sage-18': mix('accent', 18),
  '--wh-a-night-28': mix('band', 28), '--wh-a-veil-0': 'color-mix(in srgb,var(--sk-canvas) 0%,transparent)', '--wh-a-veil-85': mix('canvas', 85),
  '--wh-a-wash-violet': mix('accent', 10), '--wh-a-wash-madder': mix('accent', 8), '--wh-a-wash-moon': mix('accent', 6), '--wh-a-wash-blush': mix('accent', 8),
  '--wh-text-on-fill': ON_ACCENT, '--wh-text-on-season': INK,
  '--wh-display': 'var(--font-display)', '--wh-ui': 'var(--font-body)', '--wh-body': 'var(--font-body)',
}

/** The generic names a family's token block sets for its own site. Dropped from the island copy so the host's flow
 *  through (a family face would otherwise shadow the host's, and a self-reference would be invalid). */
const HOST_OWNED = /--(?:color-[a-z0-9-]+|font-(?:display|heading|body|label|mono|sans)):[^;{}]*(?:;|(?=\}))|color-scheme:[a-z]+;?/g
/** Rules for a site's own look axes, chrome and scroll: they read attributes the island does not carry. */
const SITE_ONLY = /\[data-site-|\[data-mode|\[data-scheme|\[data-kit=|html:has|body:has|\[data-house-site\]\[data-house-theme="[^"]+"\]\s*\[data-mw-own\]/

type Family = {
  id: SkinFamily
  tokens: string
  sheets: readonly string[]
  /** Keep only the lines that style the family's blocks (Wildheart's blocks share one sheet with its site chrome). */
  only?: RegExp
  overrides: Overrides
  /** Private colors the family keeps on every theme because they carry a meaning (a status, a season). */
  keep?: readonly string[]
}

const FAMILIES: Readonly<Record<SkinFamily, Family>> = {
  designer: { id: 'designer', tokens: DESIGNER_TOKENS_CSS, sheets: [DESIGNER_BLOCKS_CSS], overrides: DESIGNER },
  midnight: { id: 'midnight', tokens: MIDNIGHT_TOKENS_CSS, sheets: [MIDNIGHT_BLOCKS_CSS, MIDNIGHT_PRACTICE_CSS], overrides: MIDNIGHT },
  'network-kit': { id: 'network-kit', tokens: NETWORK_KIT_TOKENS_CSS, sheets: [NETWORK_KIT_BLOCKS_CSS, NETWORK_KIT_MORE_CSS], overrides: NETWORK_KIT, keep: ['--nk-amber-500', '--nk-green-500', '--nk-info-500', '--nk-red-500'] },
  temple: { id: 'temple', tokens: TEMPLE_TOKENS_CSS, sheets: [TEMPLE_BLOCKS_CSS], overrides: TEMPLE },
  'temple-kit': { id: 'temple-kit', tokens: TEMPLE_KIT_TOKENS_CSS, sheets: [TEMPLE_KIT_BLOCKS_CSS], overrides: TEMPLE_KIT, keep: ['--danger-100', '--danger-600'] },
  wildheart: { id: 'wildheart', tokens: WILDHEART_TOKENS_CSS, sheets: [WILDHEART_CSS], only: /\.wh-|@keyframes wh-/, overrides: WILDHEART,
    keep: ['--wh-season-spring', '--wh-season-spring-top', '--wh-season-spring-ink', '--wh-season-summer', '--wh-season-summer-top', '--wh-season-summer-ink',
      '--wh-season-fall', '--wh-season-fall-top', '--wh-season-fall-ink', '--wh-season-winter', '--wh-season-winter-top', '--wh-season-winter-ink'] },
}

/** Top-level rules of a sheet: a `selector{...}` or an `@media{...}` with its nested rules, brace-matched. */
function topLevelRules(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      out.push(css.slice(start, i + 1))
      start = i + 1
    }
  }
  const tail = css.slice(start)
  if (tail.trim()) out.push(tail)
  return out
}

/** A family's CSS re-scoped from its theme root to the island, with the site-only rules left out. */
export function rescope(css: string, id: string, only?: RegExp): string {
  return topLevelRules(css)
    .filter((rule) => {
      const selector = rule.slice(0, rule.indexOf('{'))
      return !SITE_ONLY.test(selector) && (!only || only.test(rule))
    })
    .join('\n')
    .replaceAll(rootSiteOf(id), island(id))
    .replaceAll(rootOf(id), island(id))
}

function build(f: Family): string {
  const scope = island(f.id)
  const tokens = rescope(f.tokens, f.id).replace(HOST_OWNED, '')
  const overrides = Object.entries(f.overrides).map(([name, value]) => `${name}:${value}`).join(';')
  // The overrides come last: a family sheet that sets a token on its own root would otherwise win the tie.
  return `${tokens}
${f.sheets.map((sheet) => rescope(sheet, f.id, f.only)).join('\n')}
${scope}{${ROLES}${overrides}}`
}

const cache = new Map<SkinFamily, string>()

/** The sheet for the given families, built once each. Pass only the families a page carries, minus the site's own. */
export function contractSkinCss(families: Iterable<SkinFamily>): string {
  const out: string[] = []
  for (const id of families) {
    let css = cache.get(id)
    if (css === undefined) cache.set(id, (css = build(FAMILIES[id])))
    out.push(css)
  }
  return out.join('\n')
}

/** For the conformance test: every family's definition. */
export const CONTRACT_SKIN_FAMILIES = FAMILIES
export const CONTRACT_SKIN_ATTR = ATTR
