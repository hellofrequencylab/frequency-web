import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

const state = vi.hoisted(() => ({ on: true }))
vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: async () => state.on }))
import { prepareEmailLayoutWrite } from './layout-write'

// E0 task 14, the email body writer: a node document is stored only behind render_path_email, sanitised by node.

const starter = (): EntityLayout => ({ rows: [{ id: 'r0', columns: 1, cells: [['text']] }] })
const legacy = { rows: [{ id: 'r0', columns: 1, cells: [['text']] }], content: { text: { text: 'Hello' } } }
const nodes = () => {
  const doc = upgradeLayout({ rows: [{ id: 'r0', columns: 1, cells: [['text', 'text']] }], content: { text: { text: 'Hello' } } })!
  return { rows: doc.rows, bench: doc.bench }
}

beforeEach(() => { state.on = true })

describe('prepareEmailLayoutWrite', () => {
  it('stores a node document as nodes while the switch is on', async () => {
    const out = await prepareEmailLayoutWrite(nodes(), legacy, starter)
    expect('layout' in out).toBe(true)
    if ('layout' in out) expect('bench' in out.layout && Array.isArray(out.layout.bench)).toBe(true)
  })

  it('allows a node document over a stored legacy one, and over a stored node one', async () => {
    expect('layout' in (await prepareEmailLayoutWrite(nodes(), legacy, starter))).toBe(true)
    expect('layout' in (await prepareEmailLayoutWrite(nodes(), nodes(), starter))).toBe(true)
  })

  it('sanitises rich text in every placed node by its own type', async () => {
    const doc = nodes()
    const html = '<p>Hi <b>there</b><script>alert(1)</script></p>'
    doc.rows[0].cells[0].forEach((n) => { if (n.type === 'text') n.content = { text: html } })
    const out = await prepareEmailLayoutWrite(doc, null, starter)
    expect(JSON.stringify(out)).not.toContain('<script')
  })

  it('refuses a node document while the switch is off', async () => {
    state.on = false
    expect(await prepareEmailLayoutWrite(nodes(), legacy, starter)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
  })

  it('refuses a legacy document over stored nodes, on or off', async () => {
    expect(await prepareEmailLayoutWrite(legacy, nodes(), starter)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
    state.on = false
    expect(await prepareEmailLayoutWrite(legacy, nodes(), starter)).toEqual({ error: NODE_LAYOUT_WRITE_ERROR })
  })

  it('writes a legacy document exactly as before', async () => {
    const out = await prepareEmailLayoutWrite(legacy, legacy, starter)
    expect(out).toEqual({ layout: expect.objectContaining({ rows: [expect.objectContaining({ id: 'r0' })] }) })
    expect(JSON.stringify(out)).toContain('Hello')
  })
})
