import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { listingCardResponse } from './listing-card'

async function size(res: Response) {
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
  return [meta.width, meta.height]
}

describe('the listing share card', () => {
  it('renders a priced listing at 1200x630', async () => {
    const res = await listingCardResponse('Market', {
      title: 'Hand-thrown ceramic mug',
      price: '$34',
      facts: ['Home', 'Encinitas', null],
      blurb: 'Glazed in a studio in North County.',
      image: null,
    })
    expect(res.status).toBe(200)
    expect(await size(res)).toEqual([1200, 630])
  }, 120_000)

  it('renders the identity-free card when the listing is not public', async () => {
    const res = await listingCardResponse('Housing', null)
    expect(res.status).toBe(200)
    expect(await size(res)).toEqual([1200, 630])
  }, 120_000)

  it('survives an unreachable photo and a very long title', async () => {
    const res = await listingCardResponse('Classifieds', {
      title: 'word '.repeat(200),
      price: null,
      facts: [],
      blurb: null,
      image: 'not-a-url',
    })
    expect(res.status).toBe(200)
  }, 120_000)
})
