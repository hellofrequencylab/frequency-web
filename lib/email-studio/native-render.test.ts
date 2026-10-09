import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseEmailRenderLayout } from './render-layout'
import { renderEmailLayout } from './render'
import { compileEmailDoc } from './shell'
import { upgradeLayout, type NodeLayout } from '@/lib/entity-blocks/node-tree'

vi.mock('@/lib/commerce/products', () => ({ getProduct: vi.fn(async (id: string) => id === 'gone' ? null : ({ id, title: `Fresh ${id}`, priceCents: 1200, images: [`https://example.test/${id}.png`], productKind: 'physical' })) }))
vi.mock('@/lib/journeys/paid', () => ({ journeySlugsByPlanId: vi.fn(async () => new Map()) }))
import { resolveProductRefs, productVarsFromLayout } from './product-block'

const native: NodeLayout = {
  rows: [{ id: 'r0', columns: 1, cells: [[
    { nid: 'nfirst01', type: 'text', content: { text: 'First authored placement' }, style: { text: { color: 'accent' } } },
    { nid: 'nsecond1', type: 'text', content: { text: 'Second authored placement' }, style: { text: { color: 'muted' } } },
    { nid: 'nhidden1', type: 'text', hidden: true, content: { text: 'Hidden authored copy' } },
    { nid: 'nunknown', type: 'futureType', content: { text: 'Unknown authored copy', nested: { false: false } } },
    { nid: 'nunsafe1', type: 'button', content: { label: 'Unsafe link', url: 'javascript:alert(1)' } },
  ]] }],
  bench: [{ nid: 'nbenched', type: 'text', content: { text: 'Benched authored copy' } }],
}

describe('native email compilation reads', () => {
  it('matches all19 pre-conversion legacy outputs and upgraded native equivalents', () => {
    const golden = JSON.parse(readFileSync('scripts/fixtures/email-node-render/legacy-golden.json', 'utf8'))
    expect(golden.documents).toHaveLength(19)
    for (const doc of golden.documents) {
      expect(renderEmailLayout(doc.layout), doc.id).toEqual(doc.output)
      expect(renderEmailLayout(upgradeLayout(doc.layout)!), doc.id).toEqual(doc.output)
    }
  })
  it('compiles repeated placements with independent styles and excludes hidden/bench/unknown copy', () => {
    const before = JSON.stringify(native)
    const parsed = parseEmailRenderLayout(native)!
    const compiled = compileEmailDoc({ layout: parsed, subject: 'Subject', preheader: 'Preview' }, { unsubscribeUrl: 'https://example.test/unsubscribe' })
    expect(compiled.text).toContain('First authored placement\n\nSecond authored placement')
    expect(compiled.html).toContain('#9A5E12')
    expect(compiled.html).toContain('Second authored placement')
    const secondOnly = renderEmailLayout({ rows: [{ id: 'r0', columns: 1, cells: [[native.rows[0].cells[0][1]]] }], bench: [] })
    expect(compiled.html).toContain(secondOnly.html)
    for (const text of ['Hidden authored copy', 'Benched authored copy', 'Unknown authored copy', 'javascript:']) expect(compiled.html).not.toContain(text)
    expect(compiled.html).toContain('https://example.test/unsubscribe')
    expect(JSON.stringify(native)).toBe(before)
    expect(parsed).toEqual(native)
  })
  it('fails safely for null, malformed rows and bench-only storage', () => {
    expect(parseEmailRenderLayout(null)).toBeNull()
    expect(renderEmailLayout(parseEmailRenderLayout({ rows: [null, { columns: 0, cells: [{}] }], bench: [] })!)).toEqual({ html: '', text: '' })
    expect(renderEmailLayout({ rows: [], bench: native.bench })).toEqual({ html: '', text: '' })
  })
  it('refreshes each placed Product card, retains missing snapshots and bench, and derives tokens from first visible card', async () => {
    const layout: NodeLayout = { rows: [{ id: 'r0', columns: 1, cells: [[
      { nid: 'nprod001', type: 'productCard', content: { product: { id: 'one' }, title: 'Old one' } },
      { nid: 'nprod002', type: 'productCard', content: { product: { id: 'two' }, title: 'Old two' } },
      { nid: 'nprod003', type: 'productCard', content: { product: { id: 'gone' }, title: 'Last snapshot' } },
    ]] }], bench: [{ nid: 'nprod004', type: 'productCard', content: { product: { id: 'bench' }, title: 'Bench snapshot' } }] }
    const before = JSON.stringify(layout)
    const resolved = await resolveProductRefs(layout)
    expect(resolved.rows[0].cells[0].map(node => node.content?.title)).toEqual(['Fresh one', 'Fresh two', 'Last snapshot'])
    expect(resolved.bench).toEqual(layout.bench)
    expect(productVarsFromLayout(resolved)['product.title']).toBe('Fresh one')
    expect(JSON.stringify(layout)).toBe(before)
  })
})
