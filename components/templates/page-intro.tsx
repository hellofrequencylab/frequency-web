// Page intro — the operator's intro copy under a page header (PROG-P6, ADR-1284).
//
// `page_content.body` is plain text an operator types into a textarea; this is the ONE place it
// turns into markup, so every surface that shows it reads the same. A blank line splits paragraphs
// and nothing else is interpreted: no markdown, no HTML, no links. Long-form belongs to the page
// editor (docs/EDITOR-ARCHITECTURE.md); this is a paragraph or three of section voice, and it
// INHERITS down the route tree the way the section hero does (lib/layout/content-cascade.ts).
//
// It is a PIECE, not a shell (PAGE-FRAMEWORK §3): IndexTemplate renders it from its `intro` slot,
// and a MarketHero page places it under the hero by hand. Presentational + server-friendly.

/** PURE: the paragraphs of an intro. A blank line (any whitespace-only line) splits; every line
 *  inside a paragraph is joined with a space, so a soft wrap in the textarea does not become a
 *  break. Blank or missing text is NO paragraphs, which is what lets the caller render nothing. */
export function splitIntroParagraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
}

export function PageIntro({ text, className }: { text?: string | null; className?: string }) {
  const paragraphs = splitIntroParagraphs(text)
  if (paragraphs.length === 0) return null
  return (
    <div className={`max-w-prose space-y-3 text-body text-muted ${className ?? 'mb-6'}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}
