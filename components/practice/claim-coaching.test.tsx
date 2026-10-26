// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const m = vi.hoisted(() => ({ suggest: vi.fn(), claim: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/(main)/practices/actions', () => ({ suggestPracticeAction: m.suggest, claimPracticeAction: m.claim }))
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null }))
import { ClaimPractice } from './claim-practice'
let root: Root | undefined
let element: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); element?.remove(); vi.clearAllMocks() })
it('asking for claim coaching cannot replace the template title, cadence, explanation or steps', async () => {
  m.suggest.mockResolvedValue({ data: { suggestion: { questions: ['What would fit your week?'], title: 'Attack title', cadence: 'Attack cadence', why: 'Attack reason', steps: ['Attack step'] } } })
  element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element)
  act(() => root!.render(<ClaimPractice templateId="template" fallback={{ title: 'Template name', cadence: 'Weekly', why: 'My explanation', steps: ['My first step', 'My second step'] }} />))
  act(() => Array.from(element!.querySelectorAll('button')).find(b => b.textContent?.includes('Claim &'))!.click())
  const goal = element.querySelector('#goal') as HTMLTextAreaElement
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(goal, 'Rest'); goal.dispatchEvent(new Event('input', { bubbles: true })) })
  const button = Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('Ask Vera'))!
  await act(async () => button.click())
  expect(m.suggest).toHaveBeenCalledWith('template', 'Rest', '')
  expect((element.querySelector('#ctitle') as HTMLInputElement).value).toBe('Template name')
  expect((element.querySelector('#cwhy') as HTMLTextAreaElement).value).toBe('My explanation')
  expect(element.querySelector('[role="status"]')?.textContent).toContain('What would fit your week?')
  expect(m.claim).not.toHaveBeenCalled()
})
