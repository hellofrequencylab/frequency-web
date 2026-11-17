import { describe, expect, it } from 'vitest'
import { getNode, sanitizeNodeLayout, setNodeResponsive } from '@/lib/entity-blocks/node-ops'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import {
  applyCanvasNodeEdit,
  CANVAS_DRAFT_KEY,
  CANVAS_REVISION_KEY,
  canvasFingerprint,
  canvasLayers,
  planCanvasDraftWrite,
  readCanvasDocument,
} from './canvas-document'
import { resolveNodeContent } from './node-responsive'

const CALLOUT = 'ncallout0001'
const TEXT_A = 'ntext0000001'
const TEXT_B = 'ntext0000002'
const page = () => ({
  rows: [{
    id: 'r1',
    columns: 1,
    cells: [[
      { nid: CALLOUT, type: 'callout', content: { title: 'Come in', body: 'We are open', image: { assetId: 'asset-1' } } },
      { nid: TEXT_A, type: 'text', content: { text: 'First' } },
      { nid: TEXT_B, type: 'text', content: { text: 'Second' } },
    ]],
  }],
  bench: [],
})
const CALLOUT_KEYS = ['title', 'body', 'buttonOn', 'buttonLabel', 'buttonUrl', 'image', 'aspect']
const label = (type: string) => ({ callout: 'Callout', text: 'Text' })[type] ?? 'Block'

describe('the canvas document (PROG-E5B)', () => {
  it('reads the draft when there is one, else the published page, else nothing', () => {
    const published = page()
    const draft = page()
    draft.rows[0]!.cells[0]![0]!.content.title = 'Draft words'
    const both = readCanvasDocument({ profileLayout: published, profileLayoutDraft: draft, [CANVAS_REVISION_KEY]: 4 })
    expect(both.source).toBe('draft')
    expect(getNode(both.layout!, CALLOUT)!.content!.title).toBe('Draft words')
    expect(both.base.revision).toBe(4)

    const live = readCanvasDocument({ profileLayout: published })
    expect(live.source).toBe('published')
    expect(live.base.revision).toBe(0)

    for (const none of [null, {}, { profileLayout: { rows: [] } }, { accent: 'sky' }]) {
      expect(readCanvasDocument(none)).toMatchObject({ layout: null, source: 'none' })
    }
  })

  it('reads a legacy type-keyed page as nodes too', () => {
    const legacy = { rows: [{ id: 'r1', columns: 1, cells: [['callout', 'text']] }], content: { callout: { title: 'Hi' } } }
    const document = readCanvasDocument({ profileLayout: legacy })
    expect(canvasLayers(document.layout!, label).map((l) => l.label)).toEqual(['Callout', 'Text'])
  })

  it('fingerprints a document the same whatever order its keys come back in, and differently once it changes', () => {
    const a = { rows: [{ id: 'r1', columns: 1, cells: [[{ nid: TEXT_A, type: 'text', content: { text: 'One' } }]] }], bench: [] }
    const reordered = { bench: [], rows: [{ cells: [[{ content: { text: 'One' }, type: 'text', nid: TEXT_A }]], columns: 1, id: 'r1' }] }
    expect(canvasFingerprint(reordered)).toBe(canvasFingerprint(a))
    expect(canvasFingerprint(JSON.parse(JSON.stringify(a)))).toBe(canvasFingerprint(a))
    a.rows[0]!.cells[0]![0]!.content.text = 'Two'
    expect(canvasFingerprint(reordered)).not.toBe(canvasFingerprint(a))
  })

  it('lists a layer per placed node in reading order and numbers a repeated type', () => {
    expect(canvasLayers(upgradeLayout(page())!, label)).toEqual([
      { id: CALLOUT, label: 'Callout' },
      { id: TEXT_A, label: 'Text' },
      { id: TEXT_B, label: 'Text 2' },
    ])
  })

  it('lays inspector values onto one node and leaves every other node and every other field alone', () => {
    const before = upgradeLayout(page())!
    const after = applyCanvasNodeEdit(before, CALLOUT, { desktop: { title: 'New title', body: 'We are open' }, phone: { title: 'Short' } }, CALLOUT_KEYS)!
    const node = getNode(after, CALLOUT)!
    expect(node.content).toEqual({ title: 'New title', body: 'We are open', image: { assetId: 'asset-1' } })
    expect(node.responsive).toEqual({ phone: { title: 'Short' } })
    expect(getNode(after, TEXT_A)).toEqual(getNode(before, TEXT_A))
    expect(getNode(after, TEXT_B)).toEqual(getNode(before, TEXT_B))
    expect(applyCanvasNodeEdit(before, 'nmissing0001', { desktop: {} }, CALLOUT_KEYS)).toBeNull()
  })

  it('writes only the fields the block contract lets the inspector write', () => {
    const after = applyCanvasNodeEdit(upgradeLayout(page())!, TEXT_A, { desktop: { text: 'Edited', title: 'Smuggled' }, tablet: { nope: 'x' } }, ['text'])!
    expect(getNode(after, TEXT_A)).toEqual({ nid: TEXT_A, type: 'text', content: { text: 'Edited' } })
  })

  it('a field the inspector stops sending is removed, and a reset on a device leaves no residue', () => {
    const start = setNodeResponsive(upgradeLayout(page())!, CALLOUT, { phone: { title: 'Short' } })
    const after = applyCanvasNodeEdit(start, CALLOUT, { desktop: { title: 'Come in' } }, CALLOUT_KEYS)!
    const node = getNode(after, CALLOUT)!
    expect(node.content).toEqual({ title: 'Come in', image: { assetId: 'asset-1' } })
    expect('responsive' in node).toBe(false)
  })

  it('plans a write only from the base the tab loaded, and moves the revision on by one', () => {
    const preferences = { accent: 'sky', profileLayout: page(), [CANVAS_REVISION_KEY]: 2 }
    const base = readCanvasDocument(preferences).base
    const plan = planCanvasDraftWrite({ preferences, nid: TEXT_A, values: { desktop: { text: 'Edited' } }, fieldKeys: ['text'], base })
    if (plan.status !== 'ready') throw new Error(plan.status)
    expect(plan.preferences.accent).toBe('sky')
    expect(plan.preferences.profileLayout).toEqual(preferences.profileLayout)
    expect(plan.preferences[CANVAS_REVISION_KEY]).toBe(3)
    expect(getNode(plan.preferences[CANVAS_DRAFT_KEY] as never, TEXT_A)!.content).toEqual({ text: 'Edited' })
    expect(plan.node.content).toEqual({ text: 'Edited' })
    // The base it hands back is the base a fresh read of what it wrote gives: the next save builds on it.
    expect(plan.base).toEqual(readCanvasDocument(JSON.parse(JSON.stringify(plan.preferences))).base)
  })

  it('refuses a stale base: an older revision, or a draft someone else has changed since', () => {
    const preferences = { profileLayout: page(), [CANVAS_REVISION_KEY]: 2 }
    const base = readCanvasDocument(preferences).base
    const edit = { nid: TEXT_A, values: { desktop: { text: 'Edited' } }, fieldKeys: ['text'] }
    expect(planCanvasDraftWrite({ preferences, ...edit, base: { ...base, revision: 1 } })).toEqual({ status: 'conflict', current: base })

    // The Space page builder saved a draft: the counter did not move, the document did.
    const theirs = page()
    theirs.rows[0]!.cells[0]![1]!.content = { text: 'Theirs' }
    const builderSaved = { ...preferences, profileLayoutDraft: theirs }
    expect(planCanvasDraftWrite({ preferences: builderSaved, ...edit, base }).status).toBe('conflict')
  })

  it('plans nothing for a Space with no page, a node that is gone, or a bad revision', () => {
    const preferences = { profileLayout: page() }
    const base = readCanvasDocument(preferences).base
    expect(planCanvasDraftWrite({ preferences: {}, nid: TEXT_A, values: {}, fieldKeys: ['text'], base }).status).toBe('no-document')
    expect(planCanvasDraftWrite({ preferences, nid: 'nmissing0001', values: {}, fieldKeys: ['text'], base }).status).toBe('no-node')
  })

  it('a phone override can be an empty string, a default toggle or a default choice, and survives the write', () => {
    const start = upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [[{ nid: 'nhero000001', type: 'photoHero', content: { title: 'Hello', subtitle: 'A long line', height: 'tall', buttonOn: false } }]] }] })!
    const keys = ['title', 'subtitle', 'height', 'buttonOn']
    const edited = applyCanvasNodeEdit(start, 'nhero000001', {
      desktop: { title: 'Hello', subtitle: 'A long line', height: 'tall', buttonOn: false },
      phone: { subtitle: '', height: 'medium', buttonOn: true },
      tablet: { subtitle: '   ' },
    }, keys)!
    const node = getNode(sanitizeNodeLayout(edited, 'space')!, 'nhero000001')!
    expect(node.responsive).toEqual({ phone: { subtitle: '', height: 'medium', buttonOn: true }, tablet: { subtitle: '' } })
    expect(resolveNodeContent(node, 'phone')).toMatchObject({ title: 'Hello', subtitle: '', height: 'medium', buttonOn: true })
    expect(resolveNodeContent(node, 'desktop')).toEqual({ title: 'Hello', subtitle: 'A long line', height: 'tall', buttonOn: false })
    // Desktop content stays sparse: a blank or default desktop value is still not stored.
    const blank = applyCanvasNodeEdit(start, 'nhero000001', { desktop: { title: 'Hello', subtitle: '', height: 'medium', buttonOn: true } }, keys)!
    expect(getNode(sanitizeNodeLayout(blank, 'space')!, 'nhero000001')!.content).toEqual({ title: 'Hello' })
  })
})
