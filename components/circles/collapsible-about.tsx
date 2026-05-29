'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Boxless circle description. Collapses to two lines with a chevron toggle
// when the text is long enough to clip; short descriptions render plainly
// with no toggle.
export function CollapsibleAbout({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = text.length > 160 || text.includes('\n')

  if (!collapsible) {
    return (
      <p className="text-sm text-muted leading-relaxed max-w-2xl whitespace-pre-wrap">
        {text}
      </p>
    )
  }

  return (
    <div className="max-w-2xl">
      <p
        className={`text-sm text-muted leading-relaxed whitespace-pre-wrap ${
          expanded ? '' : 'line-clamp-2'
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
        aria-expanded={expanded}
      >
        {expanded ? 'Show less' : 'Read more'}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  )
}
