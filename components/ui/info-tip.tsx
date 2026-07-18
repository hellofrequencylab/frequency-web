'use client'

import { useId, useState } from 'react'
import { Info } from 'lucide-react'

// A small info (i) icon that reveals a WRAPPING tooltip with deeper instructions. Unlike HoverTip
// (whitespace-nowrap, for short header-icon labels), this wraps to a readable width, so it suits a
// sentence or two of guidance next to a form field. Opens on hover AND on click/focus (keyboard +
// touch reach it, since hover alone excludes both). CSS-light; one bit of state for the click-latch.
// Voice per docs/CONTENT-VOICE: plain, no em or en dashes.
export function InfoTip({ label, side = 'top' }: { label: string; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const pos = side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  return (
    <span className="group/it relative inline-flex align-middle">
      <button
        type="button"
        aria-label="More info"
        aria-describedby={id}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-subtle transition-colors hover:text-primary-strong focus:text-primary-strong focus:outline-none"
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-lg bg-text px-3 py-2 text-xs font-medium leading-relaxed text-on-primary opacity-0 shadow-lg transition-opacity duration-100 ease-out group-hover/it:opacity-100 ${open ? 'opacity-100' : ''} ${pos}`}
      >
        {label}
      </span>
    </span>
  )
}
