'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Link2, QrCode, TriangleAlert } from 'lucide-react'
import { NodeForm, type PartnerOption } from './qr-studio'
import { LinkForm, type NodeOption, type PickOption } from './dynamic-links'
import { StyleEditor } from './style-editor'
import { DEFAULT_STYLE, STYLE_PRESETS, type QrStyle } from '@/lib/qr/style'
import { scannabilityWarnings } from '@/lib/qr/scannability'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { shortLinkUrl } from '@/lib/qr/links'

// The QR generator at the TOP of the Studio. It's a compact, three-column
// rectangle that reads left→right:
//   1. preview + presets + the code-type selector
//   2. the design controls (StyleEditor)
//   3. the config form for the chosen code type
// Pick a type, design it, configure it, create — and it drops into its category
// below. The style lives here (not in the forms) so a design survives switching
// types, and a single style feeds whichever form is active.
export function QrGenerator({
  partners,
  nodes,
  circles,
  events,
}: {
  partners: PartnerOption[]
  nodes: NodeOption[]
  circles: PickOption[]
  events: PickOption[]
}) {
  const [kind, setKind] = useState<'link' | 'node'>('link')
  const [style, setStyle] = useState<QrStyle>(DEFAULT_STYLE)
  const router = useRouter()
  const done = () => {
    setStyle(DEFAULT_STYLE)
    router.refresh()
  }

  const previewUrl = kind === 'link' ? shortLinkUrl('preview') : 'https://frequencylocal.com/n/preview'
  const svg = useMemo(() => renderStyledQrSvg(previewUrl, style, 240), [previewUrl, style])
  const warnings = useMemo(() => scannabilityWarnings(style), [style])

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <QrCode className="h-4 w-4 text-primary-strong" /> Generate a code
        </h2>
        <p className="mt-0.5 text-xs text-muted">Preview and pick a look, design it, then configure it.</p>
      </div>

      {/* Three columns, read left→right: [preview + presets + type] | [design] |
          [destination]. A 1px border gap (gap-px on a bordered track) gives the three
          panes a clean shared seam without hand-rolled dividers. */}
      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-[240px_minmax(0,300px)_minmax(0,1fr)]">
        {/* ── Column 1 — preview, presets, type selector ──────────────────── */}
        <div className="space-y-5 bg-surface p-5">
          <div
            className="mx-auto aspect-square w-full max-w-[200px] rounded-xl border border-border bg-white p-2 shadow-sm [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setStyle({ ...p.style })}
                  className="rounded-full border border-border px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-bg hover:text-primary-strong"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {warnings.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning-bg/50 p-2">
                <p className="flex items-center gap-1 text-2xs font-semibold text-warning">
                  <TriangleAlert className="h-3 w-3" /> Scannability
                </p>
                <ul className="mt-1 space-y-1 text-2xs text-muted">
                  {warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-subtle">Type</p>
            <div className="inline-flex w-full rounded-lg border border-border bg-canvas p-0.5">
              <Seg active={kind === 'link'} onClick={() => setKind('link')} Icon={Link2} label="Dynamic link" />
              <Seg active={kind === 'node'} onClick={() => setKind('node')} Icon={MapPin} label="Check-in code" />
            </div>
            <p className="text-2xs leading-relaxed text-subtle">
              {kind === 'link'
                ? 'A retargetable /q/… short link. Point it anywhere, track every scan.'
                : 'A check-in code that runs the verified earn pipeline (Zaps + practice).'}
            </p>
          </div>
        </div>

        {/* ── Column 2 — design controls ──────────────────────────────────── */}
        {/* Controls-only StyleEditor: the preview + presets live in column 1 (same
            style state), so here we render just the grouped Colors/Shape/Logo/Frame
            controls under their own "Design" header. */}
        <div className="bg-surface p-5">
          <StyleEditor value={style} onChange={setStyle} previewUrl={previewUrl} variant="controls" />
        </div>

        {/* ── Column 3 — destination / config form ────────────────────────── */}
        <div className="space-y-3 bg-surface p-5">
          <div className="flex items-center gap-1.5">
            {kind === 'link' ? (
              <Link2 className="h-3.5 w-3.5 text-primary-strong" />
            ) : (
              <MapPin className="h-3.5 w-3.5 text-primary-strong" />
            )}
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-text">Destination</h4>
          </div>
          {kind === 'link' ? (
            <LinkForm
              nodes={nodes}
              circles={circles}
              events={events}
              partners={partners}
              externalStyle={style}
              hideEditor
              onDone={done}
              onCancel={done}
            />
          ) : (
            <NodeForm partners={partners} externalStyle={style} hideEditor onDone={done} onCancel={done} />
          )}
        </div>
      </div>
    </section>
  )
}

function Seg({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof Link2
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-2xs font-semibold transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
