// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NotificationsLoad } from '@/lib/notifications-map'

// /notifications existed only as a link target (the consoles' alerts, the outreach push, markAllRead's
// revalidation), so every one of those 404ed. The page now answers with the bell's own read.
const load = vi.fn<() => Promise<NotificationsLoad>>()
vi.mock('./actions', () => ({ getMyNotifications: () => load(), markAllRead: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn(async () => 'me') }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  usePathname: () => '/notifications',
}))
vi.mock('@/components/layout/page-admin-context', () => ({ usePageAdmin: () => ({ role: null, staffRole: null }) }))

const { default: NotificationsPage } = await import('./page')
const auth = await import('@/lib/auth')

const render = async () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(await NotificationsPage())
  return host
}

const row = (id: string, read: boolean) => ({
  id,
  type: 'event_rsvp',
  reference_type: 'support_ticket',
  reference_id: 't1',
  body: 'is going to Craft Night',
  read_at: read ? '2026-10-01T00:00:00Z' : null,
  created_at: '2026-10-01T00:00:00Z',
  actor: { id: 'a', display_name: 'Sam', handle: 'sam', avatar_url: null },
})

describe('/notifications', () => {
  beforeEach(() => load.mockReset())

  it('lists the notices, each a link, with mark-all-read only while something is unread', async () => {
    load.mockResolvedValue({ kind: 'ok', items: [row('1', false), row('2', true)] })
    const d = await render()
    expect(d.querySelector('h1')?.textContent).toBe('Notifications')
    expect(d.querySelectorAll('li a[href]')).toHaveLength(2)
    expect(d.textContent).toContain('Sam is going to Craft Night')
    expect(d.textContent).toContain('Mark all as read')
    expect(d.querySelector('ul')?.getAttribute('aria-label')).toBe('Notifications, 1 unread')
  })

  it('says caught up when there is nothing, and offers no mark-all-read', async () => {
    load.mockResolvedValue({ kind: 'ok', items: [] })
    const d = await render()
    expect(d.textContent).toContain('You’re caught up')
    expect(d.textContent).not.toContain('Mark all as read')
  })

  it('says the read failed instead of showing an empty list', async () => {
    load.mockResolvedValue({ kind: 'error' })
    const d = await render()
    expect(d.textContent).toContain('Notifications did not load')
  })

  it('sends a signed-out visitor to sign in and back', async () => {
    vi.mocked(auth.getMyProfileId).mockResolvedValueOnce(null)
    await expect(NotificationsPage()).rejects.toThrow('redirect:/sign-in?next=/notifications')
  })
})
