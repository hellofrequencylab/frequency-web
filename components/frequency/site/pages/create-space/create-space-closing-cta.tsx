'use client'

// The closing call on /create-a-space: "Start my Free Space" for a new visitor, "Finish my launch" when this browser
// holds a draft. Scrolls back to the builder; the builder's own island takes it from there. A client component so
// the label can read the draft, after mount, without the server markup ever differing from the cold render.
import { useEffect, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { hasProgress, readStoredDraft } from '@/lib/create-space/builder'

export function ClosingCta() {
  const [resumes, setResumes] = useState(false)
  useEffect(() => {
    try {
      const d = readStoredDraft((k) => window.localStorage.getItem(k), null)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's own storage once, after hydration
      if (d && hasProgress(d)) setResumes(true)
    } catch { /* storage blocked: the cold label stands */ }
  }, [])
  return (
    <a
      className="fq-iri-btn cs-go"
      href="#get-started"
      onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); window.setTimeout(() => document.getElementById('cs-name')?.focus({ preventScroll: true }), 420) }}
    >
      {resumes ? 'Finish my launch' : 'Start my Free Space'}<FqIcon name="arrow" size={18} />
    </a>
  )
}
