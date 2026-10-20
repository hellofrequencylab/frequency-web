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
      expect(src).toContain('heroOverlay={false}')
      expect(src).toContain('eyebrow="Your network"')
    })
  }
})

// LIVE-1086: the second pass. Members drops the glyph, intro paragraph and stats band; the three pages share one
// width (no max-w wrapper) and one slot for the hub strip; the cards, notice and filters have a kit branch.
describe('Network hub pages: one layout (LIVE-1086)', () => {
  const members = sourceWithoutComments(join(ROOT, 'page.tsx'), { imports: true })
  it('Members has no title glyph, intro paragraph or stats band', () => {
    expect(members).not.toContain('<Globe className="h-5 w-5"')
    expect(members).not.toContain('intro={')
    expect(members).not.toContain('Members Worldwide')
  })
  for (const page of PAGES.slice(1)) {
    const src = sourceWithoutComments(join(ROOT, page), { imports: true })
    it(`${page} is full width, like Members`, () => {
      expect(src).not.toContain('max-w-5xl')
    })
  }
  it('My Contacts puts only the hub strip in the toolbar slot', () => {
    const src = sourceWithoutComments(join(ROOT, 'contacts', 'page.tsx'), { imports: true })
    expect(src).toContain('toolbar={<NetworkHubBar active="/network/contacts" />}')
  })
  it('the notice and the person card have a kit branch', () => {
    const notice = sourceWithoutComments(join(__dirname, 'network-notice-close.tsx'), { imports: true })
    expect(notice).toContain('fa-notice')
    const card = sourceWithoutComments(join(__dirname, 'contact-card.tsx'), { imports: true })
    expect(card).toContain('<PersonCard')
  })
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
