// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const mocks = vi.hoisted(() => ({ coach: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ reseedSpaceBlockCopy: mocks.coach }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
import { BlockEditPanel } from './block-edit-panel'
let root: Root; let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks() })
it('renders advice separately, never applying hostile content to human fields or autosave', async () => {
  const onContent = vi.fn()
  mocks.coach.mockResolvedValue({ questions: ['What would help someone decide whether this fits their needs?'], content: {body:'INVENTED'} })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<BlockEditPanel id="text" content={{text:'HUMAN WORDS'}} style={{}} hidden={false} editHref={null} reseedSlug="space-a" onContent={onContent} onStyle={vi.fn()} onToggleHide={vi.fn()} />))
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Get writing prompts')!
  expect(button).toBeDefined()
  await act(async () => button.click())
  expect(mocks.coach).toHaveBeenCalledExactlyOnceWith('space-a','text',{text:'HUMAN WORDS'})
  expect(container.textContent).toContain('What would help someone decide whether this fits their needs?')
  expect(container.textContent).not.toContain('INVENTED')
  expect(onContent).not.toHaveBeenCalled()
  expect([...container.querySelectorAll('textarea,input')].some(el => (el as HTMLInputElement).value === 'HUMAN WORDS')).toBe(true)
  mocks.coach.mockRejectedValueOnce(Error('offline'))
  await act(async () => button.click())
  expect(container.textContent).toContain('Could not load writing prompts. Try again.')
  expect(button.disabled).toBe(false)
  expect(onContent).not.toHaveBeenCalled()
})
