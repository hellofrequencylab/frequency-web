// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const m = vi.hoisted(() => ({ set: vi.fn(), review: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/coach/discovery-actions', () => ({ setSpaceDiscoveryConsent: m.set, reviewSpaceDiscovery: m.review }))
import { DiscoveryCoachingPanel } from './discovery-coaching-panel'
import { grantDiscoveryConsent } from '@/lib/spaces/discovery-consent'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement, root: Root
beforeEach(() => { vi.resetAllMocks(); container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
it('requires explicit permission and honestly labels unconnected providers', async () => {
  await act(async () => root.render(<DiscoveryCoachingPanel spaceId="a" initial={null} available />))
  expect(container.textContent).toContain('Google Search Console and Bing are not connected')
  expect(container.textContent).toContain('not unique visitors')
  expect(container.querySelectorAll('button')[1].disabled).toBe(true)
  expect(m.review).not.toHaveBeenCalled()
  m.set.mockResolvedValue({ data: grantDiscoveryConsent('actor','new-grant') })
  await act(async () => container.querySelector('button')!.click())
  expect(m.set).toHaveBeenCalledWith('a',true)
  expect(container.textContent).toContain('Permission expires')
  expect(container.querySelectorAll('button')[1].disabled).toBe(false)
})
it('revokes permission, clears displayed evidence and disables new reviews', async () => {
  const grant=grantDiscoveryConsent('actor','grant')
  await act(async () => root.render(<DiscoveryCoachingPanel spaceId="a" initial={grant} available />))
  m.review.mockResolvedValue({ status:'unavailable', reason:'source_unavailable' })
  await act(async () => container.querySelectorAll('button')[1].click())
  expect(container.textContent).toContain('Review unavailable')
  m.set.mockResolvedValue({ data:{...grant, revokedAt:new Date().toISOString()} })
  await act(async () => container.querySelector('button')!.click())
  expect(m.set).toHaveBeenCalledWith('a',false)
  expect(container.textContent).not.toContain('Review unavailable')
  expect(container.querySelectorAll('button')[1].disabled).toBe(true)
  expect(container.textContent).toContain('Future reviews are blocked')
})
it('disables all controls when private storage is unavailable', async () => {
  await act(async () => root.render(<DiscoveryCoachingPanel spaceId="a" initial={null} available={false} />))
  expect([...container.querySelectorAll('button')].every(button=>button.disabled)).toBe(true)
  expect(m.set).not.toHaveBeenCalled(); expect(m.review).not.toHaveBeenCalled()
})
