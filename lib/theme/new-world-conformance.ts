import { NEW_WORLD_BLOCKS_CSS } from '@/components/sites/new-world-blocks-css'
import { NEW_WORLD_CSS } from '@/components/sites/new-world-css'
import { NEW_WORLD_SECTIONS_CSS } from '@/components/sites/new-world-sections-css'
import { NEW_WORLD_KIT_NICHES, newWorldKit } from '@/lib/sites/kits/new-world-variants'
import { NEW_WORLD_FUNCTIONS, newWorldSectionFunction } from '@/lib/sites/new-world-functions'
import { contrastRatio } from '@/lib/spaces/accent'
import { newWorldKitSpotlightContent } from '@/lib/spotlight/new-world-kit-content'
import { literalColours } from '@/lib/theme/conformance'
import { NEW_WORLD_ACCENTS, newWorldAccentVars } from '@/lib/theme/new-world'

// NEW WORLD CONFORMANCE, LIVE (design handoff reference/Conformance.html; THEME-EDITOR-FRAMEWORK §7). The ten invariants run
// against New World's real code on every request: the accent presets, the site sheets, the seven kits and their Spotlight. A
// check that needs a rendered page in a browser (height stability, repaint) or a dial the theme does not ship yet (reset) says
// so as Skipped, never as a pass. PURE: no React, no Next, no Supabase. The admin page (app/(main)/admin/appearance/conformance)
// only draws what this returns.

/** `ruled`: the check misses the handoff's number because the owner ruled otherwise (white labels on accent buttons). */
type Result = 'pass' | 'fail' | 'skip' | 'ruled'
export interface ConformanceRow { id: string; name: string; result: Result; detail: string }

// The two grounds and the text each register mixes the accent toward (lib/theme/new-world.ts, --nw-ink-900 and --nw-chrome-50).
const NIGHT = { ground: '#0A0E16', chrome: '#F2F5FA', mix: 0.7 }
const DAY = { ground: '#FFFFFF', chrome: '#34312E', mix: 0.62 }

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function oklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLin(v / 255)) as [number, number, number]
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt) as [number, number, number]
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab([L, A, B]: [number, number, number]): string {
  const [l, m, s] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B].map((v) => v ** 3) as [number, number, number]
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255).toString(16).padStart(2, '0')).join('')
}
/** CSS color-mix(in oklab, a p, b). */
function mix(a: string, b: string, p: number): string {
  const [x, y] = [oklab(a), oklab(b)]
  return fromOklab([0, 1, 2].map((i) => x[i]! * p + y[i]! * (1 - p)) as [number, number, number])
}

/** Accent text on the ground, both registers, every preset (the sheet's --nwa-text). */
function accentText(): ConformanceRow {
  let worst = { r: 99, at: '' }
  for (const [id, a] of Object.entries(NEW_WORLD_ACCENTS)) {
    for (const [reg, g] of [['Night', NIGHT], ['Day', DAY]] as const) {
      const r = contrastRatio(mix(a.accent, g.chrome, g.mix), g.ground)
      if (r < worst.r) worst = { r, at: `${a.label ?? id} on ${reg}` }
    }
  }
  return { id: 'contrast-text', name: '1 · Contrast, accent text', result: worst.r >= 4.5 ? 'pass' : 'fail', detail: `Lowest ${worst.r.toFixed(2)}:1 (${worst.at}). Needs 4.5:1 on both registers.` }
}

/** The label a filled accent button carries (--color-text-on-primary), on the accent itself. */
function buttonLabel(): ConformanceRow {
  let worst = { r: 99, at: '', label: '' }
  for (const a of Object.values(NEW_WORLD_ACCENTS)) {
    const label = newWorldAccentVars(a.accent)['--color-text-on-primary']!
    const r = contrastRatio(label, a.accent)
    if (r < worst.r) worst = { r, at: a.label, label }
  }
  const white = worst.label.toUpperCase() === '#FFFFFF'
  const ok = worst.r >= 4.5
  return {
    id: 'contrast-button', name: '1 · Contrast, filled button label', result: ok ? 'pass' : white ? 'ruled' : 'fail',
    detail: `Lowest ${worst.r.toFixed(2)}:1 (${white ? 'white' : 'ink'} on ${worst.at}). The handoff asks for 4.5:1.${!ok && white ? ' Accent buttons carry white labels by the owner\'s rule, which beats the handoff here.' : ''}`,
  }
}

function noLiterals(): ConformanceRow {
  const found = [...literalColours(NEW_WORLD_SECTIONS_CSS, 'section sheet'), ...literalColours(NEW_WORLD_BLOCKS_CSS, 'block sheet')]
  return { id: 'literals', name: '2 · No literal colours in blocks', result: found.length ? 'fail' : 'pass', detail: found.length ? `${found.length} found: ${found.slice(0, 4).join(', ')}` : 'Every colour in the New World section and block sheets is a token.' }
}

function motion(): ConformanceRow[] {
  const css = NEW_WORLD_CSS + NEW_WORLD_SECTIONS_CSS
  const off = css.includes('data-motion="off"'), calm = css.includes('data-motion="calm"')
  return [
    { id: 'motion-additive', name: '4 · Motion is additive', result: off && calm ? 'pass' : 'fail', detail: off && calm ? 'Calm and Off rules exist and only remove effect layers.' : `Missing the ${[off ? '' : 'Off', calm ? '' : 'Calm'].filter(Boolean).join(' and ')} motion rule${off || calm ? '' : 's'}.` },
    { id: 'reduced-motion', name: '5 · Reduced motion wins', result: /prefers-reduced-motion:\s*reduce/.test(css) ? 'pass' : 'fail', detail: 'The site sheets carry a prefers-reduced-motion block.' },
  ]
}

/** Each kit's website Home and Spotlight show no section or door for a function the kit has off. */
function hiddenFunctions(): ConformanceRow {
  const gaps: string[] = []
  for (const n of NEW_WORLD_KIT_NICHES) {
    const kit = newWorldKit(n)
    const on = new Set(kit.pages.find((p) => p.slug === 'home')!.blocks.map((b) => newWorldSectionFunction(b.type)).filter(Boolean))
    const doors = new Set(newWorldKitSpotlightContent(n).doors.map((d) => d.id))
    for (const f of NEW_WORLD_FUNCTIONS) if (!on.has(f.id) && doors.has(f.id)) gaps.push(`${n}: ${f.id} door`)
  }
  return { id: 'hidden-functions', name: '7 · Hidden functions leave no gap', result: gaps.length ? 'fail' : 'pass', detail: gaps.length ? gaps.slice(0, 6).join(', ') : `Across ${NEW_WORLD_KIT_NICHES.length} kits, no Spotlight door exists for a function the website has off.` }
}

/** Every way in on the website appears on the Spotlight with the same name and price. */
function surfaceParity(): ConformanceRow {
  const words = (v: unknown) => String(v ?? '').replace(/\{\{[^|}]*\|([^}]*)\}\}/g, '$1')
  const gaps: string[] = []
  for (const n of NEW_WORLD_KIT_NICHES) {
    const rows = (newWorldKit(n).pages.find((p) => p.slug === 'services')!.blocks.find((b) => b.type === 'NewWorldWayRows')?.props?.rows ?? []) as { name?: string; price?: string }[]
    const offers = newWorldKitSpotlightContent(n).offers
    for (const r of rows) if (!offers.some((o) => o.name === words(r.name) && o.price === words(r.price))) gaps.push(`${n}: ${words(r.name)}`)
  }
  return { id: 'surface-parity', name: '9 · Surface parity', result: gaps.length ? 'fail' : 'pass', detail: gaps.length ? `On the website, not the Spotlight: ${gaps.slice(0, 6).join(', ')}` : 'Every way in shows on the Spotlight with the same name and price.' }
}

const skip = (id: string, name: string, detail: string): ConformanceRow => ({ id, name, result: 'skip', detail })

/** The ten invariants, in the handoff's order. */
export function newWorldConformance(): ConformanceRow[] {
  return [
    accentText(),
    buttonLabel(),
    noLiterals(),
    skip('height', '3 · Height stability across type voices', 'Needs a rendered site at 1440 wide. Runs in the theme conformance spec (test/e2e/theme-conformance.spec.ts).'),
    ...motion(),
    skip('empty-states', '6 · Empty states designed', 'Needs a Space with no content rendered in a browser.'),
    hiddenFunctions(),
    skip('reset', '8 · Reset is total', 'Waits on New World\'s theme editor dials, which are not shipped yet.'),
    surfaceParity(),
    skip('repaint', '10 · Dial change repaints without reload', 'Needs a rendered site and the theme editor dials.'),
  ]
}
