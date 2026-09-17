'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { richParagraphs } from '@/lib/page-editor/richtext'

// ── THE CIRCLE'S ABOUT, AND IT FORMATS (owner ruling, 2026-09-17) ───────────────────────────────
//
// *"There are duplicate content sections for About and Page Text. I don't want the Page Text
// section, but I do want the ability to format the about section content."*
//
// The Circle page carried TWO free-text bodies: this one, `circles.about`, plain text and always
// above the feed; and `circle-text`, a movable rich-text block with a per-circle override and a
// network default. They answered the same question in two places, and the only thing Page text
// could do that About could not was FORMAT. So Page text is retired (see the retirement note in
// lib/widgets/modules.ts) and its one advantage moved here.
//
// SAME PARSER, SAME ALLOWLIST. `richParagraphs` is the dependency-free markdown subset Page text
// already used — **bold**, *italic*, [label](/path) — parsed into React elements and never through
// `dangerouslySetInnerHTML`, so there is no injection surface and link targets go through the
// shared safe-href allowlist. Moving the capability did not widen it by a character.
//
// 🔴 THE COLLAPSE MEASURES THE SOURCE, NOT THE RENDER. `collapsible` is computed from the raw text
// the host typed, which is right: a two-line About is two lines whether or not it has a bold word
// in it, and measuring the parsed output would make adding `**` to a word change whether the
// control appears. `line-clamp` still clamps the rendered paragraphs, so the toggle and the clamp
// agree about what is being hidden.
//
// `whitespace-pre-wrap` is GONE from the formatted path and that is deliberate: richParagraphs
// splits blank-line-separated blocks into real <p> elements, so preserving raw newlines on top of
// that would double every paragraph break.

export function CollapsibleAbout({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = text.length > 160 || text.includes('\n')

  const body = (
    <div className="max-w-2xl space-y-3 text-body-sm leading-relaxed text-muted [&_a]:font-medium [&_a]:text-primary-strong [&_strong]:text-text">
      {richParagraphs(text)}
    </div>
  )

  if (!collapsible) return body

  return (
    <div className="max-w-2xl">
      <div className={expanded ? '' : 'line-clamp-2'}>{body}</div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 inline-flex items-center gap-1 text-meta font-medium text-primary-strong hover:underline"
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
