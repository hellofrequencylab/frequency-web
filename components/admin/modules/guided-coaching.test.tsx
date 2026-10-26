// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const m = vi.hoisted(() => ({ refresh: vi.fn(), load: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/practices/p/edit', useRouter: () => ({ refresh: m.refresh }) }))
vi.mock('@/lib/studio/steer-actions', () => ({ loadStudioSteerAction: m.load }))
vi.mock('@/lib/admin/modules/registry', () => ({ moduleById: () => null }))
vi.mock('@/components/studio/spark/spark-steer', () => ({ SparkSteer: ({ steer, onRedraw }: { steer: { mood?: boolean; lock?: string[] }; onRedraw: () => void }) => <div data-mood={String(!!steer.mood)} data-locks={steer.lock?.length ?? 0}><button onClick={onRedraw}>Coach</button></div> }))
import { GuidedModule } from './guided-module'
let root: Root | undefined
let element: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); element?.remove(); vi.clearAllMocks() })
it('coaching rail shows questions without rewrite controls, diff, undo or refresh', async () => {
  const redraw = vi.fn().mockResolvedValue({ data: { changes: [], before: {}, kept: [], questions: ['What would make the steps clearer?'] } })
  const restore = vi.fn()
  const manifest = { entity: 'practice', steer: { mood: true, lock: ['title'], directions: true } } as EntityManifest
  element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element)
  await act(async () => root!.render(<GuidedModule moduleId="practice.guided" manifest={manifest} blurb="Coach" routeKey={() => 'p'} resolve={async () => 'p'} redraw={redraw} restore={restore} coachingOnly />))
  const button = Array.from(element.querySelectorAll('button')).find(b => b.textContent === 'Coach')!
  await act(async () => button.click())
  expect(element.querySelector('[role="status"]')?.textContent).toContain('What would make the steps clearer?')
  expect(element.querySelector('[data-mood="false"][data-locks="0"]')).toBeTruthy()
  expect(element.textContent).not.toContain('Put it back')
  expect(restore).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled(); expect(m.load).not.toHaveBeenCalled()
})
