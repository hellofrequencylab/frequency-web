// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { LaunchBoxView } from '@/lib/launch/box-state'

vi.mock('@/lib/launch/actions', () => ({
  setMinimizedAction: vi.fn(),
  requestCancelAction: vi.fn(),
  confirmCancelAction: vi.fn(),
  askHideSetupAction: vi.fn(),
  confirmHideSetupAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/spaces/hof/manage' }))
import { ConsoleLaunch } from './console-launch'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// LIVE-2320: the Finish setup pill in the Space console top bar.

const setupView = (): LaunchBoxView => ({
  total: 9, done: 9, pct: 100, minimized: false, stopAsked: false, current: null, stages: [],
  setup: {
    done: 2, total: 6, left: 4, pct: 33,
    sections: [{ id: 'basics', title: 'Basics', done: 2, total: 3 }],
    todo: [{ id: 'hours', label: 'Set your hours', href: '/spaces/hof/settings/availability', skipped: false }],
  },
} as unknown as LaunchBoxView)

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

async function mount(view: LaunchBoxView | null) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const p = Promise.resolve(view)
  await act(async () => {
    root!.render(<Suspense fallback={null}><ConsoleLaunch launch={p} /></Suspense>)
    await p
  })
}

it('draws the same Finish setup pill and opens its sheet', async () => {
  await mount(setupView())
  const pill = host!.querySelector<HTMLButtonElement>('.ap-launch')!
  expect(pill.getAttribute('aria-label')).toBe('Finish setup, 2 of 6 done')
  expect(pill.getAttribute('aria-controls')).toBe('ad-launch')
  expect(host!.querySelector('#ad-launch')?.getAttribute('aria-hidden')).toBe('true')
  await act(async () => pill.click())
  expect(host!.querySelector('#ad-launch')?.className).toContain('on')
  expect(host!.textContent).toContain('Set your hours')
})

it('draws nothing when there is no launch', async () => {
  await mount(null)
  expect(host!.querySelector('.ap-launch')).toBeNull()
})

it('the Space console hands its shell the members header loader', () => {
  const src = readFileSync('components/frequency/admin/space-console.tsx', 'utf8')
  expect(src).toContain('launch={launchSystemEnabled() ? loadLaunchBox() : undefined}')
  expect(readFileSync('components/frequency/admin/admin-shell.tsx', 'utf8')).toContain('<ConsoleLaunch launch={launch} />')
})
