import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { rolesComponents } from '@/components/page-editor/blocks/roles'
import { ROLE_CSS_CHUNKS, roleBlocksCss } from '@/components/sites/role-blocks-css'
import { ROLES, ROLE_IDS, type RoleId } from '@/lib/blocks/roles/roles'
import { CONTRACT_THEME_IDS, CORE_TOKEN_NAMES, coreTokenMap, coreTokensCss } from '@/lib/theme/block-contract-tokens'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import { BASELINE_FILE, TEST_FILE } from './theme-conformance.mjs'

// THE THEME CONFORMANCE CHECK (docs/THEME-COHESION.md section 5, ADR-1923, LIVE-1865). A required test, like
// scripts/design-system.test.ts (named in VITEST_ENFORCED in scripts/guard-wiring.test.ts, so it runs in the `test` job
// and needs no build). For every theme manifest, for every role and layout, it fails when the theme leaves a role
// unstyled (a token the role reads has no value) or breaks the token contract (a name unmapped, a raw literal in the
// role sheet, a layout that renders nothing or carries a part the sheet never styles).
//
// Baseline: scripts/theme-conformance-baseline.json lists known gaps by id. It can only shrink. A gap that fires and is
// not listed is "fresh" and fails; a listed gap that no longer fires is "healed" and fails until the line is deleted.
// Not covered here (not yet built, so not claimed): a presentation layer per theme (LIVE-1861) and the manifest `roles`
// levels, so "native has presentation rules" and "tools need roles" join when those land. The nightly pixel run
// (overflow at 1280 and 390 per theme) is NOT shipped: it needs a built site and a Playwright job, which is not cheap.

const ROOT = process.cwd()
const MANIFEST_DIR = join(ROOT, 'lib/themes/manifests')
const BASELINE_PATH = join(ROOT, BASELINE_FILE)

interface Manifest { id: string; legacyIds: { editor: string; site: string } }
type ThemeId = (typeof CONTRACT_THEME_IDS)[number]

export interface ConformanceInput {
  themes: { id: string; editorId: string; map: Record<string, string> | null; scopedCss: boolean }[]
  roles: { id: string; tokens: string[]; chunk: string; variants: { name: string; html: string }[]; parts: string[] }[]
  base: string
  coreNames: readonly string[]
}

const RAW_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/
const PRIVATE_TOKEN = /--(?:color|mn|nk|dz|th|sk|fq|wh|tk)-/
const varsRead = (css: string) => [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((v) => !v.startsWith('--rb-'))
const attrs = (html: string, name: string) => [...new Set([...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1]))]

/** Every gap, as a stable id. Pure: the real run feeds it the tree, the mutation tests feed it a broken copy. */
export function findGaps(input: ConformanceInput): string[] {
  const gaps = new Set<string>()
  const names = new Set<string>(input.coreNames)

  // The role sheet itself: contract names only, no raw colour, font or private token.
  for (const role of input.roles) {
    const css = input.base + role.chunk
    for (const v of varsRead(css)) if (!names.has(v)) gaps.add(`sheet-reads-non-contract:${role.id}:${v}`)
    if (RAW_LITERAL.test(css)) gaps.add(`sheet-raw-literal:${role.id}`)
    if (PRIVATE_TOKEN.test(css)) gaps.add(`sheet-private-token:${role.id}`)
    if (/font-family:\s*(?!var\()/.test(css)) gaps.add(`sheet-literal-font:${role.id}`)
    for (const t of role.tokens) if (!names.has(`--${t}`)) gaps.add(`declared-non-contract-token:${role.id}:${t}`)
    // Every layout renders, with the hooks, and every part it emits has a rule.
    for (const v of role.variants) {
      if (!v.html.trim()) gaps.add(`variant-empty:${role.id}/${v.name}`)
      else {
        if (!v.html.includes(`data-role="${role.id}"`) || !v.html.includes(`data-variant="${v.name}"`)) gaps.add(`variant-no-hooks:${role.id}/${v.name}`)
        for (const p of attrs(v.html, 'data-part')) {
          if (!role.parts.includes(p)) gaps.add(`part-undeclared:${role.id}:${p}`)
          if (!css.includes(`data-part="${p}"`)) gaps.add(`part-unstyled:${role.id}:${p}`)
        }
      }
      if (!css.includes(`data-variant="${v.name}"`)) gaps.add(`variant-unstyled:${role.id}/${v.name}`)
    }
  }

  // Each theme: a mapping, every name valued, and every role's tokens resolved.
  for (const theme of input.themes) {
    if (!theme.map) { gaps.add(`theme-no-map:${theme.id}`); continue }
    if (!theme.scopedCss) gaps.add(`theme-not-emitted:${theme.id}`)
    for (const n of input.coreNames) {
      const val = theme.map[n]?.trim()
      if (!val) gaps.add(`token-unmapped:${theme.id}:${n}`)
      else if (new RegExp(`var\\(${n}[,)]`).test(val)) gaps.add(`token-self-reference:${theme.id}:${n}`)
    }
    for (const role of input.roles) {
      const read = varsRead(input.base + role.chunk)
      if (read.some((v) => !theme.map?.[v]?.trim())) gaps.add(`role-unstyled:${theme.id}:${role.id}`)
    }
  }
  return [...gaps].sort()
}

/** Gaps against the baseline: fresh ones fail, healed ones fail until the line is deleted. */
export function ratchet(gaps: string[], baseline: string[]) {
  const base = new Set(baseline)
  const now = new Set(gaps)
  return { fresh: gaps.filter((g) => !base.has(g)), healed: baseline.filter((g) => !now.has(g)) }
}

const readBaseline = () => (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { gaps: string[] }).gaps

function loadManifests(): Manifest[] {
  return readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.manifest.json')).sort().map((f) => JSON.parse(readFileSync(join(MANIFEST_DIR, f), 'utf8')) as Manifest)
}

const FIXTURE_IMAGE = '/images/hero.jpg'
function renderVariant(id: RoleId, variant: string): string {
  const base = { ...ROLES[id].sample } as Record<string, unknown>
  delete base.sample
  const items = (base.items ?? []) as Record<string, unknown>[]
  const extra: Record<string, unknown> = {
    hero: { image: FIXTURE_IMAGE, alt: 'People around a table' },
    offerings: { actionLabel: 'See all', actionHref: '~/book', items: items.map((i) => ({ ...i, image: FIXTURE_IMAGE })) },
    gatherings: { image: FIXTURE_IMAGE, alt: 'A supper table', actionLabel: 'Full calendar', actionHref: '~/events' },
    proof: { items: items.map((i) => ({ ...i, photo: FIXTURE_IMAGE })) },
  }
  const props = { ...base, ...(extra[id] ?? {}), variant, puck: { metadata: undefined } }
  const render = rolesComponents[ROLES[id].type].render as (p: unknown) => React.ReactElement
  return renderToStaticMarkup(createElement(() => render(props)))
}

function realInput(): ConformanceInput {
  return {
    coreNames: CORE_TOKEN_NAMES,
    base: ROLE_CSS_CHUNKS.base,
    themes: loadManifests().map((m) => {
      const known = (CONTRACT_THEME_IDS as readonly string[]).includes(m.id)
      const css = known ? roleBlocksCss(m.legacyIds.editor as WebsiteTheme) : ''
      return {
        id: m.id,
        editorId: m.legacyIds.editor,
        map: known ? (coreTokenMap(m.id as ThemeId) as Record<string, string>) : null,
        scopedCss: known && css.startsWith(coreTokensCss(m.id as ThemeId)),
      }
    }),
    roles: ROLE_IDS.map((id) => ({
      id,
      tokens: ROLES[id].tokens,
      chunk: ROLE_CSS_CHUNKS[id],
      parts: ROLES[id].parts,
      variants: Object.keys(ROLES[id].variants).map((name) => ({ name, html: renderVariant(id, name) })),
    })),
  }
}

describe('theme conformance (the real tree)', () => {
  const baseline = readBaseline()
  const input = realInput()
  const { fresh, healed } = ratchet(findGaps(input), baseline)

  it('is the file the local command and the wiring name', () => {
    expect(TEST_FILE).toBe('scripts/theme-conformance.test.ts')
    expect(existsSync(join(ROOT, TEST_FILE))).toBe(true)
  })

  it('has a manifest for every contract theme, and a theme outside the contract shows up as a gap', () => {
    expect(existsSync(MANIFEST_DIR)).toBe(true)
    const ids = input.themes.map((t) => t.id)
    for (const id of CONTRACT_THEME_IDS) expect(ids, id).toContain(id)
    for (const t of input.themes) if (!(CONTRACT_THEME_IDS as readonly string[]).includes(t.id)) expect(findGaps(input), t.id).toContain(`theme-no-map:${t.id}`)
  })

  it('every theme x role x layout conforms, or the gap is in the baseline', () => {
    expect(fresh, `FRESH theme gaps. Fix the theme or the role; do not add them to the baseline:\n${fresh.join('\n')}`).toEqual([])
  })

  it('a baseline entry that no longer fires has been removed (the baseline only shrinks)', () => {
    expect(healed, `HEALED: delete these lines from scripts/theme-conformance-baseline.json:\n${healed.join('\n')}`).toEqual([])
  })

  it('covers every role with three layouts that render', () => {
    expect(input.roles).toHaveLength(ROLE_IDS.length)
    expect(input.roles.every((r) => r.variants.length === 3 && r.variants.every((v) => v.html.length > 0))).toBe(true)
  })
})

describe('theme conformance (the detector fires on a broken copy)', () => {
  const good = realInput()
  const clone = (): ConformanceInput => structuredClone(good)

  it('an unmapped core name leaves the theme token-unmapped and its roles unstyled', () => {
    const c = clone()
    delete c.themes[0].map!['--c-canvas']
    const g = findGaps(c)
    expect(g).toContain(`token-unmapped:${c.themes[0].id}:--c-canvas`)
    expect(g).toContain(`role-unstyled:${c.themes[0].id}:hero`)
  })

  it('a theme with no mapping, or one the render never emits, is a gap', () => {
    const c = clone()
    const inContract = c.themes.filter((t) => (CONTRACT_THEME_IDS as readonly string[]).includes(t.id))
    inContract[1].map = null
    inContract[2].scopedCss = false
    const g = findGaps(c)
    expect(g).toContain(`theme-no-map:${inContract[1].id}`)
    expect(g).toContain(`theme-not-emitted:${inContract[2].id}`)
  })

  it('a raw colour, a private token or a non-contract var in the role sheet is a gap', () => {
    const c = clone()
    c.roles[0].chunk += '[data-role]{color:' + '#' + 'abc123;background:var(--mn-ink);border-color:var(--nope)}'
    const g = findGaps(c)
    expect(g).toContain(`sheet-raw-literal:${c.roles[0].id}`)
    expect(g).toContain(`sheet-private-token:${c.roles[0].id}`)
    expect(g).toContain(`sheet-reads-non-contract:${c.roles[0].id}:--nope`)
  })

  it('a layout that renders nothing, or a part the sheet never styles, is a gap', () => {
    const c = clone()
    c.roles[1].variants[0].html = ''
    c.roles[2].variants[0].html += '<i data-part="ghost"></i>'
    const g = findGaps(c)
    expect(g).toContain(`variant-empty:${c.roles[1].id}/${c.roles[1].variants[0].name}`)
    expect(g).toContain(`part-undeclared:${c.roles[2].id}:ghost`)
    expect(g).toContain(`part-unstyled:${c.roles[2].id}:ghost`)
  })

  it('the ratchet: fresh fails, healed fails, a listed gap that still fires passes', () => {
    expect(ratchet(['a', 'b'], ['a'])).toEqual({ fresh: ['b'], healed: [] })
    expect(ratchet(['a'], ['a', 'b'])).toEqual({ fresh: [], healed: ['b'] })
    expect(ratchet(['a'], ['a'])).toEqual({ fresh: [], healed: [] })
  })

  it('the baseline file is sorted and unique', () => {
    const b = readBaseline()
    expect(new Set(b).size).toBe(b.length)
    expect([...b].sort()).toEqual(b)
  })
})
