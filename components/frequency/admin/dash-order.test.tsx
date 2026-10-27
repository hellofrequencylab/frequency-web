// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(main)/admin/dash-order-actions', () => ({ setAdminDashOrder: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { AdminDashOrder } from './dash-order'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root; let host: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.resetAllMocks() })
function mount() { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(<AdminDashOrder scope="home" initialOrder={['growth', 'vera', 'community', 'programs', 'operations']} />)) }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label)! }
async function click(label: string) { await act(async () => { button(label).click() }) }
it('uses native accessible move controls, preserves every section, and saves the resulting order', async () => {
  mocks.save.mockResolvedValue(undefined); mount()
  expect(button('Move Growth up').disabled).toBe(true)
  expect(button('Move Platform down').disabled).toBe(true)
  await click("Move Vera's read up")
  expect([...host.querySelectorAll('li > span')].map(n => n.textContent)).toEqual(["Vera's read", 'Growth', 'Community', 'Content', 'Platform'])
  await click('Save section order')
  expect(mocks.save).toHaveBeenCalledWith('home', ['vera', 'growth', 'community', 'programs', 'operations'])
  expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(host.querySelector('[role="status"]')?.textContent).toBe('Section order saved.')
})
it('disables all actions while pending and recovers from failure without leaking internals', async () => {
  let reject!: (error: Error) => void
  mocks.save.mockImplementation(() => new Promise((_, no) => { reject = no })); mount()
  await click('Save section order')
  expect([...host.querySelectorAll('button')].every(b => b.disabled)).toBe(true)
  await act(async () => reject(new Error('private cookie internals')))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Please try again')
  expect(host.textContent).not.toContain('private cookie'); expect(mocks.refresh).not.toHaveBeenCalled()
  expect(button('Save section order').disabled).toBe(false)
})
it('mounts only for the actual janitor dashboard and retains server cookie-first ordering', () => {
  const source = readFileSync('app/(main)/admin/page.tsx', 'utf8')
  expect(source).toContain('staffJanitor && <AdminDashOrder scope="home" initialOrder={sectionOrder}')
  expect(source).toContain("sanitizeDashOrder('home', (await cookies()).get(dashCookie('home'))?.value)")
  expect(source).toContain('sectionOrder.map((id) => <Fragment key={id}>{janitorSections[id]}</Fragment>)')
})
