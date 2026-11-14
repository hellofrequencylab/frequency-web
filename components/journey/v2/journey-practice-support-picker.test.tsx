// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ add: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/app/(main)/journeys/[slug]/edit/actions', () => {
  const stub = vi.fn(async () => ({ data: undefined }))
  return {
    addPhaseAction: stub, addModuleAction: stub, addLessonAction: stub,
    addPracticeBlockAction: m.add, addExtraCreditAction: stub, updateBlockAction: stub,
    removeBlockAction: stub, moveBlockAction: stub, reorderBlocksAction: stub,
    draftSlotCoachingAction: stub, populateWeekAction: stub, setBlockPracticeAction: m.replace,
    mintPracticeForBlockAction: stub, setLeafAnchorAction: stub, setLeafWarmupMessageAction: stub,
  }
})
import { JourneyEditor, type EditorBlock, type EditorPractice } from './journey-editor'

const pillars = ['body', 'mind', 'spirit', 'expression'].map(id => ({ id, name: id, slug: id }))
const mixed: EditorPractice = { id: 'mixed', title: 'Walk and notice', description: 'Outside attention', pillarId: 'body', supportIds: ['body', 'mind', 'spirit', 'expression'] }
const body: EditorPractice = { id: 'body-only', title: 'Stretch', description: null, pillarId: 'body', supportIds: ['body'] }
const adopted: EditorBlock = { id: 'slot', parentId: null, blockType: 'practice', title: 'Already adopted', body: '', sortOrder: 0, check: null, domainId: 'body', practiceId: 'old', coachingPrompt: null, extraCredit: false, bonusZaps: 0 }
let root: Root
let el: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  m.add.mockResolvedValue({ data: undefined }); m.replace.mockResolvedValue({ data: undefined })
  el = document.createElement('div'); document.body.append(el); root = createRoot(el)
})
afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.clearAllMocks(); vi.unstubAllGlobals() })
async function mount(practices: EditorPractice[] = [mixed, body], blocks: EditorBlock[] = [{ ...adopted, id: 'lesson', title: 'Opening', blockType: 'lesson', practiceId: null }]) {
  await act(async () => root.render(<JourneyEditor slug="mine" blocks={blocks} practices={practices} pillars={pillars} />))
}
async function click(label: string) {
  const button = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === label)
  if (!button) throw new Error(`Missing button ${label}`)
  await act(async () => button.click())
}
const choices = () => Array.from(el.querySelectorAll('ul button')).filter(b => b.querySelector('.truncate')).map(b => b.textContent)

describe('actual Journey Add and Replace support facets', () => {
  it.each(['mind', 'spirit', 'expression'])('finds the mixed practice under %s and adds its real ID once', async area => {
    await mount(); await click('Add practice'); await click(area)
    expect(choices()).toEqual(['Walk and noticeOutside attention'])
    await click('body')
    expect(choices().filter(t => t?.startsWith('Walk and notice'))).toHaveLength(1)
    await click('Walk and noticeOutside attention')
    expect(m.add).toHaveBeenCalledExactlyOnceWith('mine', null, 'mixed')
    expect(m.replace).not.toHaveBeenCalled()
  })
  it('uses the same mixed-support selection in Replace while excluding adopted titles', async () => {
    await mount([mixed, body, { ...mixed, id: 'used', title: 'Already adopted' }], [adopted])
    await act(async () => (el.querySelector('[aria-label="Expand step"]') as HTMLButtonElement).click())
    await click('Replace'); await click('expression')
    expect(choices()).toEqual(['Walk and noticeOutside attention'])
    await click('Walk and noticeOutside attention')
    expect(m.replace).toHaveBeenCalledExactlyOnceWith('mine', 'slot', 'mixed')
    expect(m.add).not.toHaveBeenCalled()
  })
  it('preserves primary-only legacy callers and treats an explicit empty projection as empty', async () => {
    await mount([{ id: 'legacy', title: 'Legacy', description: null, pillarId: 'mind' }, { id: 'empty', title: 'Empty', description: null, pillarId: 'mind', supportIds: [] }])
    await click('Add practice'); await click('mind')
    expect(choices()).toEqual(['Legacy'])
    await click('Clear')
    expect(choices()).toEqual(['Legacy', 'Empty'])
  })
  it('keeps existing text search and the thirty-result cap', async () => {
    await mount(Array.from({ length: 35 }, (_, i) => ({ ...mixed, id: `p${i}`, title: `Walk ${i}` })))
    await click('Add practice'); await click('mind')
    expect(choices()).toHaveLength(30)
    const input = el.querySelector('[aria-label="Search practices"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Walk 34')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(choices()).toEqual(['Walk 34Outside attention'])
  })
})
