import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import seed from '@/lib/sites/editor/theme-contract.json'
import { MENSWORK_TOKENS_CSS } from '@/lib/theme/menswork'
import { WILDHEART_TOKENS_CSS } from '@/lib/theme/wildheart'
import { NETWORK_TOKENS_CSS } from '@/lib/theme/network'
import { NETWORK_KIT_TOKENS_CSS } from '@/lib/theme/network-kit'
import { TEMPLE_TOKENS_CSS } from '@/lib/theme/temple'
import { TEMPLE_KIT_TOKENS_CSS } from '@/lib/theme/temple-kit'
import { MIDNIGHT_TOKENS_CSS } from '@/lib/theme/midnight'
import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'
import { FREE_HUMAN_TOKENS_CSS } from '@/lib/theme/free-human'
import { CONTRACT_THEME_IDS, CORE_TOKEN_NAMES, coreTokenMap, coreTokensCss, type ContractThemeId, type CoreTokenName } from '@/lib/theme/block-contract-tokens'

// THE PIN (LIVE-1856). The contract adds names; it must move no value. This resolves every contract name against the
// sheets a live site wears today and compares it with the committed golden (block-contract-map.json). A sheet edit that
// changes a token a contract name reads, or a mapping that points somewhere else, fails here by name.
//
// Resolution follows the cascade: a custom property resolves its var() at the element that declares it. Root tokens
// (globals.css :root and the Frequency design sheet) resolve in the root scope; a theme's own block resolves in the
// theme scope. The Space accent (`--color-primary*`, supplied by AccentScope) stays symbolic: a site's accent is not a
// theme value, and the mapping passes it straight through.

const MAP_PATH = 'lib/theme/block-contract-map.json'
const EXTERNAL = /^--color-(primary|text-on-primary)/
/** The Space's font set (data-space-theme) supplies the faces to a theme whose sheet declares none. */
const FONT_SET = /^--font-[a-z0-9-]+$/
const isExternal = (name: string, theme: Decls) => EXTERNAL.test(name) || (FONT_SET.test(name) && !theme.has(name) && !ROOT.has(name))

const SHEETS: Record<Exclude<ContractThemeId, 'frequency'>, { css: string; selector: string }> = {
  bold: { css: MENSWORK_TOKENS_CSS, selector: '[data-house-theme="menswork"]' },
  wildheart: { css: WILDHEART_TOKENS_CSS, selector: '[data-house-theme="wildheart"]' },
  network: { css: NETWORK_TOKENS_CSS, selector: '[data-house-theme="network"]' },
  'network-kit': { css: NETWORK_KIT_TOKENS_CSS, selector: '[data-house-theme="network-kit"]' },
  temple: { css: TEMPLE_TOKENS_CSS, selector: '[data-house-theme="temple"]' },
  'temple-kit': { css: TEMPLE_KIT_TOKENS_CSS, selector: '[data-house-theme="temple-kit"]' },
  midnight: { css: MIDNIGHT_TOKENS_CSS, selector: '[data-house-theme="midnight"]' },
  designer: { css: DESIGNER_TOKENS_CSS, selector: '[data-house-theme="designer"]' },
  'free-human': { css: FREE_HUMAN_TOKENS_CSS, selector: '[data-house-theme="free-human"]' },
}

/** The seed's key for each theme (lib/sites/editor/theme-contract.json). */
const SEED_KEY: Record<ContractThemeId, string> = {
  frequency: 'DAWN', bold: 'Menswork', wildheart: 'Wildheart', network: 'Network', 'network-kit': 'NetworkKit',
  temple: 'Temple', 'temple-kit': 'TempleKit', midnight: 'Midnight', designer: 'Designer', 'free-human': 'FreeHuman',
}

type Decls = Map<string, string>

/** Top-level rules of a sheet as [selectors, declarations]; at-rules are skipped. */
function rules(css: string): Array<[string[], Decls]> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Array<[string[], Decls]> = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    const prelude = src.slice(i, open).trim()
    let depth = 1, j = open + 1, quote = ''
    for (; j < src.length && depth > 0; j++) {
      const c = src[j]
      if (quote) { if (c === quote) quote = '' } else if (c === '"' || c === "'") quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
    }
    if (prelude && !prelude.startsWith('@')) out.push([prelude.split(',').map((s) => s.trim()), declarations(src.slice(open + 1, j - 1))])
    i = j
  }
  return out
}

function declarations(body: string): Decls {
  const map: Decls = new Map()
  let start = 0, paren = 0, quote = ''
  const flush = (end: number) => {
    const d = body.slice(start, end), at = d.indexOf(':')
    if (at > 0 && d.slice(0, at).trim().startsWith('--')) map.set(d.slice(0, at).trim(), d.slice(at + 1).trim())
    start = end + 1
  }
  for (let k = 0; k < body.length; k++) {
    const c = body[k]
    if (quote) { if (c === quote) quote = '' } else if (c === '"' || c === "'") quote = c
    else if (c === '(') paren++
    else if (c === ')') paren--
    else if (c === ';' && paren === 0) flush(k)
  }
  flush(body.length)
  return map
}

function scopeOf(css: string, selectors: string[]): Decls {
  const merged: Decls = new Map()
  for (const [sel, decls] of rules(css)) if (sel.some((s) => selectors.includes(s))) for (const [k, v] of decls) merged.set(k, v)
  return merged
}

const FQ_ROOT = [':root[data-design="frequency"]', ':root[data-design="frequency"]:not(.dark)']
const ROOT: Decls = new Map([
  ...scopeOf(readFileSync('app/globals.css', 'utf8'), [':root']),
  ...scopeOf(readFileSync('app/themes/frequency/core.css', 'utf8'), FQ_ROOT),
  ...scopeOf(readFileSync('app/themes/frequency.css', 'utf8'), FQ_ROOT),
])

function themeScope(id: ContractThemeId): Decls {
  if (id === 'frequency') return new Map()
  const s = SHEETS[id]
  return scopeOf(s.css, [s.selector])
}

/** Replace every var() in a value, recursively, in the cascade scope the declaring element gives it. */
function expand(value: string, theme: Decls, inTheme: boolean, depth = 0): string {
  if (depth > 24) throw new Error(`var() chain too deep: ${value}`)
  let out = '', i = 0
  while (i < value.length) {
    const at = value.indexOf('var(', i)
    if (at < 0) { out += value.slice(i); break }
    out += value.slice(i, at)
    let d = 1, j = at + 4, comma = -1
    for (; j < value.length && d > 0; j++) {
      if (value[j] === '(') d++
      else if (value[j] === ')') d--
      else if (value[j] === ',' && d === 1 && comma < 0) comma = j
    }
    const inner = value.slice(at + 4, j - 1)
    const name = (comma < 0 ? inner : value.slice(at + 4, comma)).trim()
    const fb = comma < 0 ? null : value.slice(comma + 1, j - 1).trim()
    if (isExternal(name, theme)) out += `var(${name})`
    else if (inTheme && theme.has(name)) out += expand(theme.get(name)!, theme, true, depth + 1)
    else if (ROOT.has(name)) out += expand(ROOT.get(name)!, theme, false, depth + 1)
    else if (fb !== null) out += expand(fb, theme, inTheme, depth + 1)
    else out += `var(${name})`
    i = j
  }
  return out.replace(/\s+/g, ' ').trim()
}

const declared = (theme: Decls, name: string) => isExternal(name, theme) || theme.has(name) || ROOT.has(name)

const SEED = seed.themes as Record<string, Record<string, unknown>>

/** The source tokens each name reads, first declared wins; `constant` is used when none is declared. The private ones
 *  (`--nw-voice`, `--nk-*`, `--tp-*`, `--fq-*`, `--dz-*`) are named here and only here: this is where a theme's own
 *  vocabulary is mapped onto the contract. */
const SOURCES: Record<CoreTokenName, { from: string[]; constant?: string }> = {
  '--c-canvas': { from: ['--color-canvas'] },
  '--c-surface': { from: ['--color-surface'] },
  '--c-raised': { from: ['--color-surface-elevated'] },
  '--c-sunken': { from: [], constant: 'color-mix(in srgb,var(--color-canvas) 92%,var(--color-text))' },
  '--c-text': { from: ['--color-text'] },
  '--c-text-muted': { from: ['--color-text-muted'] },
  '--c-text-subtle': { from: ['--color-text-subtle'] },
  '--c-on-accent': { from: ['--color-text-on-primary'] },
  '--c-accent': { from: ['--color-primary'] },
  '--c-accent-hover': { from: ['--color-primary-hover'] },
  '--c-accent-soft': { from: [], constant: 'color-mix(in srgb,var(--color-primary) 18%,var(--color-canvas))' },
  '--c-accent-bg': { from: ['--color-primary-bg'] },
  '--c-accent-deep': { from: ['--color-primary-strong'] },
  '--c-accent-text': { from: ['--color-primary-strong'] },
  '--c-line': { from: ['--color-border'] },
  '--c-line-strong': { from: ['--color-border-strong'] },
  '--c-success': { from: ['--color-success'] },
  '--c-warning': { from: ['--color-warning'] },
  '--c-danger': { from: ['--color-danger'] },
  '--c-info': { from: ['--color-info'] },
  '--c-focus': { from: ['--color-focus-ring'] },
  '--c-band': { from: ['--color-ink'] },
  '--c-on-band': { from: ['--color-on-ink'] },
  '--r-control': { from: ['--radius-control'] },
  '--r-card': { from: ['--radius-card'] },
  '--r-panel': { from: ['--radius-cover'] },
  '--r-media': { from: ['--radius-media', '--radius-cover'] },
  '--frame': { from: [] }, // the seed's medium clip, per theme (below)
  '--shadow-card': { from: ['--dz-shadow-1', '--design-shadow-sm'], constant: '0 1px 2px color-mix(in srgb,var(--color-text) 8%,transparent)' },
  '--shadow-lift': { from: ['--dz-shadow-2', '--shadow-float', '--shadow-menu', '--design-shadow-md'], constant: '0 12px 28px -12px color-mix(in srgb,var(--color-text) 28%,transparent)' },
  '--f-display': { from: ['--font-display'] },
  '--f-body': { from: ['--font-body'] },
  '--f-label': { from: ['--font-label', '--font-body'] },
  '--f-voice': { from: ['--nw-voice', '--nk-accent-face', '--tp-quote', '--fq-font-serif'], constant: 'var(--font-display)' },
  '--w-display': { from: [] }, // the seed's display weight, per theme (below)
  '--track-display': { from: ['--nk-display-tracking', '--design-display-tracking'], constant: 'normal' },
  '--case-heading': { from: [], constant: 'none' },
  '--lead-display': { from: ['--design-display-leading'], constant: '1.1' },
  '--sp-section': { from: ['--space-section'], constant: 'clamp(64px,8vw,112px)' },
  '--sp-gap': { from: [], constant: '16px' },
  '--sp-gutter': { from: ['--space-gutter'], constant: 'clamp(16px,4vw,32px)' },
  '--measure': { from: [], constant: '68ch' },
  '--dur-fast': { from: ['--motion-fast'], constant: '160ms' },
  '--dur': { from: ['--motion-base'], constant: '280ms' },
  '--ease': { from: ['--ease-out'], constant: 'cubic-bezier(.22,.61,.36,1)' },
}

/** Themes whose own design says a name is not a value at all (Nocturne draws no shadows). */
const THEME_CONSTANT: Partial<Record<ContractThemeId, Partial<Record<CoreTokenName, string>>>> = {
  midnight: { '--shadow-card': 'none', '--shadow-lift': 'none' },
}

function generate(id: ContractThemeId): Record<CoreTokenName, string> {
  const theme = themeScope(id)
  const seeded = SEED[SEED_KEY[id]]
  const out = {} as Record<CoreTokenName, string>
  for (const name of CORE_TOKEN_NAMES) {
    const override = THEME_CONSTANT[id]?.[name]
    const src = SOURCES[name]
    const hit = src.from.find((f) => declared(theme, f) && (id === 'frequency' || !/^--(fq|design)-/.test(f)))
    if (override !== undefined) out[name] = override
    else if (hit) out[name] = `var(${hit})`
    else if (name === '--frame') out[name] = String(seeded['--th-clip-md'])
    else if (name === '--w-display') out[name] = String(seeded['--th-dw'])
    else if (src.constant !== undefined) out[name] = src.constant
    else throw new Error(`${id}: ${name} has no source and no constant`)
  }
  return out
}

function pin(id: ContractThemeId, names: Record<string, string>): Record<string, string> {
  const theme = themeScope(id)
  return Object.fromEntries(CORE_TOKEN_NAMES.map((n) => [n, expand(names[n], theme, true)]))
}

// The golden holds a hash of each resolved value, not the value: a stock theme's palette may carry colours the
// platform's colour-family probes scan for, and a pin only needs to notice a change, not display it.
const hashed = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex').slice(0, 16)]))

const wanted = Object.fromEntries(CONTRACT_THEME_IDS.map((id) => {
  const names = generate(id)
  return [id, { names, pinned: hashed(pin(id, names)) }]
}))

if (process.env.UPDATE_CONTRACT_MAP === '1') {
  writeFileSync(MAP_PATH, JSON.stringify({ themes: wanted }, null, 2) + '\n')
}

describe('core token contract (LIVE-1856)', () => {
  it('names forty-five unique, unprefixed-by-theme tokens', () => {
    expect(CORE_TOKEN_NAMES).toHaveLength(45)
    expect(new Set(CORE_TOKEN_NAMES).size).toBe(45)
    for (const n of CORE_TOKEN_NAMES) expect(n).not.toMatch(/^--(mn|nk|nw|dz|tp|wh|mw|th|fq|sk)-/)
  })

  it('the committed mapping is what the generator produces today (no hand edits, no stale file)', () => {
    const committed = JSON.parse(readFileSync(MAP_PATH, 'utf8')).themes
    expect(committed).toEqual(JSON.parse(JSON.stringify(wanted)))
  })

  for (const id of CONTRACT_THEME_IDS) {
    describe(id, () => {
      const names = coreTokenMap(id)
      const theme = themeScope(id)

      it('maps every contract name, and only those', () => {
        expect(Object.keys(names).sort()).toEqual([...CORE_TOKEN_NAMES].sort())
        expect(coreTokensCss(id).match(/--[a-z-]+:/g)).toHaveLength(45)
      })

      it('pins every resolved value to today\'s sheets', () => {
        const committed = JSON.parse(readFileSync(MAP_PATH, 'utf8')).themes[id].pinned
        expect(hashed(pin(id, names))).toEqual(committed)
      })

      it('moves nothing: a name that points at an existing token resolves to exactly that token\'s value', () => {
        for (const n of CORE_TOKEN_NAMES) {
          const m = /^var\((--[a-z0-9-]+)\)$/.exec(names[n])
          if (!m) continue
          expect(declared(theme, m[1]), `${id} ${n} points at undeclared ${m[1]}`).toBe(true)
          const own = theme.get(m[1]), root = ROOT.get(m[1])
          const direct = isExternal(m[1], theme) ? `var(${m[1]})` : own !== undefined ? expand(own, theme, true) : expand(root!, theme, false)
          expect(expand(names[n], theme, true), `${id} ${n}`).toBe(direct)
        }
      })

      it('leaves no name empty or unresolved, apart from the Space accent and font set', () => {
        for (const [n, v] of Object.entries(pin(id, names))) {
          expect(v, `${id} ${n}`).not.toBe('')
          const stray = [...v.matchAll(/var\((--[a-z0-9-]+)/g)].map((x) => x[1]).filter((x) => !isExternal(x, theme))
          expect(stray, `${id} ${n} = ${v}`).toEqual([])
        }
      })
    })
  }
})
