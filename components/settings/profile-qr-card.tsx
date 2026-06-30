'use client'

import { useState } from 'react'
import Link from 'next/link'
import { QrCode, Link2, Check, Download, Palette, Loader2 } from 'lucide-react'
import { downloadStyledQrPng } from '@/lib/qr/client-download'
import { UpsellTease } from '@/components/upsell/upsell-tease'
import type { TeaseGate } from '@/lib/pricing/upsell-tease'

// The member's personal QR generator on the Edit Profile page (linked to their
// account — their /q/<slug> connect code → their profile). The preview SVG is
// rendered server-side from the SAVED style, and the downloads go through
// /api/qr?code=<id>, which renders with that SAME style — so a download always
// matches exactly what's shown here. Styling/more codes live on /codes.
//
// The PNG is rasterized ON THE CLIENT from the self-contained styled SVG (avatar inlined,
// transparent), so it always carries the full design — no dependency on the serverless
// resvg path. If anything in that pipeline fails, it falls back to the server PNG render.
export function ProfileQrCard({
  svg,
  link,
  codeId,
  studioTease,
}: {
  svg: string
  link: string
  codeId: string
  /** Phase E upsell-tease gate (ADR-466), resolved server-side. Renders nothing while billing is OFF. */
  studioTease?: TeaseGate
}) {
  const [copied, setCopied] = useState(false)
  const [pngBusy, setPngBusy] = useState(false)
  const api = `/api/qr?code=${encodeURIComponent(codeId)}`
  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function downloadPng() {
    if (pngBusy) return
    setPngBusy(true)
    try {
      await downloadStyledQrPng(api, 'my-qr-code')
    } finally {
      setPngBusy(false)
    }
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60'

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
        <QrCode className="h-4 w-4 text-primary-strong" /> Your QR code
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        Linked to your account. Print it or share it, and every scan lands on your profile.
        Downloads match this exact style &amp; colour.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-xs text-muted" title={link}>{link}</code>
            <button type="button" onClick={copy} className={btn}>
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPng} disabled={pngBusy} className={btn}>
              {pngBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PNG
            </button>
            <a href={`${api}&format=svg&download=my-qr-code`} className={btn}><Download className="h-3.5 w-3.5" /> SVG</a>
            <Link href="/codes" className={btn}><Palette className="h-3.5 w-3.5" /> Customize</Link>
          </div>
        </div>
      </div>

      {/* Phase E upsell tease (ADR-466): once they have shared their code, tease QR Studio (multiple
          styled codes, scan tracking). Shown only after a copy (the share moment), and only when
          billing is live AND the caller is below Crew. DORMANT until billing_live ON. */}
      {copied && studioTease && (
        <UpsellTease
          target="qr-studio"
          live={studioTease.live}
          locked={studioTease.locked}
          href="/upgrade"
          title="Make more codes in QR Studio"
          body="Crew unlocks QR Studio: design several codes, point them anywhere, and see how many scans each one gets."
          cta="See what Crew adds"
        />
      )}
    </section>
  )
}
