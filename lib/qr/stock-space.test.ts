import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { renderStockSpaceQr, stockSpaceUrl } from './stock-space'

async function decode(bytes: Buffer) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data
}

describe('stock Space QR downloads', () => {
  it('decodes both downloadable formats to the same public Space page', async () => {
    const url = stockSpaceUrl('https://frequencylocal.com/', 'house-of-fates')
    expect(url).toBe('https://frequencylocal.com/spaces/house-of-fates')
    const { png, svg } = await renderStockSpaceQr(url)
    expect(await decode(Buffer.from(png.split(',')[1]!, 'base64'))).toBe(url)
    expect(await decode(Buffer.from(svg))).toBe(url)
  })

  it('does not let a malformed slug encode a private or unrelated route', () => {
    expect(stockSpaceUrl('https://frequencylocal.com', '../settings?panel=qr')).toBe(
      'https://frequencylocal.com/spaces/..%2Fsettings%3Fpanel%3Dqr',
    )
    expect(stockSpaceUrl('https://frequencylocal.com', 'settings')).toBe('https://frequencylocal.com/discover')
  })
})
