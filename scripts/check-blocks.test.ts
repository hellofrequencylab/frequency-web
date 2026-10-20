import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { adoptionProblems, blockProblems, lazyImportPaths, unadopted, completeProblems, CONTRACT_DIR } from './check-blocks.mjs'
import { ADOPTED_BLOCKS } from '../lib/entity-blocks/contract'
import { ENTITY_BLOCKS, EMAIL_PALETTE_BLOCK_IDS } from '../lib/entity-blocks/registry'
import { defineBlock } from '../lib/entity-blocks/define-block'
import { headingBlock } from '../lib/entity-blocks/contract/heading'
import { dividerBlock } from '../lib/entity-blocks/contract/divider'

// Locks check:blocks (EDITOR-ARCHITECTURE §3, §7.2). The CLI runs `adoptionProblems` over the adopted set;
// here it runs over the REAL adopted set (the enforcing arm beside the CLI) and over broken copies of a real
// definition, so every assertion is proven to fire. The vitest home is the one guard-wiring.test.ts names.

const sources = Object.fromEntries(ADOPTED_BLOCKS.map((b) => [b.type, readFileSync(`${CONTRACT_DIR}/${b.type}.ts`, 'utf8')]))
const base = { registry: ENTITY_BLOCKS, emailPalette: [...EMAIL_PALETTE_BLOCK_IDS] }
const ctx = { ...base, source: sources.heading }
const heading = headingBlock

/** A copy of the real heading definition with one member replaced. */
const broken = (patch: Record<string, unknown>) => ({ ...heading, ...patch })

describe('check:blocks, the live tree', () => {
  it('holds every adopted block to the contract', () => {
    expect(adoptionProblems(ADOPTED_BLOCKS, base, sources)).toEqual([])
  })

  it('adopts something: a gate that finds nothing says so', () => {
    expect(ADOPTED_BLOCKS.length).toBeGreaterThanOrEqual(2)
    expect(adoptionProblems([], base)).toEqual(['no block is adopted: the gate would pass on nothing'])
  })

  it('reads each lazy renderer from the definition file, by AST', () => {
    for (const b of ADOPTED_BLOCKS) expect(lazyImportPaths(sources[b.type])).toEqual([`@/components/entity-blocks/blocks/${b.type}.web`])
    expect(lazyImportPaths("// import('@/a')\nconst s = \"import('@/b')\"\nconst c = () => import('@/c')")).toEqual(['@/c'])
  })
})

describe('check:blocks, each arm fires', () => {
  it('B1 a type that is not a registry block, and kinds that differ from the registry row', () => {
    expect(blockProblems(broken({ type: 'nope' }), ctx).join()).toContain('not a registry block id')
    expect(blockProblems(broken({ kinds: ['space'] }), ctx).join()).toContain('differ from the registry row')
  })

  it('B2 content that is not an object schema, and fields that are not its keys', () => {
    expect(blockProblems(broken({ content: z.string() }), ctx).join()).toContain('not a Zod object schema')
    expect(blockProblems(broken({ content: z.object({ text: z.string(), extra: z.string() }) }), ctx).join()).toContain('are not the content keys')
  })

  it('B3 a version with no migration, a duplicate id, and a step that does not round-trip', () => {
    expect(blockProblems(broken({ v: 3 }), ctx).join()).toContain('there are 0 migrations (need 2)')
    const step = { id: 'heading/2', up: (c: unknown) => c, down: (c: unknown) => c }
    expect(blockProblems(broken({ v: 3, migrations: [step, step] }), ctx).join()).toContain('duplicate migration id')
    const lossy = { id: 'heading/2', up: (c: unknown) => ({ ...(c as object), added: 1 }), down: (c: unknown) => c }
    expect(blockProblems(broken({ v: 2, migrations: [lossy] }), ctx).join()).toContain('does not round-trip')
  })

  it('B4 a missing toText, a non-string one, and one that throws', () => {
    expect(blockProblems(broken({ toText: undefined }), ctx).join()).toContain('toText is missing')
    expect(blockProblems(broken({ toText: () => 1 }), ctx).join()).toContain('did not return a string')
    expect(blockProblems(broken({ toText: () => { throw new Error('x') } }), ctx).join()).toContain('throws')
  })

  it('B5 a surface naming a field that does not exist, and a block shown nowhere', () => {
    expect(blockProblems(broken({ surfaces: { 'space-site': { density: 'roomy', fields: ['ghost'] } } }), ctx).join()).toContain('names a field that does not exist')
    expect(blockProblems(broken({ surfaces: {} }), ctx).join()).toContain('shows on no surface')
  })

  it('B6 a definition file with no, two or an unresolvable lazy import, and email offer/renderer drift', () => {
    expect(blockProblems(heading, { ...base, source: undefined }).join()).toContain('has no definition file')
    expect(blockProblems(heading, { ...base, source: 'export const x = 1' }).join()).toContain('found 0')
    expect(blockProblems(heading, { ...base, source: "import('@/a'); import('@/b')" }).join()).toContain('found 2')
    expect(blockProblems(heading, { ...base, source: "() => import('@/components/entity-blocks/blocks/gone.web')" }).join()).toContain('does not resolve to a file')
    expect(blockProblems(broken({ render: { ...heading.render, email: null } }), ctx).join()).toContain('render.email is null')
    expect(blockProblems(broken({ type: 'divider', render: { ...heading.render, email: 'registered' } }), { ...base, source: sources.divider, emailPalette: [] }).join()).toContain('not in the email palette')
  })

  it('B7 a live read with an email render and no send-time resolver', () => {
    expect(blockProblems(broken({ reads: 'live' }), ctx).join()).toContain("needs resolveAt: 'send'")
    expect(blockProblems(broken({ reads: 'live', resolveAt: 'send' }), ctx).join()).not.toContain('resolveAt')
  })

  it('B8 the same type adopted twice', () => {
    expect(adoptionProblems([heading, heading], base, sources)).toContain('heading: adopted twice')
  })
})

describe('check:blocks --complete', () => {
  it('names the registry blocks not yet adopted, and nothing once all are', () => {
    const left = unadopted(ADOPTED_BLOCKS, ENTITY_BLOCKS)
    expect(left.length).toBe(ENTITY_BLOCKS.length - ADOPTED_BLOCKS.length)
    expect(left).not.toContain('heading')
    expect(unadopted(ADOPTED_BLOCKS, ENTITY_BLOCKS.filter((b) => b.id === 'heading' || b.id === 'divider'))).toEqual([])
  })
})

describe('check:blocks --complete, the whole phase', () => {
  const scripts = { 'check:blocks': 'x', 'check:surface-binding': 'x', 'check:email-blocks': 'x' }
  const only = ENTITY_BLOCKS.filter((b) => b.id === 'heading' || b.id === 'divider')

  it('passes only when the gates exist, defineBlock is exported and every block is adopted', () => {
    expect(completeProblems({ scripts, defineBlockExported: true, defs: ADOPTED_BLOCKS, registry: only })).toEqual([])
    expect(completeProblems({ scripts: {}, defineBlockExported: false, defs: ADOPTED_BLOCKS, registry: only })).toHaveLength(4)
    expect(completeProblems({ scripts, defineBlockExported: true, defs: ADOPTED_BLOCKS, registry: [...ENTITY_BLOCKS, { ...ENTITY_BLOCKS[0], id: 'not-adopted' }] }).join()).toContain('not yet adopted')
  })
})

describe('defineBlock', () => {
  it('returns the definition it is given, typed so toText sees the schema output', () => {
    const def = defineBlock({ ...heading, toText: (c) => c.text ?? '' })
    expect(def.toText({ text: 'Hi' })).toBe('Hi')
  })

  it('the heading and divider text forms strip markup and say nothing for a divider', () => {
    expect(heading.toText({ text: 'One<br>two <b>bold</b>' })).toBe('One two bold')
    expect(dividerBlock.toText({})).toBe('')
  })
})
