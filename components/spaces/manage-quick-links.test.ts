import { describe, expect, it } from 'vitest'
import { manageQuickLinks } from './manage-quick-links'

describe('manageQuickLinks (SCAN-971)', () => {
  it('gives the in-place Manage panel doors to the full console, web editor, website and menu', () => {
    const links = manageQuickLinks({ slug: 'the-group', published: false, inPanel: true })
    expect(links.map((l) => l.href)).toEqual([
      '/spaces/the-group/manage',
      '/spaces/the-group/edit-page',
      '/spaces/the-group?panel=manage&area=settings',
      '/spaces/the-group/manage/modules',
    ])
  })

  it('opens a published website in a new tab, and drops the console door on /manage itself', () => {
    const links = manageQuickLinks({ slug: 'the-group', published: true, inPanel: false })
    expect(links.find((l) => l.key === 'console')).toBeUndefined()
    const site = links.find((l) => l.key === 'website')
    expect(site?.external).toBe(true)
    expect(site?.href).toMatch(/the-group/)
  })
})
