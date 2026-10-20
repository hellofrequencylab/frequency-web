import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Nfc } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle, withMemberAvatar } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'
import { signedNodeUrl } from '@/lib/qr/node-code'
import { PrintToolbar } from './print-toolbar'

export const dynamic = 'force-dynamic'

// Staff print surface: never indexable.
export const metadata = { robots: { index: false } }

// Per-code print sheet (host+). A standalone route OUTSIDE the (main) shell so it
// prints with no nav chrome. Pick a code (?code=<id>) or check-in node (?node=<id>)
// and a layout (?layout=tent|stickers|poster); we render the styled QR server-side
// and lay it out print-ready with cut guides. The toolbar is `print:hidden`.
//
// PLACARD (?node=<id>&placard=1): the same sheets worded for a check-in placard, a printed card
// with an NFC tag stuck to it. The QR still encodes the plain signedNodeUrl; the tag is written
// separately with signedPlacardUrl (the same link plus `&m=nfc`), so a tap and a scan count apart.
// Ignored for `?code=`, which is not a check-in node.
type Layout = 'tent' | 'stickers' | 'poster'

export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; node?: string; layout?: string; placard?: string }>
}) {
  // Staff-gated (owner: QR is an operator tool) — was host+, which let a community
  // leader reach the print view directly (this route is outside the /admin floor).
  await requireAdmin('admin', { staff: 'qr' })
  const { code, node, layout: layoutParam, placard: placardParam } = await searchParams
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
    const { data } = await db.from('nodes').select('label, type, style').eq('id', node).maybeSingle()
    if (!data) notFound()
    url = signedNodeUrl(node)
    title = data.label || 'Check-in code'
    style = parseStyle(data.style)
  } else {
    notFound()
  }

  const placard = !code && !!node && placardParam === '1'
  const base = `/print/qr?${code ? `code=${encodeURIComponent(code)}` : `node=${encodeURIComponent(node!)}`}${placard ? '&placard=1' : ''}`
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
        {layout === 'tent' && <TentSheet svg={svgBig} title={title} url={url} placard={placard} />}
        {layout === 'stickers' && <StickerSheet svg={svgSmall} title={title} placard={placard} />}
        {layout === 'poster' && <PosterSheet svg={svgBig} title={title} url={url} placard={placard} />}
      </div>
    </div>
  )
}

// A foldable table tent — two mirrored panels so it reads from both sides once
// folded along the centre line.
function TentSheet({ svg, title, url, placard }: { svg: string; title: string; url: string; placard: boolean }) {
  // KEEP bg-white: these sheets are printed, and paper is white whatever generation the screen is on.
  return (
    <div className="overflow-hidden rounded-card border border-border bg-white print:rounded-none print:border-0">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`flex flex-col items-center gap-4 px-8 py-10 ${i === 0 ? 'border-b border-dashed border-border' : 'rotate-180'}`}
        >
          <Eyebrow placard={placard} className="text-meta tracking-[0.2em]">
            {placard ? PLACARD_HEADING : 'Scan to connect'}
          </Eyebrow>
          <h1 className="text-center text-page-title font-bold text-text">{title}</h1>
          <div className="h-[300px] w-[300px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          {placard && <p className="text-center text-body-sm text-text">{PLACARD_HINT}</p>}
          <p className="text-body-sm text-muted">{prettyUrl(url)}</p>
        </div>
      ))}
    </div>
  )
}

// A grid of cut-out labels with dashed guides — sticker sheet / name-tag style.
function StickerSheet({ svg, title, placard }: { svg: string; title: string; placard: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-0">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2 border border-dashed border-border p-4"
        >
          <div className="h-[150px] w-[150px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="line-clamp-1 text-center text-2xs font-semibold text-text">{title}</p>
          {placard && (
            <p className="flex items-center gap-1 text-2xs text-muted">
              <Nfc className="h-3 w-3 shrink-0" aria-hidden /> {PLACARD_HEADING}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// One big centred code for a wall poster.
function PosterSheet({ svg, title, url, placard }: { svg: string; title: string; url: string; placard: boolean }) {
  // KEEP bg-white: these sheets are printed, and paper is white whatever generation the screen is on.
  return (
    <div className="flex min-h-[1000px] flex-col items-center justify-center gap-8 rounded-card border border-border bg-white px-10 py-16 text-center print:min-h-screen print:rounded-none print:border-0">
      <Eyebrow placard={placard} className="text-body-sm tracking-[0.25em]">
        {placard ? PLACARD_HEADING : 'Scan to join'}
      </Eyebrow>
      {/* text-display-poster, NOT a display-h* role: those are all clamp(…vw…), and on a printed
          sheet `vw` resolves against the page box — an A4 poster would fall to display-h3's
          1.75rem floor and print smaller than it previews, differently again on Letter. */}
      <h1 className="text-display-poster font-bold text-text">{title}</h1>
      <div className="h-[460px] w-[460px] max-w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {placard && <p className="text-body-lg text-text">{PLACARD_HINT}</p>}
      <p className="text-body-lg text-muted">{prettyUrl(url)}</p>
    </div>
  )
}

const PLACARD_HEADING = 'Tap or scan to check in'
const PLACARD_HINT = 'Hold your phone to the tag, or point your camera at the code.'

// The sheet's small uppercase line. On a placard it leads with the NFC glyph, so the tag reads as
// part of the card.
function Eyebrow({ placard, className, children }: { placard: boolean; className: string; children: ReactNode }) {
  return (
    <p className={`inline-flex items-center gap-2 font-semibold uppercase text-muted ${className}`}>
      {placard && <Nfc className="h-[1.25em] w-[1.25em] shrink-0" aria-hidden />}
      {children}
    </p>
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
