import { InlineRichText } from '../inline-rich-text'

// THE HEADING BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/heading.ts). Rendered through the
// inline-rich path so a heading authored with a <br> (or a Bold / Italic / Link mark) shows a real line
// break or mark on the page, exactly as the editor canvas does, not a literal `<BR>`. font-section is the
// Space page theme's heading face (ADR-578); a computed no-op for `bold`.
export default function HeadingBlock({ text }: { text: string }) {
  return text ? <InlineRichText as="h2" value={text} className="font-section text-page-title font-bold text-text" /> : null
}
