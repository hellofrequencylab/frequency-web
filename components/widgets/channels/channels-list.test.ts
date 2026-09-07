import { describe, it, expect } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'
import { join } from 'node:path'

// CHANNEL DIRECTORY CARD — source-shape guards (the page.test.ts idiom; the widget is a
// self-fetching RSC, so a render test would mean mocking the whole Supabase read for one style
// prop). What is locked here: the operator's cover focal point (settable since ADR-886) applies on
// the DIRECTORY card, not only on the Channel page hero. A plain `object-cover` crop silently
// discards the focal point, which is exactly the regression this file exists to block.

// Comment- and import-free (LIVE-167): the render seam is pinned on the call, never the import.
const src = sourceWithoutComments(join(__dirname, 'channels-list.tsx'), { imports: true })

describe('channels directory card (source shape): the cover crop honors the operator focal point', () => {
  it('selects `theme` in the topical_channels read (the bag the focal point lives in)', () => {
    expect(src).toContain(
      "select('id, name, slug, category, description, cover_image, display_order, pillar_id, theme')",
    )
  })

  it('threads theme -> readChannelCoverFocus -> channelCoverFocusStyle into the card image', () => {
    // THE render seam for a cropped Channel cover (lib/channels/hero.ts): object-cover paired with
    // the focal-point style, the same pairing the Channel page hero uses.
    expect(src).not.toMatch(/function (readChannelCoverFocus|channelCoverFocusStyle)\b/)
    expect(src).toContain('channelCoverFocusStyle(readChannelCoverFocus(channel.theme))')
    expect(src).toMatch(/className="h-12 w-12 rounded-2xl object-cover"\s+style=\{channelCoverFocusStyle\(/)
  })
})
