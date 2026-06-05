'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Link2, QrCode } from 'lucide-react'
import { NodeForm, type PartnerOption } from './qr-studio'
import { LinkForm, type NodeOption, type PickOption } from './dynamic-links'

// The QR generator that sits at the TOP of the Studio dashboard. Pick a type, lay
// out all the options + design, create — and it drops into its category below.
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
  const router = useRouter()
  const done = () => router.refresh()

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <QrCode className="w-4 h-4 text-primary-strong" /> Generate a code
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Pick a type, design it, and it appears in its category below.
        </p>
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
      <div className="p-4">
        {kind === 'link' ? (
          <LinkForm nodes={nodes} circles={circles} events={events} partners={partners} onDone={done} onCancel={done} />
        ) : (
          <NodeForm partners={partners} onDone={done} onCancel={done} />
        )}
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
