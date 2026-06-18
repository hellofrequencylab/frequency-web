// QR image download endpoint. Two modes, both gated to a signed-in caller:
//   • ?code=<id>  — a managed dynamic code: SVG is rendered with its saved style
//     (beautiful); PNG is the plain fallback (no server-side rasterizer for styled
//     SVG yet). Encodes the code's /q/<slug> short link.
//   • ?text=<link> — any same-site link, plain render (used for check-in nodes +
//     member connect codes). NOT an open generator (isSiteLink guard).
//
//   GET /api/qr?code=<id>&format=svg
//   GET /api/qr?text=/n/<id>&format=png&size=1024&download=table-tent

import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteLink, toAbsoluteSiteUrl, shortLinkUrl, nodeUrl } from '@/lib/qr/links'
import { renderQrPng, renderQrSvg } from '@/lib/qr/render'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { renderStyledQrPng } from '@/lib/qr/raster'
import { parseStyle, withMemberAvatar, type QrStyle } from '@/lib/qr/style'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const profileId = await getMyProfileId()
  if (!profileId) return new Response('Sign in to generate a code.', { status: 401 })

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg'

  // Resolve the encoded target + (for managed codes) the saved style.
  let target: string
  let style: QrStyle | null = null
  let defaultName = 'frequency-code'

  const codeId = url.searchParams.get('code')
  const nodeId = url.searchParams.get('node')
  if (codeId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('qr_codes')
      .select('slug, style, purpose, owner_profile_id')
      .eq('id', codeId)
      .maybeSingle()
    if (!data) return new Response('Unknown code.', { status: 404 })
    target = shortLinkUrl(data.slug)
    style = parseStyle(data.style)
    defaultName = data.slug
    // A member's personal `connect` code centers their current profile pic, matching /codes —
    // so a downloaded PNG/SVG stays in sync with no reprint (the avatar is layered on at render).
    if (data.purpose === 'connect' && data.owner_profile_id) {
      const { data: owner } = await admin
        .from('profiles')
        .select('avatar_url')
        .eq('id', data.owner_profile_id)
        .maybeSingle()
      style = withMemberAvatar(style, owner?.avatar_url ?? null)
    }
  } else if (nodeId) {
    // A check-in code (nodes): encodes /n/<id>, styled like a dynamic link.
    const admin = createAdminClient()
    const { data } = await admin.from('nodes').select('style, secret').eq('id', nodeId).maybeSingle()
    if (!data) return new Response('Unknown code.', { status: 404 })
    target = nodeUrl(nodeId, data.secret)
    style = parseStyle(data.style)
    defaultName = `checkin-${nodeId.slice(0, 8)}`
  } else {
    const text = url.searchParams.get('text')?.trim()
    if (!text) return new Response('Missing `code` or `text`.', { status: 400 })
    if (!isSiteLink(text)) return new Response('Only Frequency links can be encoded.', { status: 400 })
    target = toAbsoluteSiteUrl(text)
  }

  // `size` is optional; an absent param is Number(null) === 0 (finite!), so guard on > 0 or the
  // download silently clamps to the 64px floor instead of the intended default (the "tiny PNG" bug).
  const requested = Number(url.searchParams.get('size'))
  const size = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.max(Math.round(requested), 64), 2048)
    : format === 'png'
      ? 1024
      : 512

  const download = url.searchParams.get('download') ?? defaultName
  const safe = download.replace(/[^\w.-]+/g, '-').slice(0, 64) || 'frequency-code'
  const headers: Record<string, string> = {
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `attachment; filename="${safe}.${format}"`,
  }

  if (format === 'png') {
    // PNG downloads are large + transparent (no white card) so the code drops onto any design.
    // Styled codes rasterize their design (gradients/shapes/logo) via resvg; any failure degrades
    // to a plain transparent code so a download never breaks.
    let png: Buffer
    try {
      png = style
        ? await renderStyledQrPng(target, style, size, { transparent: true })
        : await renderQrPng(target, size, { transparent: true })
    } catch {
      png = await renderQrPng(target, size, { transparent: true })
    }
    return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png' } })
  }

  const svg = style ? renderStyledQrSvg(target, style, size) : await renderQrSvg(target, size)
  return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
