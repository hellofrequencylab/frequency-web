import QRCode from 'qrcode'
import { publicShareUrl } from './public-url'

/** A fixed public-page code, never a managed code or a settings link. */
export function stockSpaceUrl(origin: string, slug: string): string {
  return publicShareUrl(origin.replace(/\/$/, ''), `/spaces/${encodeURIComponent(slug)}`).url
}

export async function renderStockSpaceQr(url: string) {
  const options = { errorCorrectionLevel: 'M' as const, margin: 4, width: 1024 }
  const [png, svg] = await Promise.all([
    QRCode.toDataURL(url, options),
    QRCode.toString(url, { ...options, type: 'svg' }),
  ])
  return { png, svg }
}
