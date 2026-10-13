'use client'

// The glass tabs pinned to the foot of each rail (README §2 "Bottom tab You", §3 "Bottom tab"):
//   left  — "You": opens a 300px frosted panel rising from the tab.
//   right — split: the Vera orb (opens the real Vera assistant) and the Vault segment (opens the
//           Vault panel). Micro rails show the compact face of each.
// The panel bodies and the tab faces are server-rendered and passed in; this island only owns which
// panel is open. One open at a time; Escape or an outside click closes it.

import { useEffect, useRef, useState } from 'react'

function useDock() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

const CHEV = (
  <svg viewBox="0 0 12 12" className="fqm-tab-chev" aria-hidden>
    <path d="M3 7.5 6 4.5 9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export function RailYouTab({
  face,
  microFace,
  label,
  panel,
}: {
  /** Avatar + "You" + the standing line, for the open rail. */
  face: React.ReactNode
  /** The avatar alone, for the micro rail. */
  microFace: React.ReactNode
  /** Accessible name for the tab, e.g. "You, Daniel Tyack". */
  label: string
  panel: React.ReactNode
}) {
  const { open, setOpen, ref } = useDock()
  return (
    <div className="fqm-tab-wrap" ref={ref}>
      <div className="fqm-rise" data-open={open ? '' : undefined} id="fqm-you" inert={!open}>
        <div className="fqm-rise-card">{panel}</div>
      </div>
      <button type="button" className="fqm-tab fqm-tab-you fqm-full" aria-expanded={open} aria-controls="fqm-you" aria-label={label} onClick={() => setOpen((o) => !o)}>
        {face}
        {CHEV}
      </button>
      <button type="button" className="fqm-tab fqm-tab-micro fqm-micro" aria-expanded={open} aria-controls="fqm-you" aria-label={label} data-tip="You" onClick={() => setOpen((o) => !o)}>
        {microFace}
      </button>
    </div>
  )
}

export function RailVaultTab({
  face,
  microFace,
  label,
  panel,
}: {
  /** The streak, Zaps and Gems line for the open rail. */
  face: React.ReactNode
  /** "⚡ N" for the micro rail. */
  microFace: React.ReactNode
  label: string
  panel: React.ReactNode
}) {
  const { open, setOpen, ref } = useDock()
  const vera = () => {
    setOpen(false)
    window.dispatchEvent(new Event('open-vera'))
  }
  const orb = (
    <button type="button" className="fqm-vera-btn" aria-label="Ask Vera" title="Ask Vera" data-energy="still" data-tip="Vera" data-tip-sub="Help, events, practices" onClick={vera}>
      <span className="fqm-vera-orb fq-breathe" />
    </button>
  )
  return (
    <div className="fqm-tab-wrap" ref={ref}>
      <div className="fqm-rise" data-open={open ? '' : undefined} id="fqm-vault" inert={!open}>
        <div className="fqm-rise-card vault" data-energy="flow">
          <span className="fq-aura" />
          {panel}
        </div>
      </div>
      <div className="fqm-tab fqm-tab-split fqm-full">
        {orb}
        <span className="fqm-tab-sep" />
        <button type="button" className="fqm-vault-btn" aria-expanded={open} aria-controls="fqm-vault" aria-label={label} onClick={() => setOpen((o) => !o)}>
          {face}
        </button>
      </div>
      <div className="fqm-tab fqm-tab-split micro fqm-micro">
        {orb}
        <button type="button" className="fqm-vault-btn" aria-expanded={open} aria-controls="fqm-vault" aria-label={label} data-tip="The Vault" onClick={() => setOpen((o) => !o)}>
          {microFace}
        </button>
      </div>
    </div>
  )
}
