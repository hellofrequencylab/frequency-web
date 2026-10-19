import { describe, expect, it } from 'vitest'
import { manageQuickLinks } from './manage-quick-links'

describe('manageQuickLinks (SCAN-971)', () => {
  it('gives the in-place Manage panel doors to the full console, web editor, website builder, website and menu', () => {
    const links = manageQuickLinks({ slug: 'the-group', published: false, inPanel: true })
    expect(links.map((l) => l.href)).toEqual([
      '/spaces/the-group/manage',
      '/spaces/the-group/edit-page',
      '/spaces/the-group/manage/leadership/open?to=editor',
      '/spaces/the-group?panel=manage&area=settings',
      '/spaces/the-group/manage/modules',
    ])
  })

  it('the Website builder door goes through the leadership handoff to the site editor (SCAN-1015)', () => {
    const builder = manageQuickLinks({ slug: 'the-group', published: true, inPanel: false }).find((l) => l.key === 'builder')
    expect(builder?.href).toBe('/spaces/the-group/manage/leadership/open?to=editor')
    expect(builder?.external).toBeUndefined()
  })

  it('opens a published website in a new tab, and drops the console door on /manage itself', () => {
    const links = manageQuickLinks({ slug: 'the-group', published: true, inPanel: false })
    expect(links.find((l) => l.key === 'console')).toBeUndefined()
    const site = links.find((l) => l.key === 'website')
    expect(site?.external).toBe(true)
    expect(site?.href).toMatch(/the-group/)
  })
})
