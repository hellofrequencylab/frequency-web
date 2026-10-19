import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  emailBlockProblems,
  parseRegistryBlocks,
  parseRendererSwitch,
  parseStringSet,
  REGISTRY,
  RENDERER,
  LAYOUT,
  BLOCK_CONTENT,
  MIN_PALETTE,
  MIN_CASES,
} from './check-email-blocks.mjs'

// Locks check:email-blocks (docs/EDITOR-GATES.md §5, Editor E0). The CLI runs `emailBlockProblems` over the
// tree; here it runs over a MUTATED copy of the real tree, so every assertion is proven to fire on the
// exact file it protects, and the pure parsers are pinned on small fixtures. The live-tree block at the
// bottom is the second enforcement beside the CI guards array.

const live: Record<string, string> = Object.fromEntries(
  [
    REGISTRY,
    RENDERER,
    LAYOUT,
    BLOCK_CONTENT,
    'lib/email-studio/product-block.ts',
    'lib/email-studio/shell.ts',
    'lib/email-studio/send.ts',
    'lib/nurture/runner.ts',
    'lib/spaces/campaigns-send-due.ts',
    'app/api/cron/nurture/route.ts',
    'app/api/cron/space-campaigns/route.ts',
  ].map((p) => [p, readFileSync(p, 'utf8')]),
)

/** The tree with one file rewritten. A missing path reads as absent, as the CLI would see it. */
const treeWith = (edits: Record<string, string | null>) => (path: string) =>
  Object.hasOwn(edits, path) ? edits[path] : (live[path] ?? null)

const mutate = (path: string, from: string | RegExp, to: string) => {
  const src = live[path]
  const next = src.replace(from, to)
  if (next === src) throw new Error(`mutation did not apply to ${path}: ${String(from)}`)
  return next
}

describe('check-email-blocks parsers', () => {
  it('reads a string Set and refuses any other shape', () => {
    expect(parseStringSet("export const X: ReadonlySet<string> = new Set(['a', 'b'])", 'X')).toEqual(['a', 'b'])
    expect(parseStringSet('export const X = new Set(IDS)', 'X')).toBeNull()
    expect(parseStringSet("export const X = ['a']", 'X')).toBeNull()
  })

  it('reads registry rows with kinds, reads and resolveAt', () => {
    const blocks = parseRegistryBlocks(
      "const A = [{ id: 'one', kinds: ['space', 'email'], order: 1 }, { id: 'two', kinds: ['member'], reads: 'live', resolveAt: 'send' }]",
    )
    expect(blocks).toEqual([
      { id: 'one', kinds: ['space', 'email'], reads: null, resolveAt: null },
      { id: 'two', kinds: ['member'], reads: 'live', resolveAt: 'send' },
    ])
  })

  it('walks only renderBlockInner, not every switch in the file', () => {
    const src = `
      function tone(t: string) { switch (t) { case 'muted': return 1; case 'accent': return 2; default: return 0 } }
      function renderBlockInner(id: string) {
        switch (id) {
          case 'heading': return { html: 'h', text: 'h' }
          case 'text':
          case 'prose': return { html: 't', text: 't' }
          default: return { html: '', text: '' }
        }
      }`
    expect(parseRendererSwitch(src)).toEqual({ found: true, cases: ['heading', 'text', 'prose'], emptyDefault: true })
    expect(parseRendererSwitch('function other() {}')).toEqual({ found: false, cases: [], emptyDefault: false })
  })
})

describe('check-email-blocks assertions, each proven on the real tree', () => {
  it('is green on the tree as it stands', () => {
    expect(emailBlockProblems(treeWith({}))).toEqual([])
  })

  it('E1: a palette block the renderer cannot draw', () => {
    const problems = emailBlockProblems(treeWith({ [RENDERER]: mutate(RENDERER, "    case 'quote': {", "    case 'quoteRenamed': {") }))
    expect(problems.some((p) => p.startsWith('E1') && p.includes("'quote'"))).toBe(true)
    expect(problems.some((p) => p.startsWith('E1') && p.includes("'quoteRenamed'"))).toBe(true)
  })

  it('E2 / E3: the offer and the kinds drift apart', () => {
    const dropped = mutate(REGISTRY, "  'divider',\n])", '])')
    const problems = emailBlockProblems(treeWith({ [REGISTRY]: dropped }))
    expect(problems.some((p) => p.startsWith('E1') && p.includes("'divider'"))).toBe(true)
    expect(problems.some((p) => p.startsWith('E3') && p.includes("'divider'"))).toBe(true)
  })

  it('E4: a live read offered in email without a send-time resolver', () => {
    const live = mutate(REGISTRY, "{ id: 'productCard',", "{ id: 'productCard', reads: 'live',")
    expect(emailBlockProblems(treeWith({ [REGISTRY]: live })).filter((p) => p.startsWith('E4'))).toEqual([
      expect.stringContaining("'productCard' reads live and is offered in email without resolveAt: 'send'"),
    ])
    const declared = mutate(REGISTRY, "{ id: 'productCard',", "{ id: 'productCard', reads: 'live', resolveAt: 'send',")
    expect(emailBlockProblems(treeWith({ [REGISTRY]: declared }))).toEqual([])
    expect(
      emailBlockProblems(treeWith({ [REGISTRY]: declared }), { sendResolvers: {} }).filter((p) => p.startsWith('E4')),
    ).toEqual([expect.stringContaining('SEND_RESOLVERS names no compile step')])
  })

  it('E4: the declared resolver must exist and be exported', () => {
    const problems = emailBlockProblems(treeWith({ 'lib/email-studio/product-block.ts': 'export const nothing = 1\n' }))
    expect(problems).toEqual([expect.stringContaining('does not export resolveProductRefs')])
    expect(emailBlockProblems(treeWith({ 'lib/email-studio/product-block.ts': null }))).toEqual([expect.stringContaining('missing; SEND_RESOLVERS')])
  })

  it('E5: a restated allowlist', () => {
    const restated = mutate(BLOCK_CONTENT, /export const KNOWN_BLOCK_IDS: ReadonlySet<string> = new Set\(ENTITY_BLOCKS\.map\(\(b\) => b\.id\)\)/, "export const KNOWN_BLOCK_IDS: ReadonlySet<string> = new Set(['heading'])")
    expect(emailBlockProblems(treeWith({ [BLOCK_CONTENT]: restated }))).toEqual([expect.stringContaining('E5')])
  })

  it('E6: a switch that can throw on a stray id', () => {
    const noDefault = mutate(RENDERER, /    default:\n      \/\/ Any id outside the email palette[^\n]*\n      return \{ html: '', text: '' \}\n/, '')
    expect(emailBlockProblems(treeWith({ [RENDERER]: noDefault }))).toEqual([expect.stringContaining('E6')])
  })

  it('E7: email is one column', () => {
    expect(emailBlockProblems(treeWith({ [LAYOUT]: mutate(LAYOUT, '  email: 1,', '  email: 2,') }))).toEqual([expect.stringContaining('E7')])
  })

  it('E8: a cron that stops reaching the renderer, and a renderer that reads live', () => {
    const detached = mutate('lib/nurture/runner.ts', "import { compileEmailDoc } from '@/lib/email-studio/shell'", "import { compileEmailDoc } from '@/lib/email-studio/other'")
    expect(emailBlockProblems(treeWith({ 'lib/nurture/runner.ts': detached }))).toEqual([expect.stringContaining('E8 lib/nurture/runner.ts: no longer imports compileEmailDoc')])
    // The specifier is assembled so this fixture never itself reads as a service-role import (check:admin-client).
    const adminModule = ['@/lib', 'supabase', 'admin'].join('/')
    const reading = `import { createAdminClient } from '${adminModule}'\n${live[RENDERER]}`
    expect(emailBlockProblems(treeWith({ [RENDERER]: reading }))).toEqual([expect.stringContaining('a live read may not happen inside a renderer')])
    expect(emailBlockProblems(treeWith({ 'app/api/cron/space-campaigns/route.ts': null }))).toEqual([expect.stringContaining('E8 app/api/cron/space-campaigns/route.ts: missing')])
  })

  it('E9: an instrument that finds nothing is a failure, not a green', () => {
    expect(emailBlockProblems(treeWith({ [RENDERER]: 'export const nothing = 1\n' }))).toEqual([expect.stringContaining('renderBlockInner not found (E9 integrity)')])
    expect(emailBlockProblems(treeWith({ [REGISTRY]: null }))).toContainEqual(expect.stringContaining(`${REGISTRY}: missing (E9 integrity)`))
    expect(MIN_PALETTE).toBeGreaterThanOrEqual(10)
    expect(MIN_CASES).toBeGreaterThanOrEqual(10)
  })
})
