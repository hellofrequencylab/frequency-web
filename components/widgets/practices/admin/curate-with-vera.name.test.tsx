// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import axe from 'axe-core'
const mocks = vi.hoisted(() => ({ draft: vi.fn(), accept: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/admin/content/actions', () => ({ draftPracticeCurationAction: mocks.draft, acceptPracticeCurationAction: mocks.accept }))
import { CurateWithVera } from './curate-with-vera'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement, root: Root
beforeEach(() => { vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
function name(button: HTMLButtonElement) { axe.setup(host); try { return axe.commons.text.accessibleText(button) } finally { axe.teardown() } }
it.each(['Daily Hypnosis', 'Act of Service', 'Deep Listening', 'Write Something', 'Voice Journal', 'Signal Journal', 'Felt Gratitude'])('includes the complete visible label and context for %s', title => {
  act(() => root.render(<CurateWithVera practiceId="practice" title={title} gaps={{ hook: true, tags: true }} />))
  const button = host.querySelector('button')!
  expect(button.textContent?.trim()).toBe('Fill with Vera')
  expect(name(button)).toContain(button.textContent!.trim()); expect(name(button)).toContain(title)
})
it('keeps the actual visible pending label in its accessible name and prevents duplicate draft calls', async () => {
  let finish!: (value: unknown) => void
  mocks.draft.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  act(() => root.render(<CurateWithVera practiceId="practice" title="Deep Listening" gaps={{ hook: true, tags: true }} />))
  const button = host.querySelector('button')!
  await act(async () => button.click())
  expect(button.textContent?.trim()).toBe('Drafting…'); expect(name(button)).toContain('Drafting…'); expect(button.disabled).toBe(true)
  act(() => button.click()); expect(mocks.draft).toHaveBeenCalledExactlyOnceWith('practice')
  await act(async () => finish({ error: 'Try again' }))
  expect(button.disabled).toBe(false); expect(name(button)).toContain('Fill with Vera'); expect(mocks.accept).not.toHaveBeenCalled()
})
