// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// scan2 L5-03 (2026-09-05): the bell never shows a false zero. A negative initial count is the
// loader saying the count RPC failed: no badge, and the control says so. A failed list load says
// "could not load" in the panel instead of "No notifications yet".

const { getMyNotifications, markAllRead } = vi.hoisted(() => ({
  getMyNotifications: vi.fn(),
  markAllRead: vi.fn(),
}))

vi.mock('@/app/(main)/notifications/actions', () => ({ getMyNotifications, markAllRead }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const { NotificationBell } = await import('./notification-bell')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
  markAllRead.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

async function open() {
  const button = container!.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
  await act(async () => {
    button.click()
  })
  // Let the transition's async loader settle.
  await act(async () => {
    await Promise.resolve()
  })
}

describe('NotificationBell', () => {
  it('draws no badge and says the count could not load for the unavailable sentinel', async () => {
    getMyNotifications.mockResolvedValue({ kind: 'ok', items: [] })
    await act(async () => {
      root!.render(<NotificationBell initialUnread={-1} />)
    })
    const button = container!.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
    expect(button.getAttribute('title')).toBe('Notifications could not load')
    // The badge is the only element that renders a count; none for the sentinel.
    expect(container!.textContent).not.toContain('-1')
    await open()
    // Opening must not "mark all read" a count that was never read.
    expect(markAllRead).not.toHaveBeenCalled()
  })

  it('shows a real count as the badge', async () => {
    await act(async () => {
      root!.render(<NotificationBell initialUnread={3} />)
    })
    const button = container!.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
    expect(button.getAttribute('title')).toBe('Notifications')
    expect(button.textContent).toContain('3')
  })

  it('renders the could-not-load line, never "No notifications yet", when the list RPC fails', async () => {
    getMyNotifications.mockResolvedValue({ kind: 'error' })
    await act(async () => {
      root!.render(<NotificationBell initialUnread={0} />)
    })
    await open()
    expect(container!.textContent).toContain('Notifications could not load.')
    expect(container!.textContent).not.toContain('No notifications yet')
  })

  it('renders "No notifications yet" only for a clean empty list', async () => {
    getMyNotifications.mockResolvedValue({ kind: 'ok', items: [] })
    await act(async () => {
      root!.render(<NotificationBell initialUnread={0} />)
    })
    await open()
    expect(container!.textContent).toContain('No notifications yet')
    expect(container!.textContent).not.toContain('could not load')
  })
})
