// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const mock = vi.hoisted(() => ({ expose: vi.fn() }))
vi.mock('@/app/(main)/events/experiment-actions', () => ({ exposeUpcomingExperiment: mock.expose }))
import { ExperimentExposure } from './experiment-exposure'
let root: Root | null = null
let container: HTMLDivElement | null = null
afterEach(async () => {
  if (root) await act(() => root?.unmount())
  container?.remove(); root = null; container = null
  vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.expose.mockReset()
})

it('records once only after the heading intersects a visible foreground tab', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mock.expose.mockResolvedValue(undefined)
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  let report: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void = () => {}
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof report) { report = callback }
    observe() {}
    disconnect() {}
  })
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  await act(() => root!.render(<ExperimentExposure id="experiment"><h2>Upcoming</h2></ExperimentExposure>))
  report([{ isIntersecting: true, intersectionRatio: 1 }])
  expect(mock.expose).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(mock.expose).toHaveBeenCalledWith('experiment')
  report([{ isIntersecting: true, intersectionRatio: 1 }])
  document.dispatchEvent(new Event('visibilitychange'))
  expect(mock.expose).toHaveBeenCalledTimes(1)
})
