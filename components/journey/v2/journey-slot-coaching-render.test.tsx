// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const m = vi.hoisted(() => ({ coach: vi.fn(), update: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/app/(main)/journeys/[slug]/edit/actions', () => {
  const stub = vi.fn(async () => ({ data: undefined }))
  return {
    addPhaseAction: stub,
    addModuleAction: stub,
    addLessonAction: stub,
    addPracticeBlockAction: stub,
    addExtraCreditAction: stub,
    updateBlockAction: m.update,
    removeBlockAction: stub,
    moveBlockAction: stub,
    reorderBlocksAction: stub,
    draftSlotCoachingAction: m.coach,
    populateWeekAction: stub,
    setBlockPracticeAction: stub,
    mintPracticeForBlockAction: stub,
    setLeafAnchorAction: stub,
    setLeafWarmupMessageAction: stub,
  }
})

import { JourneyEditor, type EditorBlock } from './journey-editor'
let root: Root | undefined
let element: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); element?.remove(); vi.clearAllMocks() })
it('slot coaching displays questions without replacing or autosaving a participant prompt', async () => {
  m.coach.mockResolvedValue({ data: { questions: ['What should a participant notice?'], prompt: 'Attack', body: 'Attack' } })
  const block: EditorBlock = { id: 'slot', parentId: null, blockType: 'practice', sortOrder: 0, title: 'Mine', body: 'My guide', check: null, domainId: null, practiceId: 'practice', coachingPrompt: 'My participant prompt', extraCredit: false, bonusZaps: 0 }
  element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element)
  act(() => root!.render(<JourneyEditor slug="mine" blocks={[block]} />))
  act(() => (element!.querySelector('[aria-label="Expand step"]') as HTMLButtonElement).click())
  const button = Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('Get writing questions'))!
  expect(button).toBeTruthy()
  await act(async () => button.click())
  const prompt = element.querySelector(`[aria-label="Vera's coaching prompt for this step"]`) as HTMLTextAreaElement
  expect(prompt.value).toBe('My participant prompt')
  expect(element.querySelector('[role="status"]')?.textContent).toContain('What should a participant notice?')
  expect(m.update).not.toHaveBeenCalled()
  expect(m.refresh).not.toHaveBeenCalled()
})
