import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { stageCardResponse } from './stage-card'

describe('the Stage share card', () => {
  it('renders a 1200x630 jpeg with no image at all (the branded fallback)', async () => {
    const res = await stageCardResponse({ kicker: 'Circle', title: 'Tuesday Men’s Circle', line: 'A Circle on Frequency' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([1200, 630])
  }, 120_000)

  it('survives a three-hundred-word title without overflowing the card', async () => {
    const res = await stageCardResponse({ kicker: 'Event', title: 'word '.repeat(300), line: 'line '.repeat(80), meta: 'meta '.repeat(60) })
    expect(res.status).toBe(200)
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([1200, 630])
  }, 120_000)

  it('survives a title with no spaces and a glyph outside the Latin subset', async () => {
    const res = await stageCardResponse({ kicker: 'Event', title: `${'W'.repeat(120)} 日本語` })
    expect(res.status).toBe(200)
  }, 120_000)

  it('survives an unreachable image URL by falling back, never throwing', async () => {
    const res = await stageCardResponse({ kicker: 'Event', title: 'Sunset', coverUrl: 'not-a-url', logoUrl: 'also-bad' })
    expect(res.status).toBe(200)
  }, 120_000)
})
