import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-663: the feed shows the soonest follow-up the member set, from the contacts page's read.

const listDueReminders = vi.fn()
vi.mock('@/lib/connections/store', () => ({ listDueReminders }))

const reminder = (id: string, name: string | null, dueAt: string) => ({
  id,
  contactId: `c-${id}`,
  dueAt,
  note: null,
  doneAt: null,
  createdAt: null,
  contactName: name,
  contactAvatarUrl: null,
})

beforeEach(() => listDueReminders.mockReset())

describe('ReachOutCard', () => {
  it('renders nothing when nothing is due', async () => {
    listDueReminders.mockResolvedValue([])
    const { ReachOutCard } = await import('./reach-out-card')
    expect(await ReachOutCard({ viewerProfileId: 'p-1' })).toBeNull()
    expect(listDueReminders).toHaveBeenCalledWith('p-1', 3)
  })

  it('names the soonest follow-up and counts the rest', async () => {
    const today = new Date().toISOString()
    listDueReminders.mockResolvedValue([reminder('1', 'Ana', today), reminder('2', 'Ben', today), reminder('3', null, today)])
    const { ReachOutCard } = await import('./reach-out-card')
    const html = renderToStaticMarkup((await ReachOutCard({ viewerProfileId: 'p-1' }))!)
    expect(html).toContain('Check in with Ana')
    expect(html).toContain('href="/connections/c-1"')
    expect(html).toContain('You meant to reach out today.')
    expect(html).toContain('2 more people to reach out to')
    expect(html).not.toContain('—')
  })
})
