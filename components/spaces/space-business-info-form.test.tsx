// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ coach: vi.fn(), update: vi.fn(), business: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/spaces/profile-settings', () => ({ updateSpaceProfile: mocks.update }))
vi.mock('@/app/(main)/spaces/[slug]/manage/layout/actions', () => ({ setSpaceBusinessInfo: mocks.business }))
vi.mock('@/app/(main)/spaces/copilot-actions', () => ({ draftSpaceBioAction: mocks.coach }))
const { SpaceInfoConnectForm } = await import('./space-business-info-form')
let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  vi.clearAllMocks()
})

describe('Space writing coaching', () => {
  it('shows guidance separately and never replaces or saves the owner story', async () => {
    mocks.coach.mockResolvedValue({ data: 'Who should feel welcome here?' })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<SpaceInfoConnectForm spaceId="space-1" slug="our-space"
      about="Our short introduction" business={{ about: 'My own story' }} />))
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Coach me'))!
    await act(async () => button.click())
    expect(mocks.coach).toHaveBeenCalledWith('space-1', 'Our short introduction\n\nMy own story')
    expect((container.querySelector('#story') as HTMLTextAreaElement).value).toBe('My own story')
    expect((container.querySelector('#about') as HTMLTextAreaElement).value).toBe('Our short introduction')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Who should feel welcome here?')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.business).not.toHaveBeenCalled()
  })
})
