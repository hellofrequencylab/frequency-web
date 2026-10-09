'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'

export function VeraDock({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  function close() { setOpen(false); toggle.current?.focus() }
  return <div className="we-vera-dock" data-open={open}>
    <button ref={toggle} type="button" className="we-vera-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <Sparkles size={15} aria-hidden /><span>Vera</span>
    </button>
    <section id={panelId} className="we-vera-panel" aria-label="Vera writing assistant" hidden={!open} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="we-thread-head"><Sparkles size={14} aria-hidden /><span className="we-spacer">Vera</span><button type="button" className="we-icon" aria-label="Hide Vera" title="Hide Vera" onClick={close}><X size={16} aria-hidden /></button></div>
      <div className="we-note">Changes stay in your draft until you publish.</div>
      {children}
    </section>
  </div>
}
