// QR image download endpoint. Renders a QR for a same-site link as SVG (default)
// or PNG, used by the admin Studio's "Download" buttons and the member code page.
//
// Deliberately NOT an open QR generator: it only encodes our own URLs (isSiteLink)
// and requires a signed-in caller. The encoded targets (a node landing page, a
// public profile) are themselves public, so no per-row authorization is needed —
// the gate is just "a member, encoding a Frequency link".
//
//   GET /api/qr?text=/n/<id>&format=png&size=1024&download=table-tent

import { getMyProfileId } from '@/lib/auth'
import { isSiteLink, toAbsoluteSiteUrl } from '@/lib/qr/links'
import { renderQrPng, renderQrSvg } from '@/lib/qr/render'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const profileId = await getMyProfileId()
  if (!profileId) return new Response('Sign in to generate a code.', { status: 401 })

  const url = new URL(request.url)
  const text = url.searchParams.get('text')?.trim()
  if (!text) return new Response('Missing `text`.', { status: 400 })
  if (!isSiteLink(text)) {
    return new Response('Only Frequency links can be encoded.', { status: 400 })
  }
  const target = toAbsoluteSiteUrl(text)

  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg'
  const requested = Number(url.searchParams.get('size'))
  const size = Number.isFinite(requested)
    ? Math.min(Math.max(Math.round(requested), 64), 2048)
    : format === 'png'
      ? 1024
      : 512

  const download = url.searchParams.get('download')
  const headers: Record<string, string> = { 'Cache-Control': 'private, max-age=300' }
  if (download) {
    const safe = download.replace(/[^\w.-]+/g, '-').slice(0, 64) || 'frequency-code'
    headers['Content-Disposition'] = `attachment; filename="${safe}.${format}"`
  }

  if (format === 'png') {
    const png = await renderQrPng(target, size)
    return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png' } })
  }
  const svg = await renderQrSvg(target, size)
  return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
