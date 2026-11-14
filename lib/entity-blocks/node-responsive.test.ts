import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeLayout, allNodes, type BlockNode } from './node-tree'
import { sanitizeNodeLayout, setNodeResponsive, resolveNodeRows, legacyViewOf } from './node-ops'
import { toYDoc, serializeLayout, reconcileDoc } from '@/lib/editor-crdt/node-ydoc'
import { nodeDeviceValues, resolveNodeContent, withDeviceValues } from '@/lib/builder/node-responsive'
import { setInspectorValue, resetInspectorOverride } from '@/lib/builder/inspector-model'

const base = () => ({ rows: [{ id: 'r1', columns: 1, cells: [[{ nid: 'nhero000001', type: 'photoHero', content: { title: 'Hello', buttonOn: true } }]] }] })
const hero = (l: ReturnType<typeof upgradeLayout>) => allNodes(l!)[0]!

describe('breakpoint overrides on a BlockNode (PROG-E5)', () => {
  it('a document without overrides loads unchanged and gains no field', () => {
    const layout = upgradeLayout(base())!
    expect(hero(layout)).toEqual({ nid: 'nhero000001', type: 'photoHero', content: { title: 'Hello', buttonOn: true } })
    expect('responsive' in hero(layout)).toBe(false)
    expect(upgradeLayout(layout)).toEqual(layout)
  })

  it('the frozen corpus upgrades without any responsive field', () => {
    const corpus = JSON.parse(readFileSync('scripts/entity-layout-corpus.json', 'utf8')) as { documents: { rows: object[] }[] }
    for (const d of corpus.documents) {
      const l = upgradeLayout({ rows: d.rows })
      if (l) for (const n of allNodes(l)) expect('responsive' in n).toBe(false)
    }
  })

  it('stored overrides survive upgrade, sanitize and the CRDT round trip', () => {
    const raw = base()
    ;(raw.rows[0]!.cells[0]![0] as Record<string, unknown>).responsive = { phone: { title: 'Hi' }, tablet: {}, desktop: { title: 'no' }, junk: 1 }
    const up = upgradeLayout(raw)!
    expect(hero(up).responsive).toEqual({ phone: { title: 'Hi' } })
    const clean = sanitizeNodeLayout(up, 'space')!
    expect(hero(clean).responsive).toEqual({ phone: { title: 'Hi' } })
    expect(hero(serializeLayout(toYDoc(clean))).responsive).toEqual({ phone: { title: 'Hi' } })
    // reconcile adds and then removes the field with the smallest change
    const doc = toYDoc(upgradeLayout(base())!)
    reconcileDoc(doc, clean)
    expect(hero(serializeLayout(doc)).responsive).toEqual({ phone: { title: 'Hi' } })
    reconcileDoc(doc, upgradeLayout(base())!)
    expect(hero(serializeLayout(doc)).responsive).toBeUndefined()
  })

  it('sanitize drops fields the block does not have and empty device bags', () => {
    const up = setNodeResponsive(upgradeLayout(base())!, 'nhero000001', { tablet: { nope: 'x' }, phone: { title: 'Hi' } })
    expect(hero(sanitizeNodeLayout(up, 'space')!).responsive).toEqual({ phone: { title: 'Hi' } })
    expect(hero(setNodeResponsive(up, 'nhero000001', undefined)).responsive).toBeUndefined()
  })

  it('resolves per viewport, keeping false and zero overrides', () => {
    const node = { nid: 'n1', type: 'photoHero', content: { title: 'Hello', buttonOn: true }, responsive: { phone: { buttonOn: false } } }
    expect(resolveNodeContent(node, 'desktop')).toEqual({ title: 'Hello', buttonOn: true })
    expect(resolveNodeContent(node, 'tablet')).toEqual({ title: 'Hello', buttonOn: true })
    expect(resolveNodeContent(node, 'phone')).toEqual({ title: 'Hello', buttonOn: false })
  })

  it('inspector values round trip through the node and a reset leaves no residue', () => {
    let node: BlockNode = { nid: 'n1', type: 'photoHero', content: { title: 'Hello' } }
    node = withDeviceValues(node, setInspectorValue(nodeDeviceValues(node), 'phone', 'title', 'Hi'))
    expect(node.responsive).toEqual({ phone: { title: 'Hi' } })
    node = withDeviceValues(node, resetInspectorOverride(nodeDeviceValues(node), 'phone', 'title'))
    expect('responsive' in node).toBe(false)
    expect(node.content).toEqual({ title: 'Hello' })
  })

  it('PUBLIC RENDER UNCHANGED: overrides never reach what a surface draws', () => {
    const plain = upgradeLayout(base())!
    const withOverrides = setNodeResponsive(plain, 'nhero000001', { phone: { title: 'Hi' }, tablet: { title: 'Mid' } })
    const drawn = (l: typeof plain) => resolveNodeRows(l, 'space').map((r) => r.cells.map((c) => c.map((n) => ({ type: n.type, content: n.content }))))
    expect(drawn(withOverrides)).toEqual(drawn(plain))
    const legacy = (l: typeof plain) => legacyViewOf({ nodes: l } as never)
    expect(legacy(withOverrides)).toEqual(legacy(plain))
    expect(JSON.stringify(legacy(withOverrides))).not.toContain('Hi')
  })

  it('only the editor canvas reads overrides: no public renderer or block view mentions them', () => {
    const files = ['lib/entity-blocks/node-projection.ts', 'lib/entity-blocks/rows-ops.ts', 'lib/entity-blocks/layout.ts', 'lib/entity-blocks/block-content.ts']
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/responsive|node-responsive/)
    expect(readFileSync('app/(main)/pages/canvas/page.tsx', 'utf8')).toMatch(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/)
  })
})
