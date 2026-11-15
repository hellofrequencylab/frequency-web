// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ brief: vi.fn(), export: vi.fn() }))
vi.mock('@/app/(main)/admin/insights/growth-actions', () => ({ draftGrowthBrief: mocks.brief, exportGrowthCampaigns: mocks.export }))
import { GrowthTools } from './growth-tools'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture'); static revokeObjectURL = vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  mocks.brief.mockResolvedValue({ text: 'Test one next step with a control.', at: '2026-11-12T23:00:00Z', mode: 'rules' })
  mocks.export.mockResolvedValue({ csv: 'fixture,only' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!

it('keeps brief evidence provenance visible after a separate export replaces the status message', async () => {
  await act(async () => root.render(<GrowthTools />))
  await act(async () => button('Draft an improvement brief').click())
  expect(container.querySelector('section[aria-label="Improvement brief"]')?.textContent).toContain('2026-11-12T23:00:00Z')
  await act(async () => button('Export campaign outcomes').click())
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Campaign aggregates exported')
  expect(container.querySelector('section[aria-label="Improvement brief"]')?.textContent).toContain('Rule-based brief')
  expect(container.querySelector('section[aria-label="Improvement brief"]')?.textContent).toContain('2026-11-12T23:00:00Z')
  expect(document.querySelector('a[download]')).toBeNull()
})

it('does not claim an export succeeded when its guarded action returns unavailable', async () => {
  mocks.export.mockResolvedValue({ error: 'Reading unavailable' })
  await act(async () => root.render(<GrowthTools />))
  await act(async () => button('Export campaign outcomes').click())
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Reading unavailable')
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
