'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Link2, QrCode } from 'lucide-react'
import { NodeForm, type PartnerOption } from './qr-studio'
import { LinkForm, type NodeOption, type PickOption } from './dynamic-links'
import { StyleEditor } from './style-editor'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'

// The QR generator at the TOP of the Studio. Layout reads left→right: the design
// EDITOR (live preview + presets + controls) sits in a sticky rail, and the
// settings for the chosen code type sit beside it. Pick a type up top, design on
// the left, configure on the right, create — and it drops into its category below.
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
  // The editor lives here (not inside the forms) so the design survives switching
  // between code types, and a single style feeds whichever form is active.
  const [style, setStyle] = useState<QrStyle>(DEFAULT_STYLE)
  const router = useRouter()
  const done = () => {
    setStyle(DEFAULT_STYLE)
    router.refresh()
  }

  const previewUrl = kind === 'link' ? shortLinkUrl('preview') : 'https://frequencylocal.com/n/preview'

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Header + type navigation */}
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <QrCode className="h-4 w-4 text-primary-strong" /> Generate a code
        </h2>
        <p className="mt-0.5 text-xs text-muted">Design it on the left, configure it on the right.</p>
        <div className="mt-3 inline-flex rounded-lg border border-border bg-canvas p-0.5">
          <Seg active={kind === 'link'} onClick={() => setKind('link')} Icon={Link2} label="Dynamic link" />
          <Seg active={kind === 'node'} onClick={() => setKind('node')} Icon={MapPin} label="Check-in code" />
        </div>
        <p className="mt-2 text-xs text-subtle">
          {kind === 'link'
            ? 'A retargetable /q/… short link — point it anywhere, track every scan.'
            : 'A check-in code that runs the verified earn pipeline (zaps + practice).'}
        </p>
      </div>

      {/* Editor rail + settings */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-border bg-canvas/40 p-4 lg:self-start lg:border-b-0 lg:border-r lg:sticky lg:top-4">
          <StyleEditor variant="rail" value={style} onChange={setStyle} previewUrl={previewUrl} />
        </aside>
        <div className="p-4">
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
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}
