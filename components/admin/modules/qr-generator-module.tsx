'use client'

import { useMemo, useState } from 'react'
import { QrCode, Copy, Check } from 'lucide-react'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE } from '@/lib/qr/style'

// In-place QR generator (ADR-138 — Reach). A self-contained tool: type any URL/text,
// pick a colour + optional caption, and export in plenty of formats — vector SVG, PNG
// at 256–2048px, JPG, or copy-to-clipboard. Renders client-side via the pure
// `renderStyledQrSvg` (the `qrcode` lib is isomorphic), so no round-trips. The full
// Studio (dynamic links, check-in codes, campaigns, analytics) stays linked in Reach.

const PNG_SIZES = [256, 512, 1024, 2048] as const

export function QrGeneratorModule() {
  const [text, setText] = useState('')
  const [fg, setFg] = useState(DEFAULT_STYLE.fg)
  const [label, setLabel] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const value = text.trim() || 'https://frequencylocal.com'
  const style = useMemo(() => ({ ...DEFAULT_STYLE, fg, frameLabel: label.trim() || null }), [fg, label])
  const svg = useMemo(() => renderStyledQrSvg(value, style, 512), [value, style])
  const svgDataUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg])

  function save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function raster(size: number, jpeg: boolean): Promise<Blob | null> {
    const img = new window.Image()
    img.src = svgDataUrl
    await img.decode().catch(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (jpeg) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
    }
    ctx.drawImage(img, 0, 0, size, size)
    return new Promise((res) => canvas.toBlob((b) => res(b), jpeg ? 'image/jpeg' : 'image/png', 0.95))
  }

  async function downloadRaster(size: number, jpeg = false) {
    setBusy(true)
    const blob = await raster(size, jpeg)
    setBusy(false)
    if (blob) save(blob, `qr-code-${size}.${jpeg ? 'jpg' : 'png'}`)
  }

  async function copyPng() {
    setBusy(true)
    const blob = await raster(1024, false)
    setBusy(false)
    if (!blob || typeof ClipboardItem === 'undefined') return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // image clipboard not supported in this browser — no-op
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
        <QrCode className="h-4 w-4 text-primary-strong" /> QR generator
      </h3>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">URL or text</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-border-strong/30"
        />
      </label>

      <div className="flex items-center gap-3">
        <div
          className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-border bg-white [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 flex-1 space-y-2 text-xs text-muted">
          <label className="flex items-center justify-between gap-2">
            Colour
            <input
              type="color"
              value={fg}
              onChange={(e) => setFg(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-border bg-surface"
            />
          </label>
          <label className="block space-y-1">
            <span>Caption (optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="SCAN ME"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:ring-2 focus:ring-border-strong/30"
            />
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Export</p>
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={() => save(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg')} disabled={busy}>
            SVG
          </Btn>
          {PNG_SIZES.map((s) => (
            <Btn key={s} onClick={() => downloadRaster(s)} disabled={busy}>{`PNG ${s}`}</Btn>
          ))}
          <Btn onClick={() => downloadRaster(1024, true)} disabled={busy}>JPG</Btn>
          <Btn onClick={copyPng} disabled={busy}>
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </Btn>
        </div>
        <p className="text-subtle text-[11px]">Vector SVG · PNG 256–2048px · JPG · copy to clipboard.</p>
      </div>
    </div>
  )
}

function Btn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated disabled:opacity-50"
    >
      {children}
    </button>
  )
}
