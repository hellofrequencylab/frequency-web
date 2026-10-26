// The Frequency half of the contrast gate (SCAN-1115).
//
// scripts/check-contrast.mjs resolves tokens from app/globals.css alone, by walking ONE element's
// matching rules. Frequency cannot be measured that way: its colours are declared on TWO elements.
// The root (<html data-design="frequency">, with `.dark` at night) holds Commons; a Stage section
// (`data-surface="stage"`) redeclares the --fq-* palette and the DAWN-name aliases on itself, because
// a custom property that reads var() resolves where it is declared. So this resolver models a chain
// of elements (root, then the surface) and computes each element's custom properties the way CSS
// does: the winning declaration per name, var() substituted against THAT element, then inherited.
//
// Sheets are read in the order app/layout.tsx imports them: globals.css, the generated core, the
// alias layer. Equal specificity goes to the later sheet.
//
// Only the selector shapes the Frequency sheets use are understood: `:root`, `.class`, `[attr]`,
// `[attr="v"]`, `:not(...)` of those, and the descendant combinator. Any other selector is
// reported through `unsupported` rather than silently scored, so a new shape cannot make the gate
// quietly stop measuring a block.

import { topLevelRules, declarations, splitSelectorList, parseColor } from '../check-contrast.mjs'

export const FREQUENCY_SHEETS = ['app/globals.css', 'app/themes/frequency/core.css', 'app/themes/frequency.css']

/** @typedef {{ root?: boolean, classes?: string[], attrs?: Record<string, string> }} Node */

/** The render states Frequency actually paints. `chain` runs from <html> to the element. */
export const FREQUENCY_STATES = [
  { key: 'Commons day', mode: 'light', chain: [root(false)] },
  { key: 'Commons night', mode: 'dark', chain: [root(true)] },
  { key: 'Stage on a light device', mode: 'light', chain: [root(false), stage()] },
  { key: 'Stage on a dark device', mode: 'dark', chain: [root(true), stage()] },
]

function root(dark) {
  return { root: true, classes: dark ? ['dark'] : [], attrs: { 'data-design': 'frequency' } }
}
function stage() {
  return { classes: [], attrs: { 'data-surface': 'stage' } }
}

/** Parse one compound (`:root.dark[data-design="frequency"]:not(.dark)`) into its simple tests. */
function parseCompound(text) {
  const tests = []
  let weight = 0
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    let m
    if ((m = rest.match(/^\*/))) {
      // universal: matches any element, adds no specificity
    } else if ((m = rest.match(/^:root/))) {
      tests.push({ root: true })
      weight += 10
    } else if ((m = rest.match(/^\.([A-Za-z0-9_-]+)/))) {
      tests.push({ cls: m[1] })
      weight += 10
    } else if ((m = rest.match(/^\[([a-z-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]/))) {
      tests.push({ attr: m[1], value: m[2] ?? m[3] })
      weight += 10
    } else if (rest.startsWith(':not(')) {
      let depth = 0
      let j = 4
      for (; j < rest.length; j++) {
        if (rest[j] === '(') depth++
        else if (rest[j] === ')' && --depth === 0) break
      }
      const inner = splitSelectorList(rest.slice(5, j)).map((x) => parseSelector(x))
      if (inner.some((x) => !x)) return null
      tests.push({ not: inner })
      weight += Math.max(0, ...inner.map((x) => x.weight))
      m = [rest.slice(0, j + 1)]
    } else {
      return null
    }
    i += m[0].length
  }
  return { tests, weight }
}

/** Parse one selector part into descendant-separated compounds, or null when unsupported. */
export function parseSelector(part) {
  const s = part.replace(/\s+/g, ' ').trim()
  if (!s || /[>+~]/.test(s.replace(/\[[^\]]*\]/g, ''))) return null
  const compounds = []
  let weight = 0
  // Split on spaces that are not inside [] or ().
  let depth = 0
  let start = 0
  const pieces = []
  for (let i = 0; i <= s.length; i++) {
    const c = s[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if ((c === ' ' || i === s.length) && depth === 0) {
      pieces.push(s.slice(start, i))
      start = i + 1
    }
  }
  for (const p of pieces) {
    const c = parseCompound(p)
    if (!c) return null
    compounds.push(c.tests)
    weight += c.weight
  }
  return { compounds, weight }
}

function testNode(chain, index, t) {
  const node = chain[index]
  if (t.root) return Boolean(node.root)
  if (t.cls) return (node.classes ?? []).includes(t.cls)
  if (t.attr) {
    const v = node.attrs?.[t.attr]
    return t.value === undefined ? v !== undefined : v === t.value
  }
  if (t.not) return !t.not.some((sel) => matches(chain, index, sel))
  return false
}

const matchCompound = (chain, index, tests) => tests.every((t) => testNode(chain, index, t))

/** Weight of the selector list's strongest part that matches the node at chain[index], or null. */
export function frequencyWeight(selector, chain, index) {
  let best = null
  for (const raw of splitSelectorList(selector)) {
    const sel = parseSelector(raw)
    if (sel && matches(chain, index, sel) && (best === null || sel.weight > best)) best = sel.weight
  }
  return best
}

/** Does a parsed selector match the element at chain[index]? Ancestors are chain[0..index-1]. */
function matches(chain, index, { compounds }) {
  if (!matchCompound(chain, index, compounds[compounds.length - 1])) return false
  // Walk the ancestors right to left, each compound matching the nearest ancestor that fits.
  let at = index
  for (let c = compounds.length - 2; c >= 0; c--) {
    let found = -1
    for (let a = at - 1; a >= 0; a--) {
      if (matchCompound(chain, a, compounds[c])) {
        found = a
        break
      }
    }
    if (found === -1) return false
    at = found
  }
  return true
}

/** Selectors in the sheets that this resolver cannot score at all (so nothing is skipped silently). */
export function unsupportedSelectors(sheets) {
  const bad = new Set()
  for (const src of sheets) {
    for (const rule of topLevelRules(src)) {
      if (![...declarations(rule.body).keys()].length) continue
      for (const part of splitSelectorList(rule.selector)) if (!parseSelector(part)) bad.add(part.replace(/\s+/g, ' ').trim())
    }
  }
  return [...bad]
}

const VAR = /var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g

/** Substitute every var() in `value` against `lookup`; null when one cannot be resolved. */
function substitute(value, lookup, seen = new Set()) {
  let failed = false
  const out = value.replace(VAR, (_, name, fallback) => {
    if (seen.has(name)) {
      failed = true
      return ''
    }
    const raw = lookup(name)
    if (raw !== undefined) {
      const next = new Set(seen).add(name)
      const resolved = substitute(raw, lookup, next)
      if (resolved === null) failed = true
      return resolved ?? ''
    }
    if (fallback !== undefined) {
      const resolved = substitute(fallback.trim(), lookup, seen)
      if (resolved === null) failed = true
      return resolved ?? ''
    }
    failed = true
    return ''
  })
  return failed ? null : out.trim()
}

const toLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
function toOklab({ r, g, b }) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return lin.map((v) => Math.min(255, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))))
}

/** `color-mix(in srgb|oklab, A p%, B)` with literal colours, folded to an rgba() literal. */
function foldColorMix(value) {
  const m = value.match(/^color-mix\(\s*in (srgb|oklab)\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)$/)
  if (!m) return value
  const [, space, ca, pa0, cb, pb0] = m
  const a = ca === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : parseColor(ca)
  const b = cb === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : parseColor(cb)
  if (!a || !b) return value
  const pa = pa0 !== undefined ? Number(pa0) / 100 : pb0 !== undefined ? 1 - Number(pb0) / 100 : 0.5
  const pb = 1 - pa
  const alpha = (a.a ?? 1) * pa + (b.a ?? 1) * pb
  // Premultiplied weights, as CSS mixes translucent colours.
  const wa = alpha === 0 ? pa : ((a.a ?? 1) * pa) / alpha
  const wb = 1 - wa
  let rgb
  if (space === 'srgb') rgb = ['r', 'g', 'b'].map((k) => a[k] * wa + b[k] * wb)
  else {
    const la = toOklab(a)
    const lb = toOklab(b)
    rgb = fromOklab(la.map((v, i) => v * wa + lb[i] * wb))
  }
  return `rgba(${rgb.map((v) => v.toFixed(2)).join(', ')}, ${alpha.toFixed(4)})`
}

/**
 * Computed custom properties at the LAST element of `state.chain`: name → literal value.
 * @param {string[]} sheets CSS sources in cascade order
 */
export function resolveFrequencyTokens(sheets, state) {
  const rules = sheets.flatMap((src, sheet) =>
    topLevelRules(src).map((r) => ({ ...r, order: sheet * 1e6 + r.order, decls: declarations(r.body) })),
  )
  let inherited = new Map()
  state.chain.forEach((_, index) => {
    const winners = new Map()
    for (const rule of rules) {
      if (!rule.decls.size) continue
      const weight = frequencyWeight(rule.selector, state.chain, index)
      if (weight === null) continue
      for (const [name, value] of rule.decls) {
        const prev = winners.get(name)
        if (!prev || weight > prev.weight || (weight === prev.weight && rule.order > prev.order)) winners.set(name, { value, weight, order: rule.order })
      }
    }
    // A reference resolves against this element's own declarations first, then what it inherited.
    const lookup = (name) => (winners.has(name) ? winners.get(name).value : inherited.get(name))
    const next = new Map(inherited)
    for (const name of winners.keys()) {
      const resolved = substitute(winners.get(name).value, lookup)
      if (resolved !== null) next.set(name, foldColorMix(resolved))
      else next.delete(name)
    }
    inherited = next
  })
  return inherited
}
