// Entry-point flyer download (ADR-126). Returns the print-ready flyer as a vector
// SVG (the "download a vector file for your art" deliverable) or a high-res PNG
// (?format=png, rasterized with bundled Liberation Sans). Gated to the code's owner.
//
//   GET /api/entry-points/<slug>/flyer[?format=png][&size=1080]

import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'
import { buildEntryFlyerSvg, type FlyerSlots } from '@/lib/entry-points/flyer'
import { renderFlyerPng } from '@/lib/entry-points/flyer-raster'
import { getEntryTemplate } from '@/lib/entry-points/templates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getMyProfileId()
  if (!me) return new Response('Sign in first.', { status: 401 })
  const { slug } = await params
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg'

  const db = createAdminClient()
  const { data } = await db
    .from('qr_codes')
    .select('slug, title, owner_profile_id, template_id, flyer, style')
    .eq('slug', slug)
    .maybeSingle()
  const code = data as
    | { slug: string; title: string; owner_profile_id: string | null; template_id: string | null; flyer: unknown; style: unknown }
    | null

  if (!code || !code.template_id) return new Response('Unknown entry point.', { status: 404 })
  if (code.owner_profile_id !== me) return new Response('That isn’t your entry point.', { status: 403 })

  const template = getEntryTemplate(code.template_id)
  const raw = (code.flyer && typeof code.flyer === 'object' ? code.flyer : {}) as Record<string, unknown>
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v : fb)
  const slots: FlyerSlots = {
    headline: str(raw.headline, template.slots.headline),
    subhead: str(raw.subhead, template.slots.subhead),
    footer: str(raw.footer, template.slots.footer),
  }

  const link = shortLinkUrl(code.slug)
  const svg = buildEntryFlyerSvg({
    layout: template.flyerLayout,
    slots,
    qrStyle: parseStyle(code.style),
    url: link,
    shortLabel: link.replace(/^https?:\/\//, ''),
    // Render at print resolution for PNG; the SVG is resolution-independent.
    size: format === 'png' ? 1080 : undefined,
  })

  const safe = code.slug.replace(/[^\w.-]+/g, '-').slice(0, 64) || 'flyer'
  const disposition = (ext: string) => `attachment; filename="frequency-flyer-${safe}.${ext}"`

  if (format === 'png') {
    const png = await renderFlyerPng(svg, 1080)
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': disposition('png'),
      },
    })
  }

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': disposition('svg'),
    },
  })
}
