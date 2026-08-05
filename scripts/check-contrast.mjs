#!/usr/bin/env node
// check:contrast — WCAG contrast validation of the TOKEN LAYER (Lift 3a, docs/UX-MATURITY-PLAN.md).
//
// DAWN caught an AA failure we shipped (rail labels at 3.6:1). A design system should catch its
// own. This gate reads app/globals.css — the one file allowed to hold raw hex — resolves every
// declared token in EVERY render state, and computes the WCAG 2.1 contrast ratio for the
// declared PAIRS. A palette edit that darkens a surface or lightens an ink now fails before a
// human sees it, on every skin and both modes at once.
//
// THE FOUR STATES, and how a value is resolved. The axes are plain CSS cascade:
//   · mode  = `.dark` on <html>            · skin = `[data-skin]` on a shell descendant
// The state-defining blocks are `:root`, `[data-skin="…"]`, `.dark`, and `.dark [data-skin="…"]`.
// All are UNLAYERED, so the winner per token is (highest specificity, then latest in the file):
//   dawn-light     :root
//   dawn-dark      :root  <  .dark
//   midnight-light :root  <  [data-skin="midnight"]
//   midnight-dark  :root  <  [data-skin="midnight"]  <  .dark  <  .dark [data-skin="midnight"]
// (`[data-skin]` and `.dark` tie on specificity (0,1,0); `.dark` is authored later, so it wins —
// which is why the dark-midnight overrides need the two-part `.dark [data-skin="midnight"]`
// selector. This resolver reproduces that rule rather than assuming an order.)
// The `data-occasion` and `data-generation` axes are deliberately OUT of scope: occasion is an
// opt-in seasonal overlay and generation is feel-only (it sets no palette token, by contract).
//
// THE PAIR TABLE lives in this file, below, with a minimum per ROLE:
//   body  4.5  — text at normal weight/size (WCAG 1.4.3 AA)
//   large 3.0  — type only used at ≥18.66px bold / ≥24px, plus decorative accents (1.4.3 large)
//   edge  3.0  — non-text boundaries that identify a control or state (WCAG 1.4.11)
// A pair may carry a `waiver`: a pair that fails its role minimum TODAY and cannot be fixed
// without a palette decision by the owner. A waiver freezes the CURRENT ratio as a floor, so the
// pair is still regression-proof (it may improve, never worsen) and stays visible in every run's
// output instead of quietly disappearing. Waivers are debt, listed in the summary, not a pass.
//
// Usage: `node scripts/check-contrast.mjs [--report]` (or `pnpm check:contrast`).
//        `--report` prints every pair in every state and exits 0 — for authoring a palette change.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CSS = join('app', 'globals.css')

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The five render states
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// The fifth is the one that was missing, and its absence hid a live 1.77:1 pair. A page can
// wrap itself in `.theme-light-lock` to force cream regardless of the device (the beta funnel
// does). On a DARK-MODE device that produces a state none of the other four describe: `.dark`
// is on <html>, the lock is on a descendant, and for custom properties the nearest declaring
// ancestor wins — so the lock's roles beat the dark ones no matter the specificity. Anything
// the lock FORGOT to re-assert stays dark on a light page. Modelling it here is what makes
// "the lock must be total" a checked property instead of a comment.
export const STATES = [
  { key: 'DAWN light', mode: 'light', skin: 'default' },
  { key: 'DAWN dark', mode: 'dark', skin: 'default' },
  { key: 'Midnight light', mode: 'light', skin: 'midnight' },
  { key: 'Midnight dark', mode: 'dark', skin: 'midnight' },
  { key: 'Light-lock on a dark device', mode: 'dark', skin: 'default', lightLock: true },
]

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The pair table — the contract. fg = foreground token, bg = background token.
// `only` restricts a pair to the states where the surface actually exists.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const ROLE_MINIMUM = { body: 4.5, large: 3.0, edge: 3.0 }

export const PAIRS = [
  // ── Body copy on every app surface ──────────────────────────────────────────────────────
  { fg: '--color-text', bg: '--color-canvas', role: 'body', note: 'body copy on the app canvas' },
  { fg: '--color-text', bg: '--color-surface', role: 'body', note: 'body copy on a card' },
  { fg: '--color-text', bg: '--color-surface-elevated', role: 'body', note: 'body copy on an elevated surface' },
  { fg: '--color-text', bg: '--color-surface-post', role: 'body', note: 'body copy on a feed post' },
  { fg: '--color-text', bg: '--color-chrome', role: 'body', note: 'body copy in the chrome band' },
  { fg: '--color-text', bg: '--color-marketing-canvas', role: 'body', note: 'body copy on the marketing canvas' },

  // ── The secondary text step (text-muted) — still body copy, still 4.5 ────────────────────
  { fg: '--color-text-muted', bg: '--color-canvas', role: 'body', note: 'secondary copy on the canvas' },
  { fg: '--color-text-muted', bg: '--color-surface', role: 'body', note: 'secondary copy on a card' },
  { fg: '--color-text-muted', bg: '--color-surface-elevated', role: 'body', note: 'secondary copy on an elevated surface' },
  { fg: '--color-text-muted', bg: '--color-surface-post', role: 'body', note: 'secondary copy on a feed post' },
  { fg: '--color-text-muted', bg: '--color-chrome', role: 'body', note: 'secondary copy in the chrome band' },

  // ── The tertiary step (text-subtle) — body copy, held to 4.5 ─────────────────────────────
  // This step used to be classified `large` (3.0) on the argument that the companion
  // `subtle-tiny-type` ratchet kept it off the tiny scale. axe disagreed on the live pages and
  // axe was right: text-subtle carries ordinary meta and label copy at normal size, so 4.5 is
  // its real minimum. The token was darkened in all four states to meet it (worst case ~4.97),
  // and the classification now matches what a browser actually judges.
  { fg: '--color-text-subtle', bg: '--color-canvas', role: 'body', note: 'meta/labels on the canvas' },
  { fg: '--color-text-subtle', bg: '--color-surface', role: 'body', note: 'meta/labels on a card' },
  { fg: '--color-text-subtle', bg: '--color-surface-elevated', role: 'body', note: 'meta/labels on an elevated surface' },
  { fg: '--color-text-subtle', bg: '--color-chrome', role: 'body', note: 'meta/labels in the chrome band' },

  // ── The ink bands (marketing dark bands, in both modes) ──────────────────────────────────
  { fg: '--color-on-ink', bg: '--color-ink', role: 'body', note: 'copy on an ink band' },
  { fg: '--color-on-ink', bg: '--color-ink-elevated', role: 'body', note: 'copy on an elevated ink surface' },
  { fg: '--color-on-ink-muted', bg: '--color-ink', role: 'body', note: 'secondary copy on an ink band' },
  { fg: '--color-on-ink-subtle', bg: '--color-ink', role: 'large', note: 'meta on an ink band' },

  // ── Filled controls: the label must survive its own fill ─────────────────────────────────
  { fg: '--color-text-on-primary', bg: '--color-primary', role: 'body', note: 'primary button label' },
  { fg: '--color-text-on-primary', bg: '--color-primary-hover', role: 'body', note: 'primary button label, hover' },
  { fg: '--color-text-on-signal', bg: '--color-signal', role: 'body', note: 'signal button label' },
  { fg: '--color-text-on-broadcast', bg: '--color-broadcast', role: 'body', note: 'broadcast button label' },
  { fg: '--color-text-on-move', bg: '--color-move', role: 'body', note: 'Get Moving button label' },

  // ── Tinted status/brand chips: the strong step reading on its own -bg wash ───────────────
  { fg: '--color-primary-strong', bg: '--color-primary-bg', role: 'body', note: 'primary chip text' },
  { fg: '--color-signal-strong', bg: '--color-signal-bg', role: 'body', note: 'signal chip text' },
  { fg: '--color-broadcast-strong', bg: '--color-broadcast-bg', role: 'body', note: 'broadcast chip text' },
  { fg: '--color-move-strong', bg: '--color-move-bg', role: 'body', note: 'Get Moving chip text' },
  { fg: '--color-success', bg: '--color-success-bg', role: 'body', note: 'success chip text' },
  { fg: '--color-warning', bg: '--color-warning-bg', role: 'body', note: 'warning chip text' },
  { fg: '--color-danger', bg: '--color-danger-bg', role: 'body', note: 'danger chip text' },
  { fg: '--color-info', bg: '--color-info-bg', role: 'body', note: 'info chip text' },

  // ── Status text on the plain surfaces (inline validation, toasts) ────────────────────────
  { fg: '--color-primary-strong', bg: '--color-surface', role: 'body', note: 'primary link/label on a card' },
  { fg: '--color-danger', bg: '--color-surface', role: 'body', note: 'error text on a card' },
  { fg: '--color-success', bg: '--color-surface', role: 'body', note: 'success text on a card' },
  { fg: '--color-warning', bg: '--color-surface', role: 'body', note: 'warning text on a card' },
  { fg: '--color-info', bg: '--color-surface', role: 'body', note: 'info text on a card' },

  // ── Non-text: the boundaries and indicators WCAG 1.4.11 governs ──────────────────────────
  // Only the boundaries that IDENTIFY something are here. `--color-border` is a decorative
  // hairline between surfaces that already differ in luminance (a card is not identified by its
  // hairline), so it is out of scope by design — `--color-border-strong` is the control edge.
  { fg: '--color-border-strong', bg: '--color-canvas', role: 'edge', note: 'control edge on the canvas' },
  { fg: '--color-border-strong', bg: '--color-surface', role: 'edge', note: 'control edge on a card' },
  { fg: '--color-focus-ring', bg: '--color-canvas', role: 'edge', note: 'focus ring on the canvas' },
  { fg: '--color-focus-ring', bg: '--color-surface', role: 'edge', note: 'focus ring on a card' },
  { fg: '--color-primary', bg: '--color-surface', role: 'edge', note: 'primary fill/graphic on a card' },
]

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Waivers — pairs that miss their role minimum TODAY and need an owner palette decision.
// Each freezes the measured ratio as a FLOOR: the pair may improve, never worsen. Removing a
// waiver (because the palette was fixed) is the goal; adding one is a decision, not a shortcut.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// `floors` is per state and holds the ratio MEASURED on 2026-08-04. Every one of these is real
// AA debt in the shipped palette, surfaced by this gate on its first run; none can be fixed
// without an owner palette call, and app/globals.css is the only file that could fix them.
// Waivers carry a floor PER STATE. 'Light-lock on a dark device' shares DAWN light's numbers
// wherever it appears, and that is not a copy-paste convenience — it is the assertion that the
// lock is TOTAL. `.theme-light-lock` is supposed to reproduce the DAWN light palette exactly on
// a dark device; if a pair ever measures differently in the two, the lock has stopped
// re-asserting some role and this gate will fail on the difference. Before 2026-08-05 the lock
// covered 29 of 57 roles and a live funnel rendered warning text at 1.77:1; the fifth state
// exists so that cannot recur silently.
export const WAIVERS = [
  {
    fg: '--color-text-on-signal',
    bg: '--color-signal',
    floors: { 'Light-lock on a dark device': 4.08, 'DAWN light': 4.08, 'Midnight light': 4.08 },
    why: 'Near miss: 4.08:1 against 4.5. A small darkening of --color-signal (or of --color-text-on-signal) clears it; grouped with the brand-fill decision above.',
  },
  {
    fg: '--color-text-on-move',
    bg: '--color-move',
    floors: { 'Light-lock on a dark device': 4.42, 'DAWN light': 4.42, 'Midnight light': 4.42 },
    why: 'Near miss: 4.42:1 against 4.5 — eight hundredths. One step darker on --color-move clears it.',
  },
  {
    fg: '--color-broadcast-strong',
    bg: '--color-broadcast-bg',
    floors: { 'Light-lock on a dark device': 3.99, 'DAWN light': 3.99, 'Midnight light': 3.99 },
    why: 'Tinted chip text at 3.99:1. Chips are small type, so the 4.5 bar is the right one; the -strong step needs to go one notch deeper in light mode.',
  },
  {
    fg: '--color-success',
    bg: '--color-success-bg',
    floors: { 'Light-lock on a dark device': 3.87, 'DAWN light': 3.87, 'Midnight light': 3.87 },
    why: 'Success chip text at 3.87:1. Same fix shape as broadcast-strong: the tinted chips want a -strong step in light mode instead of the base tone.',
  },
  {
    fg: '--color-warning',
    bg: '--color-warning-bg',
    floors: { 'Light-lock on a dark device': 3.32, 'DAWN light': 3.32, 'Midnight light': 3.32 },
    why: 'Warning chip text at 3.32:1 — the weakest of the chip set.',
  },
  {
    fg: '--color-info',
    bg: '--color-info-bg',
    floors: { 'Light-lock on a dark device': 4.41, 'DAWN light': 4.41, 'Midnight light': 4.41 },
    why: 'Info chip text at 4.41:1 — a near miss.',
  },
  {
    fg: '--color-warning',
    bg: '--color-surface',
    floors: { 'Light-lock on a dark device': 3.89, 'DAWN light': 3.89, 'Midnight light': 3.89 },
    why: 'Warning text on a plain card at 3.89:1. Warning is the only status tone that misses on the plain surfaces; danger/success/info clear it.',
  },
  {
    fg: '--color-primary',
    bg: '--color-surface',
    floors: { 'Light-lock on a dark device': 2.52, 'DAWN light': 2.52, 'Midnight light': 2.86 },
    why: 'The amber brand fill on white is 2.52:1. Fine for a decorative fill; listed because the same token is the fill under button labels (see the first waiver).',
  },
  {
    fg: '--color-border-strong',
    bg: '--color-canvas',
    floors: { 'Light-lock on a dark device': 1.4, 'DAWN light': 1.4, 'DAWN dark': 1.93, 'Midnight light': 1.53, 'Midnight dark': 1.99 },
    why: 'By design, not debt: the "strong" hairline is a tone step, not a control outline — controls are identified by fill + label + focus ring, which 1.4.11 accepts. Kept in the table with a frozen floor so a palette edit cannot flatten the tone step away.',
  },
  {
    fg: '--color-border-strong',
    bg: '--color-surface',
    floors: { 'Light-lock on a dark device': 1.49, 'DAWN light': 1.49, 'DAWN dark': 1.79, 'Midnight light': 1.74, 'Midnight dark': 1.79 },
    why: 'Same hairline, on a card. See above.',
  },
]

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CSS parsing
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Strip /* … *\/ comments (globals.css has no // comments — it is real CSS). */
export function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Split top-level rule blocks. At-rules (`@theme inline`, `@media`, `@custom-variant`) are
 * SKIPPED whole: `@theme inline` is Tailwind's alias layer and is self-referential
 * (`--color-canvas: var(--color-canvas)`), so feeding it to the resolver would be a cycle.
 * @returns {{selector: string, body: string, order: number}[]}
 */
export function topLevelRules(src) {
  const css = stripCssComments(src)
  const rules = []
  let i = 0
  let order = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    // Everything since the previous block/statement is the prelude; a braceless at-statement
    // (`@import …;`, `@custom-variant …;`) ends in `;`, so the selector is what follows the last one.
    const selector = css.slice(i, open).split(';').pop().trim()
    // Walk to the matching close brace.
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    if (!selector.startsWith('@')) rules.push({ selector, body: css.slice(open + 1, j - 1), order: order++ })
    i = j
  }
  return rules
}

/** Custom-property declarations in one rule body (nested blocks are already excluded). */
export function declarations(body) {
  const out = new Map()
  for (const m of body.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+);/g)) out.set(m[1], m[2].trim())
  return out
}

/**
 * Does a state-defining selector apply to `state`, and at what specificity?
 * Returns null for any selector that is not one of the four state axes (occasion, generation,
 * component classes, element selectors) — those are out of the contract by design.
 */
export function selectorWeight(selector, state) {
  const s = selector.replace(/\s+/g, ' ').trim()
  if (s === ':root') return 10
  const skin = s.match(/^\[data-skin="([a-z-]+)"\]$/)
  if (skin) return skin[1] === state.skin ? 10 : null
  if (s === '.dark') return state.mode === 'dark' ? 10 : null
  const darkSkin = s.match(/^\.dark \[data-skin="([a-z-]+)"\]$/)
  if (darkSkin) return state.mode === 'dark' && darkSkin[1] === state.skin ? 20 : null
  // 30, above every skin/mode rule: the lock sits on a DESCENDANT of <html>, and the nearest
  // declaring ancestor wins for custom properties, so it outranks .dark by position rather
  // than by specificity. Only the light-lock state sees it at all.
  if (s === '.theme-light-lock') return state.lightLock ? 30 : null
  return null
}

/** Resolve every custom property for one render state (specificity, then source order). */
export function resolveTokens(src, state) {
  const winners = new Map() // name → { value, weight, order }
  for (const rule of topLevelRules(src)) {
    const weight = selectorWeight(rule.selector, state)
    if (weight === null) continue
    for (const [name, value] of declarations(rule.body)) {
      const prev = winners.get(name)
      if (!prev || weight > prev.weight || (weight === prev.weight && rule.order > prev.order)) {
        winners.set(name, { value, weight, order: rule.order })
      }
    }
  }
  return new Map([...winners].map(([k, v]) => [k, v.value]))
}

/** Follow `var(--x, fallback)` chains to a literal color. */
export function deref(tokens, name, seen = new Set()) {
  if (seen.has(name)) return null
  seen.add(name)
  const raw = tokens.get(name)
  if (!raw) return null
  const v = raw.trim()
  const ref = v.match(/^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]*))?\)$/)
  if (ref) {
    const resolved = deref(tokens, ref[1], seen)
    return resolved ?? (ref[2] ? ref[2].trim() : null)
  }
  return v
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Color + WCAG math
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Parse #rgb / #rgba / #rrggbb / #rrggbbaa / rgb() / rgba() → {r,g,b,a} with 0-255 channels. */
export function parseColor(value) {
  if (!value) return null
  const v = value.trim()
  const hex = v.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    }
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/)
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a }
  }
  return null
}

/** Composite a translucent foreground over an opaque backdrop (simple source-over). */
export function composite(fg, bg) {
  if (fg.a >= 1) return fg
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  }
}

/** WCAG 2.1 relative luminance. */
export function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.1 contrast ratio, 1–21. Accepts color strings or parsed colors. */
export function contrastRatio(fg, bg) {
  const bgc = typeof bg === 'string' ? parseColor(bg) : bg
  let fgc = typeof fg === 'string' ? parseColor(fg) : fg
  if (!fgc || !bgc) return null
  fgc = composite(fgc, bgc)
  const a = luminance(fgc)
  const b = luminance(bgc)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The check
// ═══════════════════════════════════════════════════════════════════════════════════════════

const short = (t) => t.replace(/^--color-/, '')

function waiverFor(pair, stateKey) {
  const w = WAIVERS.find((x) => x.fg === pair.fg && x.bg === pair.bg && stateKey in x.floors)
  return w ? { floor: w.floors[stateKey], why: w.why } : null
}

/** Evaluate the whole pair table against one CSS source. Returns one row per (state, pair). */
export function evaluateContrast(src, { pairs = PAIRS, states = STATES } = {}) {
  const rows = []
  for (const state of states) {
    const tokens = resolveTokens(src, state)
    for (const pair of pairs) {
      if (pair.only && !pair.only.includes(state.key)) continue
      const fgValue = deref(tokens, pair.fg)
      const bgValue = deref(tokens, pair.bg)
      const ratio = contrastRatio(fgValue, bgValue)
      const waiver = waiverFor(pair, state.key)
      const min = waiver ? waiver.floor : ROLE_MINIMUM[pair.role]
      rows.push({
        state: pair.only ? `${state.key}` : state.key,
        pair: `${short(pair.fg)} on ${short(pair.bg)}`,
        note: pair.note,
        role: pair.role,
        fgValue,
        bgValue,
        ratio,
        min,
        waived: Boolean(waiver),
        waiverWhy: waiver?.why,
        unresolved: ratio === null,
        // Role minimums are exact. Waiver floors are recorded at the two decimals the report
        // prints, so they are compared at that precision — a frozen 2.46 means "the printed
        // ratio may not fall below 2.46", not "must beat 2.4600000001".
        pass: ratio !== null && (waiver ? Number(ratio.toFixed(2)) + 1e-9 >= min : ratio + 1e-9 >= min),
      })
    }
  }
  return rows
}

function table(rows) {
  const head = ['state', 'pair', 'role', 'ratio', 'min', '']
  const body = rows.map((r) => [
    r.state,
    r.pair,
    r.waived ? `${r.role}*` : r.role,
    r.ratio === null ? '—' : `${r.ratio.toFixed(2)}:1`,
    `${r.min}`,
    r.unresolved ? '🔴 unresolved token' : r.pass ? (r.waived ? '⚠️ waived' : '✅') : `🔴 short by ${(r.min - r.ratio).toFixed(2)}`,
  ])
  const w = head.map((_, i) => Math.max(...[head, ...body].map((x) => x[i].length)))
  const line = (c) => '  ' + c.map((v, i) => (i === 3 || i === 4 ? v.padStart(w[i]) : v.padEnd(w[i]))).join('  ').trimEnd()
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...body.map(line)].join('\n')
}

function main() {
  const src = readFileSync(CSS, 'utf8')
  const rows = evaluateContrast(src)
  const report = process.argv.includes('--report')

  if (report) {
    console.log(table(rows))
    return
  }

  const failed = rows.filter((r) => !r.pass)
  const waived = rows.filter((r) => r.waived)

  if (failed.length === 0) {
    const worst = STATES.map((s) => {
      const inState = rows.filter((r) => r.state === s.key && !r.waived)
      const min = inState.reduce((a, r) => (r.ratio < a.ratio ? r : a), inState[0])
      return `${s.key} ${min.ratio.toFixed(2)}:1 (${min.pair})`
    })
    console.log(
      `✓ Contrast gate: ${rows.length} token pairs across ${STATES.length} render states meet their role minimum` +
        `${waived.length ? `, ${waived.length} on a frozen waiver floor` : ''}.`,
    )
    console.log(`  Worst non-waived pair per state:\n${worst.map((w) => `    • ${w}`).join('\n')}`)
    if (waived.length) {
      const unique = [...new Set(waived.map((r) => r.pair))]
      console.log(
        `  ⚠️  Waived (owner palette decision, ratio frozen so it can only improve): ${unique.join(' · ')}\n` +
          '      See WAIVERS in scripts/check-contrast.mjs.',
      )
    }
    return
  }

  console.error(`\n✗ Contrast gate: ${failed.length} token pair(s) below the required ratio.\n`)
  console.error(table(failed))
  console.error('')
  for (const r of failed) {
    console.error(
      `  • ${r.state} — ${r.pair}: ${r.unresolved ? 'token did not resolve to a color' : `${r.ratio.toFixed(2)}:1 (needs ${r.min})`}` +
        `\n      ${r.note}${r.unresolved ? '' : ` · ${r.fgValue} on ${r.bgValue}`}`,
    )
  }
  console.error(
    '\n  Every color in the product resolves from app/globals.css, so a pair that fails here fails on\n' +
      '  every screen at once. Adjust the token in the block that OWNS that state (:root · .dark ·\n' +
      '  [data-skin="…"] · .dark [data-skin="…"]) and re-run. Do not lower a role minimum to pass; if a\n' +
      '  pair genuinely cannot meet its role, it needs an owner palette decision recorded as a WAIVER\n' +
      '  in this script, with the reason a reviewer can read.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
