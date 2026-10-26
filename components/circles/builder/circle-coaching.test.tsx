// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const state = vi.hoisted(() => ({ save: vi.fn(), compose: vi.fn(async () => ({ card: 'INVENTED', questions: ['What belongs in your About?'] })), edit: vi.fn(async () => ({ draft: { name: 'INVENTED' }, questions: ['What do you want to clarify?'] })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/(main)/circles/builder-actions', () => ({ saveCircleDraftAction: state.save, composeSectionAction: state.compose, editDraftAction: state.edit }))
vi.mock('@/app/(main)/circles/remix-actions', () => ({ publishCircleAction: vi.fn(), generateCircleEventsAction: vi.fn() }))
vi.mock('./circle-callouts', () => ({ CircleCallouts: () => null }))
vi.mock('@/components/funnels/next-step-link', () => ({ FunnelNextStep: () => null }))
import { CircleBuilder } from './circle-builder'
let root: Root; let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove() })
it('renders coaching without merging or autosaving even malicious returned section fields', async () => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const draft = { circleId: 'a', slug: 'a', status: 'draft', hostId: 'owner', name: 'Human Circle', about: 'Human About', type: 'online', memberCap: 10, primaryPillar: null, pillarsInside: {}, meetup: { text: 'Human meetup' }, gathering: { text: 'Human gathering' }, agreements: [], remixOptions: [] }
  await act(async () => root.render(<CircleBuilder draft={draft as never} />))
  const click = async (text: string) => { const button = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text); expect(button).toBeDefined(); await act(async () => button!.click()) }
  await click('Writing coach'); await click('About')
  expect(container.textContent).toContain('What belongs in your About?')
  expect([...container.querySelectorAll('input')].some(i => i.value === 'Human Circle')).toBe(true)
  expect([...container.querySelectorAll('textarea')].some(i => i.value === 'Human About')).toBe(true)
  const request = container.querySelector('textarea[placeholder^="e.g."]') as HTMLTextAreaElement
  expect(request).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(request, 'Help me clarify this')
    request.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Get writing prompts')
  expect(state.edit).toHaveBeenCalledExactlyOnceWith({ circleId: 'a', request: 'Help me clarify this' })
  expect(container.textContent).toContain('What do you want to clarify?')
  expect([...container.querySelectorAll('input')].some(i => i.value === 'Human Circle')).toBe(true)
  expect([...container.querySelectorAll('textarea')].some(i => i.value === 'Human About')).toBe(true)
  expect(state.save).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('INVENTED')
})
