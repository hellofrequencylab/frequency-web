// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const mocks = vi.hoisted(() => ({ list: vi.fn(), mark: vi.fn() }))
vi.mock('@/app/(main)/notifications/actions', () => ({ getMyNotifications: mocks.list, markAllRead: mocks.mark }))
import { BellButton, BellSheet } from './bell'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root; let host: HTMLDivElement
function Bell({ unread }: { unread: number }) { const [open, setOpen] = useState(false); return <><BellButton unreadCount={unread} open={open} onToggle={() => setOpen(v => !v)} />{open && <BellSheet />}</> }
function mount(unread = 0) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(<Bell unread={unread} />)) }
async function click(selector = 'button[aria-haspopup="dialog"]') { await act(async () => { host.querySelector<HTMLButtonElement>(selector)!.click() }) }
beforeEach(() => { mocks.list.mockReset(); mocks.mark.mockReset(); mocks.mark.mockResolvedValue(undefined) })
afterEach(() => { act(() => root?.unmount()); host?.remove() })
it('actual header imports and mounts these button and sheet exports', () => {
  const source = readFileSync('components/frequency/members/shell/header.tsx', 'utf8')
  expect(source).toContain("import { BellButton, BellSheet } from './bell'")
  expect(source).toContain("open === 'bell' && <BellSheet />")
  expect(source).toContain('<BellButton unreadCount={unreadCount}')
})
it('unavailable count is announced with no negative badge and never marks unread without a count', async () => {
  mocks.list.mockResolvedValue({ kind: 'ok', items: [] }); mount(-1)
  expect(host.querySelector('button')?.getAttribute('aria-label')).toContain('could not load')
  expect(host.textContent).not.toContain('-1'); await click(); expect(mocks.mark).not.toHaveBeenCalled()
})
it('announces a real unread count and marks only after a successful list, then clears its badge', async () => {
  let resolve!: (v: unknown) => void
  mocks.list.mockImplementation(() => new Promise(r => { resolve = r })); mount(3)
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 3 unread')
  await click(); expect(mocks.mark).not.toHaveBeenCalled()
  await act(async () => resolve({ kind: 'ok', items: [] }))
  expect(mocks.mark).toHaveBeenCalledTimes(1)
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications')
  expect(host.textContent).toContain('caught up')
})
it.each(['typed', 'transport'])('failed %s list load is retryable, never a false empty list or read mark', async mode => {
  if (mode === 'typed') mocks.list.mockResolvedValueOnce({ kind: 'error' })
  else mocks.list.mockRejectedValueOnce(new Error('private backend details'))
  mocks.list.mockResolvedValueOnce({ kind: 'ok', items: [] }); mount(4); await click()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Please try again')
  expect(host.textContent).not.toContain('private backend'); expect(host.textContent).not.toContain('caught up')
  expect(mocks.mark).not.toHaveBeenCalled(); expect(host.querySelector('button')?.getAttribute('aria-label')).toContain('4 unread')
  await click('button.btn'); expect(mocks.list).toHaveBeenCalledTimes(2); expect(mocks.mark).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('caught up')
})
it('failed read persistence keeps unread, exposes safe retry, then clears only on success', async () => {
  mocks.list.mockResolvedValue({ kind: 'ok', items: [] }); mocks.mark.mockRejectedValueOnce(new Error('secret write error')).mockResolvedValueOnce(undefined)
  mount(2); await click()
  expect(host.querySelector('button')?.getAttribute('aria-label')).toContain('2 unread')
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).not.toContain('secret write')
  await click('button.btn'); expect(mocks.mark).toHaveBeenCalledTimes(2)
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications')
})
it('closing while a list is pending prevents a later invisible read mark', async () => {
  let resolve!: (v: unknown) => void
  mocks.list.mockImplementation(() => new Promise(r => { resolve = r })); mount(2); await click(); await click()
  await act(async () => resolve({ kind: 'ok', items: [] })); expect(mocks.mark).not.toHaveBeenCalled()
})

it('refreshes a mounted button when the server supplies a new unread count', () => {
  mount(2)
  act(() => root.render(<Bell unread={5} />))
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 5 unread')
})
