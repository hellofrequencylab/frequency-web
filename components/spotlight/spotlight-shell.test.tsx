import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpotlightShell } from './spotlight-shell'
import type { SpotlightData } from '@/lib/spotlight/data'
import type { SpotlightRow } from '@/lib/spotlight/privacy'
import { EMPTY_THEME } from '@/lib/spotlight/theme'
import { EMPTY_STICKERS } from '@/lib/spotlight/blocks/schema'

// SCAN-807: the Spotlight BACKGROUND layer. A creator's upload is the original file (up to 5 MB) and
// this layer fills the viewport on every visit, so it must go through next/image (resized, AVIF/WebP
// via the optimizer), never a raw <img> of the public storage URL. What these lock: the background
// is an optimizer-routed image sized to the viewport, it preloads only when it is the LCP candidate
// (no header image above it), the focal point and zoom still reach the element, and no background
// means no layer at all.

function row(over: Partial<SpotlightRow> = {}): SpotlightRow {
  return {
    id: 'p1',
    handle: 'ada',
    display_name: 'Ada',
    avatar_url: null,
    header_image_url: null,
    bio: null,
    website: null,
    community_role: null,
    membership_tier: null,
    created_at: '2021-06-01T00:00:00Z',
    current_streak: 0,
    lifetime_gems: 0,
    profile_theme: null,
    is_active: true,
    is_system: false,
    nexus_regions: null,
    ...over,
  }
}

function data(over: Partial<SpotlightData> = {}): SpotlightData {
  return {
    profile: row(),
    hostedEvents: [],
    layout: { version: 1, blocks: [] },
    background: { assetPath: 'bg/ada.jpg', dim: 20, focusX: 30, focusY: 70, zoom: 120 },
    stickers: EMPTY_STICKERS,
    theme: { ...EMPTY_THEME, header: { ...EMPTY_THEME.header, show: false } },
    totalZaps: 0,
    topFriends: [],
    guestbook: [],
    grid: null,
    ...over,
  }
}

function render(d: SpotlightData) {
  return renderToStaticMarkup(
    <SpotlightShell data={d} showBio={false}>
      <p>body</p>
    </SpotlightShell>,
  )
}

/** The <img> tags whose src carries the background asset path (the raw public URL or the
 *  optimizer URL that encodes it). */
function backgroundImgs(html: string) {
  return (html.match(/<img[^>]*>/g) ?? []).filter((tag) => /ada\.jpg|ada%2Fjpg|bg%2Fada/.test(tag))
}

describe('SpotlightShell background (SCAN-807)', () => {
  it('routes the background through next/image, sized to the viewport, never a raw storage img', () => {
    const html = render(data())
    const imgs = backgroundImgs(html)
    expect(imgs).toHaveLength(1)
    const tag = imgs[0]
    // The optimizer path: a srcset of width candidates and the full-viewport sizes hint, not a
    // single raw public URL of the original upload.
    expect(tag).toMatch(/srcset=/i)
    expect(tag).toContain('/_next/image?')
    expect(tag).toContain('sizes="100vw"')
    expect(tag).not.toMatch(/src="[^"]*\/storage\/v1\/object\/public\/avatars\/bg\/ada\.jpg"/)
    // The creator's framing still reaches the element.
    expect(tag).toContain('object-position:30% 70%')
    expect(tag).toContain('scale(1.2)')
    // Decorative: no alt text, inside the aria-hidden wrapper.
    expect(tag).toContain('alt=""')
    expect(html).toContain('pointer-events-none fixed inset-0')
  })

  it('preloads the background only when no header image sits above it (it is then the LCP candidate)', () => {
    const noHeader = render(data())
    expect(noHeader).toMatch(/<link[^>]*rel="preload"[^>]*as="image"/)

    const withHeader = render(
      data({
        profile: row({ header_image_url: 'https://example.test/h.png' }),
        theme: { ...EMPTY_THEME, header: { ...EMPTY_THEME.header, show: true } },
      }),
    )
    const preloads = withHeader.match(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g) ?? []
    // Exactly one preload: the header keeps the LCP hint, the background does not compete for it.
    expect(preloads).toHaveLength(1)
    expect(preloads[0]).toContain('h.png')
    expect(preloads[0]).not.toMatch(/ada\.jpg|bg%2Fada/)
  })

  it('renders no background layer at all when none is set', () => {
    const html = render(data({ background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 } }))
    expect(backgroundImgs(html)).toHaveLength(0)
    expect(html).not.toContain('pointer-events-none fixed inset-0')
  })
})
