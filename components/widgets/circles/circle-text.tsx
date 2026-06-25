import { getCircleContext } from '@/lib/circles/active-circle'
import { richParagraphs } from '@/lib/page-editor/richtext'

// The movable circle TEXT block (the `circle-text` layout module): a free rich-text note an operator
// places anywhere on the circle page via the Layout editor (header, MAIN, or the info-rail). Reads
// the already-resolved text from the request-scoped circle context (per-circle override ?? network
// default — lib/circles/circle-text.ts) and renders it through the safe markdown subset
// (richParagraphs: **bold** · *italic* · [label](/path), no HTML injection surface). Renders nothing
// when there's no text, so an unset block never leaves an empty slot.
export const CircleText = async () => {
  const ctx = getCircleContext()
  const body = ctx?.layoutText?.trim()
  if (!body) return null
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted [&_a]:font-medium [&_strong]:text-text">
      {richParagraphs(body)}
    </div>
  )
}
