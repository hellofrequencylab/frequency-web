import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'
import { networkNoticeCookie } from './network-notice-cookie'

// LIVE-1021: Members, Friends and My Contacts share one header and one tab-and-notice strip, and none
// of them wears a photo hero. Pinned on the code (comments blanked), so a page that goes back to the
// hero band, or drops the shared strip, fails here.

const ROOT = join(__dirname, '..', '..', 'app', '(main)', 'network')
const PAGES = ['page.tsx', join('friends', 'page.tsx'), join('contacts', 'page.tsx')]

describe('Network hub pages (source shape)', () => {
  for (const page of PAGES) {
    const src = sourceWithoutComments(join(ROOT, page), { imports: true })
    it(`${page} draws the shared strip and no photo hero`, () => {
      expect(src).toContain('<NetworkHubBar active=')
      expect(src).not.toContain('resolveIndexHero')
      expect(src).not.toContain('{...hero}')
      expect(src).toContain('eyebrow="Your network"')
    })
  }
})

describe('Network how-to notice', () => {
  it('remembers the close per member', () => {
    expect(networkNoticeCookie('abc')).not.toBe(networkNoticeCookie('def'))
  })
  it('is read on the server, so a closed notice never flashes', () => {
    const src = sourceWithoutComments(join(__dirname, 'network-notice.tsx'), { imports: true })
    expect(src).toContain('networkNoticeCookie(user.id)')
    expect(src).toContain('if (closed) return null')
  })
})
