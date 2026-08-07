'use client'

import { useId, useState } from 'react'
import { Info } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'

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
      {/* The (i) is the whole affordance, so it composes IconButton rather than re-deriving a
          box: the hand-rolled one shipped at 20px, under both the 32px density floor and the
          44px coarse-pointer target, and carried no focus ring. `-my-1.5` keeps the glyph on
          the same optical line as the label it follows now that the box is the kit's. */}
      {/* `title` is cleared on purpose, and ONLY here: IconButton's label doubles as a native
          tooltip, which is right for a row action but wrong for a control whose entire job is
          to open a richer tooltip of its own. The accessible name (aria-label) is untouched. */}
      <IconButton
        label="More info"
        title={undefined}
        aria-describedby={id}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="-my-1.5"
      >
        <Info className="h-4 w-4" aria-hidden />
      </IconButton>
      <span
        id={id}
        role="tooltip"
        // `group-focus-within/it` opens it on TAB, not only on click: the (i) is the whole
        // affordance, so a keyboard member reaching it should see the guidance without having
        // to guess that Enter reveals more (docs/INTERACTION-STATES.md §2, "tips only").
        className={`pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-control bg-text px-3 py-2 text-meta font-medium leading-relaxed text-on-primary opacity-0 shadow-lg transition-opacity duration-100 ease-out motion-reduce:transition-none group-hover/it:opacity-100 group-focus-within/it:opacity-100 ${open ? 'opacity-100' : ''} ${pos}`}
      >
        {label}
      </span>
    </span>
  )
}
