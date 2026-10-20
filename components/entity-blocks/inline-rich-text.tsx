import { decodeLegacyEntities, sanitizeInlineHtml } from '@/lib/entity-blocks/block-content'

/** The safe inline-HTML string for an operator-authored value: heal a legacy double-escape FIRST (a value
 *  stored as entities but no real markup renders its true characters once here instead of literal `&quot;`),
 *  then sanitize to the allowlist (Bold / Italic / Link marks + <br> survive; a real newline becomes a <br>;
 *  EVERYTHING else is escaped as inert text). A plain-text value round-trips unchanged. '' when nothing
 *  survives. Exposed so a bespoke element that must keep its own attributes (an eyebrow's `data-text-role`)
 *  paints the same rich HTML without re-declaring the pipeline. */
export function inlineRichHtml(value: string): string {
  return sanitizeInlineHtml(decodeLegacyEntities(value))
}

/** Render an operator's inline-rich TEXT value (a slot authored on the WYSIWYG canvas) through the safe
 *  allowlist above, in the given tag — so a heading / title / body renders its <br> line breaks and inline
 *  marks EXACTLY as the editor canvas shows them, instead of escaping `<br>` to a literal `<BR>`. The value is
 *  re-sanitised HERE on read (defence in depth — a stored blob is user-originated and never trusted, mirroring
 *  the email renderer), so no unsafe markup can reach the page. Returns null when nothing survives. */
export function InlineRichText({
  as: Tag = 'p',
  value,
  className,
}: {
  as?: 'p' | 'blockquote' | 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'div' | 'figcaption'
  value: string
  className?: string
}) {
  const html = inlineRichHtml(value)
  if (!html) return null
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
