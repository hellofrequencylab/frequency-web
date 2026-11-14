// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const state = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/(main)/circles/builder-actions', () => ({ saveCircleDraftAction: state.save, composeSectionAction: vi.fn(), editDraftAction: vi.fn() }))
vi.mock('@/app/(main)/circles/remix-actions', () => ({ publishCircleAction: vi.fn(), generateCircleEventsAction: vi.fn() }))
vi.mock('./circle-callouts', () => ({ CircleCallouts: () => null }))
vi.mock('@/components/funnels/next-step-link', () => ({ FunnelNextStep: () => null }))
import { CircleBuilder } from './circle-builder'

let root: Root
let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks() })
it('renders optional support inputs without inventing or autosaving four-part content', async () => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const draft = { circleId: 'a', slug: 'a', status: 'draft', hostId: 'owner', name: 'Human Circle', about: 'Human About', type: 'online', memberCap: 10, primaryPillar: null, pillarsInside: { body: 'Walk together' }, meetup: { text: 'Human meetup' }, gathering: { text: 'Human gathering' }, agreements: [], remixOptions: [] }
  await act(async () => root.render(<CircleBuilder draft={draft as never} />))
  expect(container.textContent).toContain('What this Circle can support')
  expect(container.textContent).toContain('Main focus (optional)')
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input[placeholder^="Optional: how this Circle can support"]')]
  expect(inputs).toHaveLength(4)
  expect(inputs.every(input => !input.required)).toBe(true)
  expect(inputs.map(input => input.value)).toEqual(['', 'Walk together', '', ''])
  expect(state.save).not.toHaveBeenCalled()
})
