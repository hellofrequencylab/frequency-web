// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { LaunchBoxView } from '@/lib/launch/box-state'

const mocks = vi.hoisted(() => ({ minimize: vi.fn(), request: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/launch/actions', () => ({ setMinimizedAction: mocks.minimize, requestCancelAction: mocks.request, confirmCancelAction: mocks.confirm }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { LaunchPill, LaunchSheet } from './launch-box'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const view = (over: Partial<LaunchBoxView> = {}): LaunchBoxView => ({
  total: 9, done: 3, pct: 44, minimized: false, stopAsked: false, current: { id: 'website', label: 'Website' },
  stages: [
    { id: 'found', label: 'Be found', rows: [{ id: 'spotlight', label: 'Spotlight', required: true, state: 'done' }, { id: 'website', label: 'Website', required: true, state: 'now' }] },
    { id: 'gather', label: 'Gather people', rows: [{ id: 'event', label: 'Event', required: false, state: 'skipped' }] },
  ],
  ...over,
})
let root: Root; let host: HTMLDivElement
function Box({ v, onClose = () => {} }: { v: LaunchBoxView; onClose?: () => void }) {
  const [open, setOpen] = useState(true)
  return <><LaunchPill view={v} open={open} onToggle={() => setOpen((x) => !x)} />{open && <LaunchSheet view={v} onClose={onClose} />}</>
}
function mount(v: LaunchBoxView, onClose?: () => void) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(<Box v={v} onClose={onClose} />)) }
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement
beforeEach(() => { Object.values(mocks).forEach((m) => m.mockReset()); mocks.minimize.mockResolvedValue({ data: undefined }); mocks.request.mockResolvedValue({ data: undefined }); mocks.confirm.mockResolvedValue({ data: undefined }) })
afterEach(() => { act(() => root?.unmount()); host?.remove() })

it('the header mounts the pill and the sheet, gated on a launch running', () => {
  const src = readFileSync('components/frequency/members/shell/header.tsx', 'utf8')
  expect(src).toContain("import { LaunchPill, LaunchSheet } from './launch-box'")
  expect(src).toContain("toggle('launch')")
  expect(readFileSync('components/frequency/members/shell/members-shell.tsx', 'utf8')).toContain('launchSystemEnabled() ? loadLaunchBox() : undefined')
})

it('announces the count, lists the stages and steps, and has no dismiss control', () => {
  mount(view())
  expect(host.querySelector('.ap-launch')?.getAttribute('aria-label')).toBe('Your launch, 3 of 9 made')
  expect(host.textContent).toContain('Be found')
  expect(host.textContent).toContain('Next up: Website')
  expect(host.querySelector('.ap-launch-row.skipped small')?.textContent).toBe('Skipped')
  expect(host.textContent).not.toMatch(/dismiss|close|hide/i)
  expect(host.querySelector('a.ap-launch-go')?.getAttribute('href')).toBe('/launch')
})

it('stopping takes the button, then the typed word; one click never ends it', async () => {
  const onClose = vi.fn()
  mount(view(), onClose)
  expect(host.querySelector('form')).toBeNull()
  await act(async () => { button('Stop my launch').click() })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(host.querySelector('form')).not.toBeNull()
  expect(button('Stop').disabled).toBe(true)
  const input = host.querySelector<HTMLInputElement>('#fqm-launch-stop')!
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, 'STOP'); input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { button('Stop').click() })
  expect(mocks.confirm).toHaveBeenCalledWith('STOP')
  expect(onClose).toHaveBeenCalled()
})

it('a stop already asked for shows the typed-word form straight away', () => {
  mount(view({ stopAsked: true }))
  expect(host.querySelector('form')).not.toBeNull()
  expect(button('Stop my launch')).toBeUndefined()
})

it('minimize saves the flag and closes; a minimized launch offers to show itself again; an error is shown', async () => {
  const onClose = vi.fn()
  mount(view(), onClose)
  await act(async () => { button('Minimize').click() })
  expect(mocks.minimize).toHaveBeenCalledWith(true)
  expect(onClose).toHaveBeenCalled()
  act(() => root.unmount()); host.remove()
  mocks.minimize.mockResolvedValue({ error: 'We could not save that. Try again.' })
  mount(view({ minimized: true }))
  expect(host.querySelector('.ap-launch')?.className).toContain('min')
  await act(async () => { button('Show my launch').click() })
  expect(mocks.minimize).toHaveBeenLastCalledWith(false)
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not save')
})

it('after Publish the same pill reads Finish setup and the sheet lists what is left (LIVE-1914)', () => {
  mount(
    view({
      setup: { done: 4, total: 17, left: 13, pct: 24, sections: [{ id: 'space', title: 'Space', done: 1, total: 3 }], todo: [{ id: 'sc-cover', label: 'Cover image', href: '/launch/step/space', photo: true, skipped: false }] },
    }),
  )
  expect(host.querySelector('.ap-launch')?.getAttribute('aria-label')).toBe('Finish setup, 4 of 17 done')
  expect(host.querySelector('.ap-launch-l')?.textContent).toBe('Finish setup')
  expect(host.textContent).toContain('4 of 17 done · 13 left')
  expect(host.querySelector('a[href="/launch/step/space"]')?.textContent).toBe('Cover image')
})
