import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle, withMemberAvatar } from '@/lib/qr/style'
import { shortLinkUrl, nodeUrl } from '@/lib/qr/links'
import { PrintToolbar } from './print-toolbar'

export const dynamic = 'force-dynamic'

// Per-code print sheet (host+). A standalone route OUTSIDE the (main) shell so it
// prints with no nav chrome. Pick a code (?code=<id>) or check-in node (?node=<id>)
// and a layout (?layout=tent|stickers|poster); we render the styled QR server-side
// and lay it out print-ready with cut guides. The toolbar is `print:hidden`.
type Layout = 'tent' | 'stickers' | 'poster'

export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; node?: string; layout?: string }>
}) {
  // Staff-gated (owner: QR is an operator tool) — was host+, which let a community
  // leader reach the print view directly (this route is outside the /admin floor).
  await requireAdmin('admin', { staff: 'qr' })
  const { code, node, layout: layoutParam } = await searchParams
  const layout: Layout =
    layoutParam === 'stickers' ? 'stickers' : layoutParam === 'poster' ? 'poster' : 'tent'

  const db = createAdminClient()
  let url: string
  let title: string
  let style

  if (code) {
    const { data } = await db
      .from('qr_codes')
      .select('slug, title, style, purpose, owner_profile_id')
      .eq('id', code)
      .maybeSingle()
    if (!data) notFound()
    url = shortLinkUrl(data.slug)
    title = data.title || `/q/${data.slug}`
    style = parseStyle(data.style)
    // A member's personal `connect` code prints with their current profile pic centered, in sync
    // with /codes and the downloads (avatar layered on at render, never baked into the stored style).
    if (data.purpose === 'connect' && data.owner_profile_id) {
      const { data: owner } = await db
        .from('profiles')
        .select('avatar_url')
        .eq('id', data.owner_profile_id)
        .maybeSingle()
      style = withMemberAvatar(style, owner?.avatar_url ?? null)
    }
  } else if (node) {
    const { data } = await db.from('nodes').select('label, type, style, secret').eq('id', node).maybeSingle()
    if (!data) notFound()
    url = nodeUrl(node, data.secret)
    title = data.label || 'Check-in code'
    style = parseStyle(data.style)
  } else {
    notFound()
  }

  const base = `/print/qr?${code ? `code=${encodeURIComponent(code)}` : `node=${encodeURIComponent(node!)}`}`
  const svgBig = renderStyledQrSvg(url, style, 520)
  const svgSmall = renderStyledQrSvg(url, style, 240)

  return (
    <div className="min-h-screen bg-canvas">
      <PrintToolbar base={base} layout={layout} />
      {/* Print setup: A4 portrait, exact colors so gradients/brand survive print. */}
      <style>{`@media print {
        @page { size: A4 portrait; margin: 12mm; }
        html, body { background: #fff; }
      }`}</style>

      <div className="mx-auto max-w-[820px] p-6 print:p-0">
        {layout === 'tent' && <TentSheet svg={svgBig} title={title} url={url} />}
        {layout === 'stickers' && <StickerSheet svg={svgSmall} title={title} />}
        {layout === 'poster' && <PosterSheet svg={svgBig} title={title} url={url} />}
      </div>
    </div>
  )
}

// A foldable table tent — two mirrored panels so it reads from both sides once
// folded along the centre line.
function TentSheet({ svg, title, url }: { svg: string; title: string; url: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white print:rounded-none print:border-0">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`flex flex-col items-center gap-4 px-8 py-10 ${i === 0 ? 'border-b border-dashed border-border' : 'rotate-180'}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">Scan to connect</p>
          <h1 className="text-center text-2xl font-bold text-text">{title}</h1>
          <div className="h-[300px] w-[300px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-sm text-muted">{prettyUrl(url)}</p>
        </div>
      ))}
    </div>
  )
}

// A grid of cut-out labels with dashed guides — sticker sheet / name-tag style.
function StickerSheet({ svg, title }: { svg: string; title: string }) {
  return (
    <div className="grid grid-cols-3 gap-0">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2 border border-dashed border-border p-4"
        >
          <div className="h-[150px] w-[150px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="line-clamp-1 text-center text-2xs font-semibold text-text">{title}</p>
        </div>
      ))}
    </div>
  )
}

// One big centred code for a wall poster.
function PosterSheet({ svg, title, url }: { svg: string; title: string; url: string }) {
  return (
    <div className="flex min-h-[1000px] flex-col items-center justify-center gap-8 rounded-xl border border-border bg-white px-10 py-16 text-center print:min-h-screen print:rounded-none print:border-0">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-subtle">Scan to join</p>
      <h1 className="text-4xl font-bold text-text">{title}</h1>
      <div className="h-[460px] w-[460px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-lg text-muted">{prettyUrl(url)}</p>
    </div>
  )
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return url
  }
}
