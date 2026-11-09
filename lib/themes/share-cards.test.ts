import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { THEME_SHARE_CARDS, themeShareImage } from './share-cards'
import { FREQUENCY_PAGE_SEO, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

// LIVE-2114: every theme page shares its own Stage card, and the card on disk is the size the metadata claims.
describe('theme share cards', () => {
  it.each(THEME_SHARE_CARDS.map((c) => [c.id, c] as const))('%s has a 1200x630 card and a real cover', async (_id, card) => {
    expect(existsSync(join(process.cwd(), 'public', card.cover))).toBe(true)
    const file = join(process.cwd(), 'public', card.image)
    expect(existsSync(file)).toBe(true)
    const meta = await sharp(readFileSync(file)).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630])
  })

  it('the static theme pages point their share preview at their own card', () => {
    for (const [key, id] of [['midnight', 'midnight'], ['designer', 'designer'], ['network', 'network-kit'], ['temple', 'temple-kit'], ['newWorld', 'new-world']] as const) {
      const images = frequencyPageMetadata(FREQUENCY_PAGE_SEO[key]).openGraph?.images
      expect(JSON.stringify(images)).toContain(themeShareImage(id)!)
    }
  })

  it('a page with no card keeps the root card', () => {
    expect(JSON.stringify(frequencyPageMetadata(FREQUENCY_PAGE_SEO.themes).openGraph?.images)).not.toContain('/brand/theme-share/')
  })
})
